import type { PlainMessage } from '@bufbuild/protobuf'
import { ChartPeriod, type GetPortfolioChartResponse } from '@uniswap/client-data-api/dist/data/v1/api_pb'
import { useMemo } from 'react'

// Fallback chart window for non-backend-supported chains (HyperEVM), by chart period. Only
// HOUR–MONTH are actually used (candle reconstruction); YEAR/MAX use the Hyperliquid `portfolio`
// endpoint buckets, which need no window.
const CHART_PERIOD_WINDOW_SECONDS: Partial<Record<ChartPeriod, number>> = {
  [ChartPeriod.HOUR]: 60 * 60,
  [ChartPeriod.DAY]: 24 * 60 * 60,
  [ChartPeriod.WEEK]: 7 * 24 * 60 * 60,
  [ChartPeriod.MONTH]: 30 * 24 * 60 * 60,
  [ChartPeriod.YEAR]: 365 * 24 * 60 * 60,
  [ChartPeriod.MAX]: 365 * 24 * 60 * 60,
}

/**
 * RigoBlock: resolves the overview chart windows. Backend-supported chains use the data API
 * series' [beginAt, endAt] window. A non-backend-supported chain (HyperEVM 999) has no base
 * series at all: the window falls back to the selected period ending at first render
 * (memoized on the period so the candle query key stays stable across renders — a rolling
 * wall-clock window would refetch every render), which also unblocks the Hyperliquid candle
 * reconstruction that is otherwise disabled without a window.
 *
 * `chartWindow` is the BASE chart's window only (undefined without a base series) — GMX candle
 * history must stay pinned to it; `fallbackChartWindow` additionally carries the fallback for
 * the Hyperliquid history.
 */
export function useHyperEvmChartWindow({
  chartDataForSelectedChain,
  isSelectedChainBackendSupported,
  selectedPeriod,
}: {
  chartDataForSelectedChain: PlainMessage<GetPortfolioChartResponse> | undefined
  isSelectedChainBackendSupported: boolean
  selectedPeriod: ChartPeriod
}): {
  chartWindow: { startSec: number; endSec: number } | undefined
  fallbackChartWindow: { startSec: number; endSec: number } | undefined
} {
  const chartWindow = useMemo(() => {
    const beginAt = chartDataForSelectedChain?.beginAt
    const endAt = chartDataForSelectedChain?.endAt
    if (!beginAt || !endAt) {
      return undefined
    }
    return { startSec: Number(beginAt), endSec: Number(endAt) }
  }, [chartDataForSelectedChain?.beginAt, chartDataForSelectedChain?.endAt])

  const fallbackChartWindow = useMemo(() => {
    if (chartWindow || isSelectedChainBackendSupported) {
      return undefined
    }
    const periodSec = CHART_PERIOD_WINDOW_SECONDS[selectedPeriod] ?? CHART_PERIOD_WINDOW_SECONDS[ChartPeriod.DAY]!
    const endSec = Math.floor(Date.now() / 1000)
    return { startSec: endSec - periodSec, endSec }
  }, [chartWindow, isSelectedChainBackendSupported, selectedPeriod])

  return { chartWindow, fallbackChartWindow }
}
