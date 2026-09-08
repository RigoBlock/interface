import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { normalizeTokenAddressForCache } from 'uniswap/src/data/cache'
import {
  buildHyperliquidAccount,
  fetchHlAccountState,
  fetchHlAllMids,
  fetchHlMeta,
  HlMeta,
  HlPerpAsset,
  HyperliquidAccount,
} from '~/pages/Portfolio/Perps/hyperliquid/hyperliquidApi'

/** Account state (clearinghouseState + spot USDC) refreshes every 5s. */
const HL_ACCOUNT_POLLING_INTERVAL_MS = 5_000
const HL_ACCOUNT_STALE_TIME_MS = 1_000
/** Market metadata is effectively static — cache it for an hour. */
const HL_META_CACHE_TIME_MS = 60 * 60_000
/** Mid prices refresh every 5s and are shared with the open-position form (one fetch). */
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
 * Core info API: perp account value, withdrawable, Core spot USDC, and open positions.
 * Only the two account-specific calls (clearinghouseState + spotClearinghouseState)
 * are polled every 5s; meta is cached for an hour and mids share a single 5s query.
 */
export function useHyperliquidAccount(address?: string): UseHyperliquidAccountResult {
  const { data: meta, isLoading: isLoadingMeta } = useHyperliquidMeta()
  const { data: mids } = useHyperliquidMids()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['hyperliquidAccount', address ? normalizeTokenAddressForCache(address) : undefined],
    queryFn: () => fetchHlAccountState(address!),
    enabled: !!address,
    refetchInterval: HL_ACCOUNT_POLLING_INTERVAL_MS,
    staleTime: HL_ACCOUNT_STALE_TIME_MS,
    retry: 2,
    refetchOnWindowFocus: true,
  })

  return useMemo(() => {
    if (!data) {
      return { ...EMPTY_ACCOUNT, isLoading, isError }
    }
    return {
      ...buildHyperliquidAccount({ clearinghouse: data.clearinghouse, spotUsdcBalanceUsd: data.spotUsdcBalanceUsd, meta, mids }),
      // Positions need meta (asset index / size decimals) — stay in loading state until it resolves.
      isLoading: isLoadingMeta,
      isError,
    }
  }, [data, meta, mids, isLoading, isLoadingMeta, isError])
}

/**
 * Perp market metadata (universe); asset index = array index. Markets change
 * rarely, so a long stale time is fine.
 */
export function useHyperliquidMeta(): {
  universe: HlPerpAsset[]
  isLoading: boolean
  isError: boolean
  /** Raw query data, undefined while loading — consumers assembling positions need this. */
  data: HlMeta | undefined
} {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['hyperliquidMeta'],
    queryFn: fetchHlMeta,
    staleTime: HL_META_CACHE_TIME_MS,
    gcTime: HL_META_CACHE_TIME_MS,
    retry: 2,
  })

  return useMemo(
    () => ({ universe: data?.universe ?? [], isLoading, isError, data }),
    [data, isError, isLoading],
  )
}

/** Current mid prices keyed by coin; refreshes every 5s. */
export function useHyperliquidMids(): {
  mids: Record<string, string>
  isLoading: boolean
  isError: boolean
  /** Raw query data, undefined while loading — consumers assembling positions need this. */
  data: Record<string, string> | undefined
} {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['hyperliquidMids'],
    queryFn: fetchHlAllMids,
    refetchInterval: HL_MIDS_POLLING_INTERVAL_MS,
    staleTime: HL_ACCOUNT_STALE_TIME_MS,
    retry: 2,
  })

  return useMemo(() => ({ mids: data ?? {}, isLoading, isError, data }), [data, isError, isLoading])
}
