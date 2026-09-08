import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { normalizeTokenAddressForCache } from 'uniswap/src/data/cache'

/** GMX team's Subsquid indexer (same source as the official gmx-interface account PnL chart) */
const GMX_SUBSQUID_API_URL = 'https://gmx.squids.live/gmx-synthetics-arbitrum:prod/api/graphql'

/** The indexer reports USD values at 1e30 scale (same as the GMX v2 positions API) */
const GMX_USD_SCALE = 1e30

const HISTORY_STALE_TIME_MS = 5 * 60 * 1000
const HISTORY_GC_TIME_MS = 30 * 60 * 1000

interface GmxPnlHistoryResponse {
  data?: {
    accountPnlHistoryStats?: { timestamp: number; pnl: string; cumulativePnl: string }[]
  }
  errors?: { message: string }[]
}

export interface GmxPnlHistoryPoint {
  /** Seconds since epoch (daily granularity) */
  timestamp: number
  cumulativePnlUsd: number
}

function rawToUsd(value?: string): number {
  if (!value) {
    return 0
  }
  try {
    return Number(BigInt(value)) / GMX_USD_SCALE
  } catch {
    return 0
  }
}

async function fetchGmxPnlHistory(address: string): Promise<GmxPnlHistoryPoint[]> {
  const response = await fetch(GMX_SUBSQUID_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      query: `query AccountPnlHistory($account: String!) {
        accountPnlHistoryStats(account: $account) { timestamp pnl cumulativePnl }
      }`,
      variables: { account: normalizeTokenAddressForCache(address) },
    }),
  })
  if (!response.ok) {
    throw new Error(`GMX pnl history request failed: ${response.status} ${response.statusText}`)
  }
  const json = (await response.json()) as GmxPnlHistoryResponse
  if (json.errors?.length) {
    throw new Error(`GMX pnl history query error: ${json.errors[0]?.message ?? 'unknown'}`)
  }
  const stats = json.data?.accountPnlHistoryStats ?? []
  return stats
    .map((row) => ({ timestamp: row.timestamp, cumulativePnlUsd: rawToUsd(row.cumulativePnl) }))
    .sort((a, b) => a.timestamp - b.timestamp)
}

/**
 * Daily cumulative PnL history for an account on GMX v2 (Arbitrum), from the GMX Subsquid
 * indexer. Combined with the current account value it yields a historical account-value
 * series (see Overview chart assembly); granularity is daily, so intra-day chart points
 * reuse the latest daily figure.
 */
export function useGmxPnlHistory(address?: string): {
  history: GmxPnlHistoryPoint[]
  isLoading: boolean
  isError: boolean
} {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['gmxPnlHistory', address ? normalizeTokenAddressForCache(address) : undefined],
    queryFn: () => fetchGmxPnlHistory(address!),
    enabled: !!address,
    staleTime: HISTORY_STALE_TIME_MS,
    gcTime: HISTORY_GC_TIME_MS,
    retry: 2,
    refetchOnWindowFocus: true,
  })

  const history = useMemo(() => data ?? [], [data])

  return { history, isLoading, isError }
}
