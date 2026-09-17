import { BigNumber } from '@ethersproject/bignumber'
import { Contract } from '@ethersproject/contracts'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { normalizeTokenAddressForCache } from 'uniswap/src/data/cache'
import { PollingInterval } from 'uniswap/src/constants/misc'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { encodeAbiParameters, getAddress, keccak256, parseAbiParameters } from 'viem'
import { RPC_PROVIDERS } from '~/constants/providers'
import { useGmxMarkets } from '~/pages/Portfolio/Perps/gmx/useGmxMarkets'
import { useGmxOpenPositionMarketData } from '~/pages/Portfolio/Perps/gmx/useGmxOpenPositionMarketData'
import { getStaticTokenDecimals } from '~/pages/Portfolio/Perps/gmx/useGmxTokenDecimals'

/**
 * Claimable GMX funding fees for a RigoBlock smart pool.
 *
 * The pool proxy keeps an enumerable set of tracked GMX markets in storage at a fixed
 * slot (RigoBlock v3-contracts GmxCallbackLib), so the set survives closed positions —
 * a market is removed only after its funding fees are claimed. Because protocol
 * upgrades changed that clearing behavior, EXTRA_CLAIM_MARKETS are scanned in addition
 * to the storage set. For each market we read CLAIMABLE_FUNDING_AMOUNT from the GMX v2
 * DataStore for both the long and the short token.
 */

/** GmxCallbackLib.GMX_CALLBACK_DATA_SLOT */
export const GMX_CALLBACK_DATA_SLOT =
  '0xef0ce2d52a301ad6c6e80df0060b9ecd4dec1ba111fe46b11bf9055649205071'

/**
 * GMX v2 DataStore on Arbitrum (current deployment — the original Aug-2023
 * DataStore 0xFD70de5b200147157461Cf7e72Ee9D35e2D0A264 is no longer deployed).
 */
export const GMX_DATA_STORE_ADDRESS = '0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8'

/** keccak256(abi.encode("CLAIMABLE_FUNDING_AMOUNT")) — matches GMX Keys.sol and
 *  RigoBlock's GmxCallbackLib (keccak256(abi.encode(...)), NOT the raw-string hash). */
export const CLAIMABLE_FUNDING_AMOUNT_KEY = keccak256(
  encodeAbiParameters(parseAbiParameters('string'), ['CLAIMABLE_FUNDING_AMOUNT']),
)

/** The Bytes32Set in GmxCallbackSlot is capped at 128 elements in the protocol */
const MAX_TRACKED_MARKETS = 128

/**
 * Markets always scanned for claimable funding fees IN ADDITION to the pool's
 * tracked-markets storage set. The adapter (AGmxV2.claimFundingFees) prunes a market from
 * the tracked set once it has no active position AND no claimable funding, so any residual
 * on a tracked market is visible here automatically. Left EMPTY by design: untracked
 * markets are ignored by GmxLib (NAV) and should not be claimed through the adapter —
 * only the pool's active (tracked) markets produce valid claim calls.
 */
const EXTRA_CLAIM_MARKETS: string[] = []

/** GMX scales oracle prices by 1e30 */
const GMX_PRICE_SCALE = 10 ** 30

const GMX_DATA_STORE_GET_UINT_ABI = ['function getUint(bytes32 key) view returns (uint256)']

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

export interface GmxClaimableFunding {
  market: string
  token: string
  /** Claimable amount converted to USD via the GMX oracle price (0 if price unavailable) */
  amountUsd: number
  /** Claimable amount in token raw units */
  amountRaw: string
  /** Token symbol when known (for display when no USD price is available) */
  symbol: string
  /** Claimable amount formatted in token units (for display when no USD price is available) */
  amountText: string
}

/** Formats a token-unit amount for display when no reliable USD price exists. */
function formatClaimAmount(value: number): string {
  if (!Number.isFinite(value)) {
    return '0'
  }
  return value.toLocaleString(undefined, { maximumSignificantDigits: 6 })
}

