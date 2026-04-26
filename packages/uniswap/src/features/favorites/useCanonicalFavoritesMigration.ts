import { TokenRankingsResponse, TokenRankingsStat } from '@uniswap/client-explore/dist/uniswap/explore/v1/service_pb'
import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { getNativeAddress } from 'uniswap/src/constants/addresses'
import { normalizeCurrencyIdForMapLookup, normalizeTokenAddressForCache } from 'uniswap/src/data/cache'
import { fromGraphQLChain } from 'uniswap/src/features/chains/utils'
import { selectFavoriteTokens, selectHasMigratedToMultichain } from 'uniswap/src/features/favorites/selectors'
import { setFavoriteTokens, setHasMigratedToMultichain } from 'uniswap/src/features/favorites/slice'
import { buildCurrencyId } from 'uniswap/src/utils/currencyId'

/**
 * Map key is `{chainId}-{normalizedAddress}` to avoid collisions between native tokens
 * on different chains that share the same placeholder address (0xeeee...).
 */
function buildCurrencyIdToCanonicalMap(allTokens: TokenRankingsStat[]): Map<string, string> {
  const map = new Map<string, string>()

  for (const stat of allTokens) {
    // The top-level chain + address is canonical (mainnet when multichain: true)
    const canonicalChainId = fromGraphQLChain(stat.chain)
    // For the canonical CurrencyId, prefer the chainToken matching the canonical chain
    const canonicalChainToken = canonicalChainId
      ? // oxlint-disable-next-line typescript/no-unnecessary-condition -- chainTokens can be undefined at runtime despite protobuf typing
        stat.chainTokens?.find((ct) => ct.chainId === canonicalChainId)
      : undefined
    // Native tokens have empty address in the API — use the EVM native placeholder
    const rawAddress = canonicalChainToken?.address || stat.address
    const canonicalAddress = rawAddress || (canonicalChainId ? getNativeAddress(canonicalChainId) : undefined)

    if (!canonicalChainId || !canonicalAddress) {
      continue
    }

    const canonicalCurrencyId = buildCurrencyId(canonicalChainId, canonicalAddress)

    // oxlint-disable-next-line typescript/no-unnecessary-condition -- chainTokens can be undefined at runtime despite protobuf typing
    for (const ct of stat.chainTokens ?? []) {
      const addr = ct.address || getNativeAddress(ct.chainId)
      if (addr) {
        const key = `${ct.chainId}-${normalizeTokenAddressForCache(addr)}`
        map.set(key, canonicalCurrencyId)
      }
    }

    // Also map the top-level address with canonical chain
    if (canonicalAddress) {
      const key = `${canonicalChainId}-${normalizeTokenAddressForCache(canonicalAddress)}`
      map.set(key, canonicalCurrencyId)
    }
  }

  return map
}

/**
 * Given the TokenRankings response and a list of favorite CurrencyIds, maps each favorite
 * to its canonical CurrencyId and dedupes. Favorites not found in rankings are kept as-is.
 * Exported for testing.
 */
export function canonicalizeFavorites(favoriteIds: string[], tokenRankingsData: TokenRankingsResponse): string[] {
  // Merge tokens from all ranking categories and dedupe by address to ensure comprehensive coverage
  const seenAddresses = new Set<string>()
  const allTokens: TokenRankingsStat[] = []
  for (const category of Object.values(tokenRankingsData.tokenRankings)) {
    for (const token of category.tokens) {
      const key = `${token.chain}-${normalizeTokenAddressForCache(token.address)}`
      if (!seenAddresses.has(key)) {
        seenAddresses.add(key)
        allTokens.push(token)
      }
    }
  }

  const currencyIdToCanonical = buildCurrencyIdToCanonicalMap(allTokens)

  const seen = new Set<string>()
  const result: string[] = []

  for (const currencyId of favoriteIds) {
    const canonical = currencyIdToCanonical.get(normalizeCurrencyIdForMapLookup(currencyId))

    // Use canonical if found, otherwise keep original
    const resolved = canonical ?? currencyId

    // Dedupe by resolved CurrencyId
    const normalizedResolved = normalizeCurrencyIdForMapLookup(resolved)
    if (!seen.has(normalizedResolved)) {
      seen.add(normalizedResolved)
      result.push(resolved)
    }
  }

  return result
}

/**
 * One-time effect that dedupes and canonicalizes favorite tokens when the multichain
 * feature flag is enabled. Runs once per user when FavoriteTokensGrid renders,
 * then sets `hasMigratedToMultichain` so it never re-runs.
 *
 * Uses the TokenRankings ConnectRPC endpoint data (with multichain: true) which provides
 * `chainTokens` — cross-chain address grouping that handles different addresses across chains.
 */
export function useCanonicalFavoritesMigration({
  multichainTokenUxEnabled,
  tokenRankingsData,
}: {
  multichainTokenUxEnabled: boolean
  tokenRankingsData: TokenRankingsResponse | undefined
}): void {
  const dispatch = useDispatch()
  const favoriteTokens = useSelector(selectFavoriteTokens)
  const hasMigrated = useSelector(selectHasMigratedToMultichain)

  useEffect(() => {
    if (!multichainTokenUxEnabled || hasMigrated || favoriteTokens.length === 0 || !tokenRankingsData) {
      return
    }

    const canonicalized = canonicalizeFavorites(favoriteTokens, tokenRankingsData)

    const hasChanges =
      canonicalized.length !== favoriteTokens.length || canonicalized.some((id, i) => id !== favoriteTokens[i])

    if (hasChanges) {
      dispatch(setFavoriteTokens({ currencyIds: canonicalized }))
    }

    dispatch(setHasMigratedToMultichain(true))
  }, [multichainTokenUxEnabled, hasMigrated, favoriteTokens, tokenRankingsData, dispatch])
}
