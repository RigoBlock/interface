import { UniverseChainId } from '@universe/chains'
import { useMemo } from 'react'
import { getPrimaryStablecoin, isBackendSupportedChainId } from 'uniswap/src/features/chains/utils'
import { CurrencyInfo } from 'uniswap/src/features/dataApi/types'
import { buildCurrencyInfo } from 'uniswap/src/features/dataApi/utils/buildCurrency'
import { buildCurrencyId } from 'uniswap/src/utils/currencyId'

/**
 * Tokens that are selectable on chains without backend (indexer) support — e.g. HyperEVM.
 * The Uniswap backends do not index these chains, so token lists, trending tokens and
 * search all fail there. Rigoblock smart pools only use the chain's primary stablecoin
 * (always USDC) on such chains, so we expose it from local chain config instead.
 *
 * Accepts a single chain, a list of chains, or null. Non-backend-supported chains yield
 * their locally-configured stablecoin; backend-supported chains and null yield nothing.
 * Callers passing a list should memoize it.
 */
export function useLocalChainTokens(chainFilter: Maybe<UniverseChainId> | UniverseChainId[]): CurrencyInfo[] {
  return useMemo(() => {
    const chains = Array.isArray(chainFilter) ? chainFilter : chainFilter ? [chainFilter] : []
    return chains
      .filter((chainId) => !isBackendSupportedChainId(chainId))
      .flatMap((chainId) => {
        const stablecoin = getPrimaryStablecoin(chainId)
        // oxlint-disable-next-line typescript/no-unnecessary-condition -- getPrimaryStablecoin is typed non-nullable but returns stablecoins[0], which can be undefined at runtime for chains without stablecoin config
        if (!stablecoin) {
          return []
        }
        return [
          buildCurrencyInfo({
            currency: stablecoin,
            currencyId: buildCurrencyId(chainId, stablecoin.address),
            logoUrl: undefined,
            safetyInfo: undefined,
          }),
        ]
      })
  }, [chainFilter])
}