/** Base slot of the trackedMarkets.values array: keccak256(bytes32(GMX_CALLBACK_DATA_SLOT)). */
export function computeTrackedMarketsBaseSlot(): bigint {
  return BigInt(keccak256(GMX_CALLBACK_DATA_SLOT))
}

/** Element i of a Solidity dynamic array lives at baseSlot + i. */
export function computeTrackedMarketSlot(index: number): bigint {
  return computeTrackedMarketsBaseSlot() + BigInt(index)
}

/** Elements of trackedMarkets.values are bytes32(left-padded market address). */
export function trackedMarketWordToAddress(word: string): string | undefined {
  if (word.length < 66) {
    return undefined
  }
  const address = normalizeTokenAddressForCache(`0x${word.slice(26)}`)
  return address === ZERO_ADDRESS ? undefined : address
}

/** DataStore key for the claimable funding fee of (market, token, account).
 *  Must use standard abi.encode (32-byte padded words) exactly like GMX Keys.sol:
 *  keccak256(abi.encode(CLAIMABLE_FUNDING_AMOUNT, market, token, account)) — NOT
 *  abi.encodePacked, which keeps addresses at 20 bytes and hashes to a different key. */
export function computeClaimableFundingAmountKey({
  market,
  token,
  account,
}: {
  market: string
  token: string
  account: string
}): string {
  return keccak256(
    encodeAbiParameters(parseAbiParameters('bytes32, address, address, address'), [
      CLAIMABLE_FUNDING_AMOUNT_KEY,
      getAddress(market),
      getAddress(token),
      getAddress(account),
    ]),
  )
}

async function fetchTrackedGmxMarkets(poolAddress: string): Promise<string[]> {
  const provider = RPC_PROVIDERS[UniverseChainId.ArbitrumOne]
  const countWord = await provider.getStorageAt(poolAddress, GMX_CALLBACK_DATA_SLOT)
  const count = Math.min(Number(BigInt(countWord)), MAX_TRACKED_MARKETS)
  const words = await Promise.all(
    Array.from({ length: count }, (_, index) =>
      provider.getStorageAt(poolAddress, computeTrackedMarketSlot(index)),
    ),
  )
  return words
    .map(trackedMarketWordToAddress)
    .filter((address): address is string => address !== undefined)
}

interface GmxClaimTarget {
  market: string
  token: string
}

async function fetchClaimableFundingAmounts({
  poolAddress,
  targets,
}: {
  poolAddress: string
  targets: GmxClaimTarget[]
}): Promise<Record<string, string>> {
  const provider = RPC_PROVIDERS[UniverseChainId.ArbitrumOne]
  const dataStore = new Contract(GMX_DATA_STORE_ADDRESS, GMX_DATA_STORE_GET_UINT_ABI, provider)
  const entries = await Promise.all(
    targets.map(async (target) => {
      const key = computeClaimableFundingAmountKey({
        market: target.market,
        token: target.token,
        account: poolAddress,
      })
      const amount = (await dataStore.getUint(key)) as BigNumber
      return [`${target.market}-${target.token}`, amount.toString()] as const
    }),
  )
  return Object.fromEntries(entries)
}

/**
 * Resolves the pool's claimable GMX funding fees (including fees from already-closed
 * positions, since tracked markets are only untracked after claiming). Reads are plain
 * eth_getStorageAt / eth_call against the standard Arbitrum provider; no wallet needed.
 */
