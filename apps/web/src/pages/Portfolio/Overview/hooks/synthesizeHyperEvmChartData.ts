import type { PlainMessage } from '@bufbuild/protobuf'
import { type GetPortfolioChartResponse } from '@uniswap/client-data-api/dist/data/v1/api_pb'
import type { HyperliquidPortfolioHistoryPoint } from '~/pages/Portfolio/Perps/hyperliquid/useHyperliquidPortfolioHistory'

/**
 * RigoBlock: chains the Uniswap data API does not index (HyperEVM 999) have no base portfolio
 * chart series, so the overview chart would render nothing even though the Hyperliquid account
 * history + the HyperEVM USDC balance ARE attributable to the chain. Synthesize a zero-valued
 * base series so the extras layer (perps + Core spot USDC + HyperEVM USDC, see
 * useChartDataWithExtras) can draw the line:
 *
 * - With Hyperliquid history: base points sit on the history's own timestamps (value 0), so the
 *   extras reconstruct the historical total and the live tail tracks the polled account value.
 * - Without history (no positions / all-zero buckets): a flat two-point zero base across the
 *   period window, so the current values still render as a flat line instead of no chart.
 *
 * Returns the base chart data unchanged whenever one exists (backend-supported chains) or when
 * nothing attributable can be drawn.
 */
export function synthesizeHyperEvmChartData({
  baseChartData,
  isSelectedChainBackendSupported,
  hyperliquidHistoryForChain,
  hyperliquidHistory,
  fallbackWindow,
}: {
  baseChartData: PlainMessage<GetPortfolioChartResponse> | undefined
  isSelectedChainBackendSupported: boolean
  hyperliquidHistoryForChain: boolean
  hyperliquidHistory: HyperliquidPortfolioHistoryPoint[]
  fallbackWindow: { startSec: number; endSec: number } | undefined
}): PlainMessage<GetPortfolioChartResponse> | undefined {
  if (baseChartData || isSelectedChainBackendSupported) {
    return baseChartData
  }
  if (hyperliquidHistoryForChain && hyperliquidHistory.length > 0) {
    const first = hyperliquidHistory[0]!
    const last = hyperliquidHistory[hyperliquidHistory.length - 1]!
    return {
      points: hyperliquidHistory.map((p) => ({ timestamp: BigInt(p.timestamp), value: 0 })),
      tokens: [],
      pools: [],
      earn: [],
      beginAt: BigInt(first.timestamp),
      endAt: BigInt(last.timestamp),
    }
  }
  if (!fallbackWindow) {
    return undefined
  }
  return {
    points: [
      { timestamp: BigInt(fallbackWindow.startSec), value: 0 },
      { timestamp: BigInt(fallbackWindow.endSec), value: 0 },
    ],
    tokens: [],
    pools: [],
    earn: [],
    beginAt: BigInt(fallbackWindow.startSec),
    endAt: BigInt(fallbackWindow.endSec),
  }
}
