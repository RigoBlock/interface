import { PlainMessage } from '@bufbuild/protobuf'
import { GetPortfolioChartResponse } from '@uniswap/client-data-api/dist/data/v1/api_pb'
import { useMemo } from 'react'
import { GmxPnlHistoryPoint } from '~/pages/Portfolio/hooks/useGmxPnlHistory'
import { GmxValueHistoryPoint } from '~/pages/Portfolio/hooks/useGmxValueHistory'
import { HyperliquidPortfolioHistoryPoint } from '~/pages/Portfolio/Perps/hyperliquid/useHyperliquidPortfolioHistory'

// Historical account value at a timestamp, given daily cumulative-PnL points. Before the
// first point the first bucket's cumulative value applies; with no history (or no current
// value) the flat current value is used. (YEAR/MAX GMX only.)
function valueFromPnlHistory({
  currentValue,
  history,
  timestampSec,
}: {
  currentValue: number
  history: { timestamp: number; cumulativePnlUsd: number }[]
  timestampSec: number
}): number {
  if (history.length === 0 || currentValue === 0) {
    return currentValue
  }
  const cumulativeNow = history[history.length - 1]?.cumulativePnlUsd ?? 0
  let cumulativeAtT = history[0]?.cumulativePnlUsd ?? 0
  for (const point of history) {
    if (point.timestamp <= timestampSec) {
      cumulativeAtT = point.cumulativePnlUsd
    } else {
      break
    }
  }
  return currentValue - (cumulativeNow - cumulativeAtT)
}

// Historical account value at a timestamp from absolute portfolio-history points:
// 0 before the first sample (the account did not exist yet), forward-filled after.
// When liveTailValue is given, timestamps at or after the last sample use it instead
// of the frozen forward-fill so the end of the line moves with the live value.
function valueFromHistory({
  history,
  timestampSec,
  liveTailValue,
}: {
  history: { timestamp: number; valueUsd: number }[]
  timestampSec: number
  liveTailValue?: number
}): number {
  if (history.length > 0 && liveTailValue !== undefined && timestampSec >= history[history.length - 1]!.timestamp) {
    return liveTailValue
  }
  let value = 0
  for (const point of history) {
    if (point.timestamp <= timestampSec) {
      value = point.valueUsd
    } else {
      break
    }
  }
  return value
}

/**
 * Adds the value sources the base chart doesn't cover (staking, GMX perps, Hyperliquid
 * perps + Core spot USDC, HyperEVM USDC) to the historical portfolio chart series.
 *
 * The historical chart data only covers token balances. Staking and the HyperEVM USDC
 * balance have no history, so they are bootstrapped flatly at the current value. For
 * HOUR/DAY/WEEK/MONTH, GMX and Hyperliquid historical values are reconstructed from
 * per-coin candle closes at the chart's own interval granularity; both are pinned to
 * the base chart's [beginAt, endAt] window and anchored to the live account value at
 * fetch time, so retrieved history stays aligned with the base series and never rolls
 * with wall-clock time. For YEAR/MAX, GMX uses its daily cumulative-PnL history from
 * the Subsquid indexer (currentValue − (cumulativePnlNow − cumulativePnl(t))) and
 * Hyperliquid the absolute account value history from the `portfolio` endpoint. At or
 * after the last history sample the LIVE values are used instead of the frozen
 * forward-fill (both poll every 5s), so the end of the line tracks unrealized PnL in
 * real time while history stays fixed. When a source reports no history at all, its
 * current value is bootstrapped flatly instead.
 */
export function useChartDataWithExtras({
  portfolioChartData,
  stakingValueStable,
  gmxTotalNetValueUsd,
  gmxPnlHistory,
  gmxValueHistory,
  isCandlePeriod,
  hyperliquidPerpsValue,
  hyperliquidHistory,
  hyperliquidSpotValue,
  hyperEvmUsdcValue,
}: {
  portfolioChartData: PlainMessage<GetPortfolioChartResponse> | undefined
  stakingValueStable: number
  gmxTotalNetValueUsd: number
  gmxPnlHistory: GmxPnlHistoryPoint[]
  gmxValueHistory: GmxValueHistoryPoint[]
  isCandlePeriod: boolean
  hyperliquidPerpsValue: number
  hyperliquidHistory: HyperliquidPortfolioHistoryPoint[]
  hyperliquidSpotValue: number
  hyperEvmUsdcValue: number
}): PlainMessage<GetPortfolioChartResponse> | undefined {
  return useMemo(() => {
    if (!portfolioChartData?.points) {
      return portfolioChartData
    }
    const stakingExtra = isNaN(stakingValueStable) ? 0 : stakingValueStable
    const hyperliquidFlatExtra = [hyperliquidSpotValue, hyperEvmUsdcValue].reduce(
      (acc, value) => acc + (isNaN(value) ? 0 : value),
      0,
    )
    const gmxExtra = isNaN(gmxTotalNetValueUsd) ? 0 : gmxTotalNetValueUsd
    const hlPerpsExtra = isNaN(hyperliquidPerpsValue) ? 0 : hyperliquidPerpsValue
    // Live Hyperliquid tail = live perps value + live Core spot USDC, matching the
    // spot+perp semantics of the history samples.
    const hlLiveTail = hlPerpsExtra + (isNaN(hyperliquidSpotValue) ? 0 : hyperliquidSpotValue)

    const hasExtras = stakingExtra !== 0 || hyperliquidFlatExtra !== 0 || gmxExtra !== 0 || hlPerpsExtra !== 0
    if (!hasExtras) {
      return portfolioChartData
    }
    return {
      ...portfolioChartData,
      points: portfolioChartData.points.map((point) => {
        const timestampSec = Number(point.timestamp)
        const hlExtra =
          hyperliquidHistory.length > 0
            ? valueFromHistory({ history: hyperliquidHistory, timestampSec, liveTailValue: hlLiveTail })
            : // No portfolio history: spot is already in hyperliquidFlatExtra, add perps only.
              hlPerpsExtra
        const gmxValue = isCandlePeriod
          ? gmxValueHistory.length > 0
            ? // Candle-based reconstruction: live GMX total net value after the last sample.
              valueFromHistory({ history: gmxValueHistory, timestampSec, liveTailValue: gmxExtra })
            : // No candle history (no positions / still loading): flat current value.
              gmxExtra
          : // YEAR/MAX: daily cumulative-PnL reconstruction.
            valueFromPnlHistory({ currentValue: gmxExtra, history: gmxPnlHistory, timestampSec })
        return {
          timestamp: point.timestamp,
          value:
            point.value +
            stakingExtra +
            (hyperliquidHistory.length > 0 ? hyperEvmUsdcValue : hyperliquidFlatExtra) +
            gmxValue +
            hlExtra,
        }
      }),
    }
  }, [
    portfolioChartData,
    stakingValueStable,
    gmxTotalNetValueUsd,
    gmxPnlHistory,
    gmxValueHistory,
    isCandlePeriod,
    hyperliquidPerpsValue,
    hyperliquidHistory,
    hyperliquidSpotValue,
    hyperEvmUsdcValue,
  ])
}
