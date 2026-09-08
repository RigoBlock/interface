import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { normalizeTokenAddressForCache } from 'uniswap/src/data/cache'
import { hlInfoApi } from '~/pages/Portfolio/Perps/hyperliquid/hyperliquidApi'

const HISTORY_STALE_TIME_MS = 30 * 60 * 1000
const HISTORY_GC_TIME_MS = 60 * 60 * 1000

/** Bucket names returned by the Hyperliquid `portfolio` info endpoint. */
type HlPortfolioBucket = 'day' | 'week' | 'month' | 'allTime' | 'perpDay' | 'perpWeek' | 'perpMonth' | 'perpAllTime'

interface HlPortfolioBucketData {
  /** [timestampMs, accountValueUsd] samples (decimal string USD). */
  accountValueHistory: [number, string][]
}

export interface HyperliquidPortfolioHistoryPoint {
  /** Seconds since epoch. */
  timestamp: number
  /** Combined (spot + perp) account value in USD. */
  valueUsd: number
}

const PLAIN_BUCKETS = ['day', 'week', 'month', 'allTime'] as const
const PERP_BUCKETS = ['perpDay', 'perpWeek', 'perpMonth', 'perpAllTime'] as const

/**
 * Merge the samples of several buckets into a single exact-match map. Buckets overlap
 * in time but agree at shared timestamps, so a plain Map keyed by timestamp suffices.
 */
function mergeBucketSamples(
  byBucket: Map<string, HlPortfolioBucketData>,
  names: readonly HlPortfolioBucket[],
): Map<number, number> {
  const samples = new Map<number, number>()
  for (const name of names) {
    for (const [tsMs, value] of byBucket.get(name)?.accountValueHistory ?? []) {
      samples.set(tsMs, parseFloat(value) || 0)
    }
  }
  return samples
}

/**
 * Combined spot + perp account value history from the Hyperliquid `portfolio` info
 * endpoint. The endpoint returns 8 buckets (day/week/month/allTime × spot/perp) with
 * ~11 samples each; plain and perp samples are summed pointwise and the union of all
 * four time ranges gives the finest available granularity. Between samples the value
 * is forward-filled by consumers. Returns [] when the endpoint reports only zeros
 * (the chart then falls back to the flat current value, see Overview).
 */
async function fetchHlPortfolioHistory(user: string): Promise<HyperliquidPortfolioHistoryPoint[]> {
  const buckets = await hlInfoApi<[HlPortfolioBucket, HlPortfolioBucketData][]>({ type: 'portfolio', account: user })
  const byBucket = new Map<string, HlPortfolioBucketData>(buckets)

  const plain = mergeBucketSamples(byBucket, PLAIN_BUCKETS)
  const perp = mergeBucketSamples(byBucket, PERP_BUCKETS)

  // Union of every sample timestamp across both sides; forward-fill each side.
  const timestamps = [...new Set([...plain.keys(), ...perp.keys()])].sort((a, b) => a - b)
  const points: HyperliquidPortfolioHistoryPoint[] = []
  let plainValue = 0
  let perpValue = 0
  for (const tsMs of timestamps) {
    plainValue = plain.get(tsMs) ?? plainValue
    perpValue = perp.get(tsMs) ?? perpValue
    points.push({ timestamp: Math.floor(tsMs / 1000), valueUsd: plainValue + perpValue })
  }

  // The API returns zero-filled buckets for accounts it has no history for — treat
  // those as "no history" so the chart falls back to the flat current value.
  if (points.every((p) => p.valueUsd === 0)) {
    return []
  }
  return points
}

/**
 * Historical (spot + perp) account value for a Hyperliquid account, from the
 * Hyperliquid `portfolio` info endpoint. Points are irregularly spaced (~11 per
 * bucket); consumers should forward-fill (see Overview chart assembly).
 */
export function useHyperliquidPortfolioHistory(address?: string): {
  history: HyperliquidPortfolioHistoryPoint[]
  isLoading: boolean
  isError: boolean
} {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['hyperliquidPortfolioHistory', address ? normalizeTokenAddressForCache(address) : undefined],
    queryFn: () => fetchHlPortfolioHistory(address!),
    enabled: !!address,
    staleTime: HISTORY_STALE_TIME_MS,
    gcTime: HISTORY_GC_TIME_MS,
    retry: 2,
    // Historical values don't need refreshes.
    refetchOnWindowFocus: false,
  })

  const history = useMemo(() => data ?? [], [data])

  return { history, isLoading, isError }
}
