import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { PollingInterval } from 'uniswap/src/constants/misc'
import { UniverseChainId } from 'uniswap/src/features/chains/types'

/** GMX v2 is only deployed on Arbitrum */
export const GMX_CHAIN_ID = UniverseChainId.ArbitrumOne

const GMX_POSITIONS_API_URL = 'https://arbitrum.gmxapi.io/v1/positions'

/** GMX scales all USD values by 1e30 */
const GMX_USD_SCALE = 1e30
/** GMX scales leverage by 1e4 */
const GMX_LEVERAGE_SCALE = 10_000

/** Raw position shape returned by the GMX v2 HTTP API (fields may be missing on malformed entries) */
interface GmxApiPosition {
  marketAddress: string
  collateralTokenAddress: string
  indexName?: string
  poolName?: string
  isLong: boolean
  sizeInUsd?: string
  sizeInTokens?: string
  collateralAmount?: string
  pnl?: string
  pnlPercentage?: string
  pnlAfterFees?: string
  pnlAfterFeesPercentage?: string
  pnlAfterAllFees?: string
  pnlAfterAllFeesPercentage?: string
  netValue?: string
  netValueAfterAllFees?: string
  leverage?: string
  markPrice?: string
  entryPrice?: string
  liquidationPrice?: string
  hasLowCollateral?: boolean
}

export interface GmxPosition {
  marketAddress: string
  collateralTokenAddress: string
  /** Human-readable market name from the API, e.g. "ETH/USD" */
  indexName: string
  /** Human-readable GMX pool name, e.g. "ETH/USD [WETH-USDC]" */
  poolName: string
  isLong: boolean
  /** Position size in USD */
  sizeUsd: number
  /** Position equity (collateral + unrealized PnL - fees) in USD */
  netValueUsd: number
  /** Estimated collateral in USD (net value minus unrealized PnL) */
  collateralUsd: number
  leverage: number
  entryPrice: number
  markPrice: number
  liquidationPrice?: number
  /** Unrealized PnL after all fees, in USD */
  unrealizedPnlUsd: number
  /** Unrealized PnL after all fees, in percent (e.g. 5.23 for 5.23%) */
  unrealizedPnlPercent: number
  /** Raw values (GMX scales) needed to build orders */
  sizeInUsdRaw: string
  collateralAmountRaw: string
  markPriceRaw: string
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

function normalizePosition(position: GmxApiPosition): GmxPosition {
  const netValueUsd = rawToUsd(position.netValue)
  const unrealizedPnlUsd = rawToUsd(position.pnlAfterAllFees ?? position.pnl)
  const liquidationPrice = rawToUsd(position.liquidationPrice)
  return {
    marketAddress: position.marketAddress,
    collateralTokenAddress: position.collateralTokenAddress,
    indexName: position.indexName ?? '',
    poolName: position.poolName ?? '',
    isLong: position.isLong,
    sizeUsd: rawToUsd(position.sizeInUsd),
    netValueUsd,
    collateralUsd: netValueUsd - unrealizedPnlUsd,
    leverage: Number(position.leverage ?? '0') / GMX_LEVERAGE_SCALE,
    entryPrice: rawToUsd(position.entryPrice),
    markPrice: rawToUsd(position.markPrice),
    liquidationPrice: liquidationPrice > 0 ? liquidationPrice : undefined,
    unrealizedPnlUsd,
    unrealizedPnlPercent: Number(position.pnlAfterAllFeesPercentage ?? '0') / 100,
    sizeInUsdRaw: position.sizeInUsd ?? '0',
    collateralAmountRaw: position.collateralAmount ?? '0',
    markPriceRaw: position.markPrice ?? '0',
  }
}

async function fetchGmxPositions(address: string): Promise<GmxApiPosition[]> {
  const response = await fetch(`${GMX_POSITIONS_API_URL}?address=${address.toLowerCase()}`, {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    throw new Error(`GMX positions request failed: ${response.status} ${response.statusText}`)
  }
  const data = (await response.json()) as GmxApiPosition[] | null
  return data ?? []
}

/**
 * Fetches open GMX v2 perpetual positions for an address on Arbitrum from the
 * GMX HTTP API (single request, full computed position data). Refreshes regularly.
 * Same approach as the reference implementation in RigoBlock/agentic-operator.
 */
export function useGmxPositions(address?: string): {
  positions: GmxPosition[]
  /** Sum of position equities (collateral + unrealized PnL - fees), in USD */
  totalNetValueUsd: number
  totalUnrealizedPnlUsd: number
  isLoading: boolean
  isError: boolean
} {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['gmxPositions', address?.toLowerCase()],
    queryFn: () => fetchGmxPositions(address!),
    enabled: !!address,
    refetchInterval: PollingInterval.KindaFast,
    staleTime: PollingInterval.Fast,
    retry: 2,
    refetchOnWindowFocus: true,
  })

  const positions = useMemo(
    () =>
      (data ?? [])
        .filter((position) => {
          try {
            return BigInt(position.sizeInUsd ?? '0') > 0n
          } catch {
            return false
          }
        })
        .map(normalizePosition),
    [data],
  )

  const totalNetValueUsd = useMemo(
    () => positions.reduce((acc, position) => acc + position.netValueUsd, 0),
    [positions],
  )
  const totalUnrealizedPnlUsd = useMemo(
    () => positions.reduce((acc, position) => acc + position.unrealizedPnlUsd, 0),
    [positions],
  )

  return {
    positions,
    totalNetValueUsd,
    totalUnrealizedPnlUsd,
    isLoading,
    isError,
  }
}