export function useGmxClaimableFundingFees(
  poolAddress?: string,
  enabled = true,
): {
  claims: GmxClaimableFunding[]
  totalClaimableUsd: number
  isLoading: boolean
  isError: boolean
} {
  const normalizedPoolAddress = poolAddress ? normalizeTokenAddressForCache(poolAddress) : undefined

  const { marketsByAddressIncludingUnlisted, isLoading: isLoadingMarkets } = useGmxMarkets()
  const { pricesByTokenAddress, tokensByAddress, isLoading: isLoadingMarketData } =
    useGmxOpenPositionMarketData({ enabled })

  const {
    data: trackedMarkets,
    isLoading: isLoadingTrackedMarkets,
    isError: isErrorTrackedMarkets,
  } = useQuery({
    queryKey: ['gmxTrackedMarkets', normalizedPoolAddress],
    queryFn: () => fetchTrackedGmxMarkets(normalizedPoolAddress!),
    enabled: enabled && !!normalizedPoolAddress,
    staleTime: PollingInterval.Fast,
    retry: 2,
  })

  // Union of the pool's tracked markets (from proxy storage) and the extra markets:
  // residual claimables can survive on markets the storage set no longer (or never did) track.
  const allMarkets = useMemo(() => {
    const combined = [...(trackedMarkets ?? []), ...EXTRA_CLAIM_MARKETS.map((m) => normalizeTokenAddressForCache(m))]
    return [...new Set(combined)]
  }, [trackedMarkets])

  // Pair each market with its long and short token (deduped), as GmxLib does.
  // Claimables are resolved against ALL markets (including unlisted ones): fees can
  // linger on tracked markets whose listing was removed after the position closed.
  const claimTargets = useMemo(() => {
    const targets: GmxClaimTarget[] = []
    for (const market of allMarkets) {
      const marketInfo = marketsByAddressIncludingUnlisted.get(market)
      if (!marketInfo) {
        continue
      }
      for (const token of [marketInfo.longToken, marketInfo.shortToken]) {
        const normalizedToken = normalizeTokenAddressForCache(token)
        if (!targets.some((target) => target.market === market && target.token === normalizedToken)) {
          targets.push({ market, token: normalizedToken })
        }
      }
    }
    return targets
  }, [allMarkets, marketsByAddressIncludingUnlisted])

  const {
    data: amountsByTarget,
    isLoading: isLoadingAmounts,
    isError: isErrorAmounts,
  } = useQuery({
    queryKey: ['gmxClaimableFundingFees', normalizedPoolAddress, claimTargets],
    queryFn: () => fetchClaimableFundingAmounts({ poolAddress: normalizedPoolAddress!, targets: claimTargets }),
    enabled: enabled && !!normalizedPoolAddress && claimTargets.length > 0,
    staleTime: PollingInterval.Fast,
    retry: 2,
  })

  const claims = useMemo(() => {
    return claimTargets.flatMap((target): GmxClaimableFunding[] => {
      const amountRaw = amountsByTarget?.[`${target.market}-${target.token}`]
      if (!amountRaw) {
        return []
      }
      let amount: bigint
      try {
        amount = BigInt(amountRaw)
      } catch {
        return []
      }
      if (amount <= 0n) {
        return []
      }
      const tokenInfo = tokensByAddress.get(target.token)
      const decimals = tokenInfo?.decimals ?? getStaticTokenDecimals(target.token) ?? 18
      const priceTicker = pricesByTokenAddress.get(target.token)
      const priceRaw = priceTicker?.maxPrice || priceTicker?.minPrice
      const priceUsd = priceRaw ? Number(BigInt(priceRaw)) / GMX_PRICE_SCALE : undefined
      const amountUsd = priceUsd === undefined ? 0 : (Number(amount) / 10 ** decimals) * priceUsd
      const symbol = tokenInfo?.symbol ?? `${target.token.slice(0, 6)}…${target.token.slice(-4)}`
      return [
        {
          market: target.market,
          token: target.token,
          amountUsd,
          amountRaw,
          symbol,
          amountText: formatClaimAmount(Number(amount) / 10 ** decimals),
        },
      ]
    })
  }, [claimTargets, amountsByTarget, tokensByAddress, pricesByTokenAddress])

  const totalClaimableUsd = useMemo(
    () => claims.reduce((acc, claim) => acc + claim.amountUsd, 0),
    [claims],
  )

  return {
    claims,
    totalClaimableUsd,
    isLoading: isLoadingMarkets || isLoadingMarketData || isLoadingTrackedMarkets || isLoadingAmounts,
    isError: isErrorTrackedMarkets || isErrorAmounts,
  }
}
