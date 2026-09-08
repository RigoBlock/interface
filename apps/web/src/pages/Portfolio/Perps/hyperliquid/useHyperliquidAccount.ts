import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { normalizeTokenAddressForCache } from 'uniswap/src/data/cache'
import {
  fetchHlAllMids,
  fetchHlMeta,
  fetchHyperliquidAccount,
  HlPerpAsset,
  HyperliquidAccount,
} from '~/pages/Portfolio/Perps/hyperliquid/hyperliquidApi'

/** Refresh open positions / account values every 2s so the UI tracks the market closely. */
const HL_ACCOUNT_POLLING_INTERVAL_MS = 2_000
const HL_ACCOUNT_STALE_TIME_MS = 1_000
const HL_META_CACHE_TIME_MS = 5 * 60_000
const HL_MIDS_POLLING_INTERVAL_MS = 5_000

export interface UseHyperliquidAccountResult extends HyperliquidAccount {
  isLoading: boolean
  isError: boolean
}

const EMPTY_ACCOUNT: HyperliquidAccount = {
  perpsAccountValueUsd: 0,
  totalNtlPosUsd: 0,
  withdrawableUsd: 0,
  spotUsdcBalanceUsd: 0,
  positions: [],
}

/**
 * Fetches the Hyperliquid Core account state for an address (the vault) from the
 * Core info API: perp account value, withdrawable, Core spot USDC, and open
 * positions with mark prices from allMids. Refreshes every 2s.
 */
export function useHyperliquidAccount(address?: string): UseHyperliquidAccountResult {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['hyperliquidAccount', address ? normalizeTokenAddressForCache(address) : undefined],
    queryFn: () => fetchHyperliquidAccount(address!),
    enabled: !!address,
    refetchInterval: HL_ACCOUNT_POLLING_INTERVAL_MS,
    staleTime: HL_ACCOUNT_STALE_TIME_MS,
    retry: 2,
    refetchOnWindowFocus: true,
  })

  return useMemo(
    () => ({ ...(data ?? EMPTY_ACCOUNT), isLoading, isError }),
    [data, isLoading, isError],
  )
}

/**
 * Perp market metadata (universe); asset index = array index. Markets change
 * rarely, so a long stale time is fine.
 */
export function useHyperliquidMeta(): { universe: HlPerpAsset[]; isLoading: boolean; isError: boolean } {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['hyperliquidMeta'],
    queryFn: fetchHlMeta,
    staleTime: HL_META_CACHE_TIME_MS,
    gcTime: HL_META_CACHE_TIME_MS,
    retry: 2,
  })

  return useMemo(() => ({ universe: data?.universe ?? [], isLoading, isError }), [data, isError, isLoading])
}

/** Current mid prices keyed by coin; refreshes every 5s. */
export function useHyperliquidMids(): { mids: Record<string, string>; isLoading: boolean; isError: boolean } {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['hyperliquidMids'],
    queryFn: fetchHlAllMids,
    refetchInterval: HL_MIDS_POLLING_INTERVAL_MS,
    staleTime: HL_ACCOUNT_STALE_TIME_MS,
    retry: 2,
  })

  return useMemo(() => ({ mids: data ?? {}, isLoading, isError }), [data, isError, isLoading])
}
