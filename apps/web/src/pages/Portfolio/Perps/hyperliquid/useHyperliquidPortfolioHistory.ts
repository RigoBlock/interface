import { useQuery } from '@tanstack/react-query'
import { ChartPeriod } from '@uniswap/client-data-api/dist/data/v1/api_pb'
import { useMemo } from 'react'
import { normalizeTokenAddressForCache } from 'uniswap/src/data/cache'
import {
  fetchHlCandles,
  hlInfoApi,
  HyperliquidAccount,
  HyperliquidPosition,
} from '~/pages/Portfolio/Perps/hyperliquid/hyperliquidApi'

const HISTORY_STALE_TIME_MS = 30 * 60 * 1000
const HISTORY_GC_TIME_MS = 60 * 60 * 1000
/** Candle-based history is anchored at fetch time and not polled — 5 min matches the account poll cadence. */
const CANDLE_HISTORY_STALE_TIME_MS = 5 * 60 * 1000

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

/** Candle interval + lookback window for the per-coin candle reconstruction, by chart period. */
const CANDLE_PERIOD_CONFIG: Partial<Record<ChartPeriod, { interval: string; intervalMs: number; windowMs: number }>> = {
  [ChartPeriod.HOUR]: { interval: '1m', intervalMs: 60_000, windowMs: 60 * 60_000 },
  [ChartPeriod.DAY]: { interval: '5m', intervalMs: 5 * 60_000, windowMs: 24 * 60 * 60_000 },
  [ChartPeriod.WEEK]: { interval: '30m', intervalMs: 30 * 60_000, windowMs: 7 * 24 * 60 * 60_000 },
  [ChartPeriod.MONTH]: { interval: '2h', intervalMs: 2 * 60 * 60_000, windowMs: 30 * 24 * 60 * 60_000 },
}

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

/** PnL model of one open position, assuming constant base size and entry price within the window. */
interface HlPositionPnlModel {
  coin: string
  sideSign: 1 | -1
  sizeBase: number
  entryPx: number
  markPx: number
}

function toPnlModel(position: HyperliquidPosition): HlPositionPnlModel | undefined {
  if (position.sizeUsd <= 0 || position.markPrice <= 0 || position.entryPrice <= 0) {
    return undefined
  }
  return {
    coin: position.coin,
    sideSign: position.side === 'long' ? 1 : -1,
    sizeBase: position.sizeUsd / position.markPrice,
    entryPx: position.entryPrice,
    markPx: position.markPrice,
  }
}

function pnlAt(model: HlPositionPnlModel, price: number): number {
  return model.sideSign * model.sizeBase * (price - model.entryPx)
}

/**
 * Total (Core spot USDC + perp) account value history for HOUR/DAY/WEEK/MONTH,
 * reconstructed from per-coin candle closes at the chart period's own interval
 * granularity. Perp value at time t is anchored to the live account value at fetch
 * time: value(t) = anchorValue − Σ (pnlᵢ(anchorT) − pnlᵢ(t)), so the retrieved
 * series stays stable afterwards and only the live tail moves (see Overview).
 * Positions are modeled with constant base size and entry price within the window;
 * coins whose candle fetch fails keep their live PnL as a constant base instead.
 * Returns [] when there are no open positions (the chart then falls back to the flat
 * current value).
 */
async function fetchHlCandleHistory(params: {
  account: HyperliquidAccount
  interval: string
  windowMs: number
  nowMs: number
}): Promise<HyperliquidPortfolioHistoryPoint[]> {
  const { account, interval, windowMs, nowMs } = params
  const models = account.positions.map(toPnlModel).filter((model): model is HlPositionPnlModel => !!model)
  if (models.length === 0) {
    return []
  }

  const startTimeMs = nowMs - windowMs
  const results = await Promise.all(
    models.map(async (model) => {
      const candles = await fetchHlCandles(model.coin, interval, startTimeMs, nowMs)
      return { model, candles }
    }),
  )

  // Coins without usable candles contribute their live PnL as a constant base so the
  // anchor below stays consistent with the reconstructed series.
  const usable: { model: HlPositionPnlModel; prices: Map<number, number>; sortedKeys: number[] }[] = []
  let constantPnl = 0
  for (const { model, candles } of results) {
    if (candles.length === 0) {
      constantPnl += pnlAt(model, model.markPx)
    } else {
      usable.push({
        model,
        prices: new Map(candles.map((c) => [c.timestampSec, c.price])),
        sortedKeys: candles.map((c) => c.timestampSec),
      })
    }
  }
  if (usable.length === 0) {
    return []
  }

  // Union timeline across all coins; per-coin prices are forward-filled (and
  // back-filled at the start of the window where a coin has no candles yet).
  const timestamps = [...new Set(usable.flatMap(({ sortedKeys }) => sortedKeys))].sort((a, b) => a - b)
  const anchorTs = timestamps[timestamps.length - 1] ?? 0

  const priceAt = (
    { prices, sortedKeys }: { prices: Map<number, number>; sortedKeys: number[] },
    ts: number,
  ): number => {
    const exact = prices.get(ts)
    if (exact !== undefined) {
      return exact
    }
    // Back-fill before the first candle, forward-fill after the last.
    let prev = sortedKeys[0] ?? 0
    for (const key of sortedKeys) {
      if (key > ts) {
        break
      }
      prev = key
    }
    return prices.get(prev) ?? 0
  }

  const pnlSumAt = (ts: number): number =>
    usable.reduce((acc, entry) => acc + pnlAt(entry.model, priceAt(entry, ts)), 0)
  const pnlNowSum = usable.reduce((acc, { model }) => acc + pnlAt(model, model.markPx), 0)

  const anchorValue = account.perpsAccountValueUsd - constantPnl - (pnlNowSum - pnlSumAt(anchorTs))
  const spotUsdc = account.spotUsdcBalanceUsd

  return timestamps.map((ts) => ({
    timestamp: ts,
    valueUsd: anchorValue - (pnlSumAt(anchorTs) - pnlSumAt(ts)) + spotUsdc,
  }))
}

/**
 * Historical total (spot + perp) Hyperliquid account value samples for the selected
 * chart period. HOUR/DAY/WEEK/MONTH are reconstructed from per-coin candle closes at
 * the period's interval granularity (1m/5m/30m/2h), anchored to the live account at
 * fetch time so retrieved history stays fixed; YEAR/MAX keep the `portfolio` info
 * endpoint bucket merge. Points are irregularly spaced (candle timestamps or ~11 per
 * bucket); consumers should forward-fill and overlay the live value after the last
 * sample (see Overview chart assembly). Returns [] when there is no reconstructable
 * history (no open positions / all-zero buckets) — the chart then falls back to the
 * flat current value.
 */
// oxlint-disable-next-line max-params -- (address, period, account) is the required hook signature
export function useHyperliquidPortfolioHistory(
  address: string | undefined,
  period: ChartPeriod,
  account?: HyperliquidAccount,
): {
  history: HyperliquidPortfolioHistoryPoint[]
  isLoading: boolean
  isError: boolean
} {
  const candleConfig = CANDLE_PERIOD_CONFIG[period]
  const isCandlePeriod = candleConfig !== undefined

  // Align the window start to interval buckets so queries rendered within the same
  // bucket share cache; the key (and thus a fresh anchored fetch) advances once per
  // interval as time crosses bucket boundaries (Overview re-renders on every 5s
  // account poll). There is intentionally no refetchInterval: historical values are
  // retrieved once per bucket and only the live tail refreshes (see Overview).
  // Recomputed every render on purpose — memoizing would freeze the anchor.
  const startTimeBucket = candleConfig ? Math.floor(Date.now() / candleConfig.intervalMs) * candleConfig.intervalMs : 0

  const normalizedAddress = address ? normalizeTokenAddressForCache(address) : undefined

  const candleQuery = useQuery({
    queryKey: [
      'hyperliquidPortfolioHistory',
      'candles',
      normalizedAddress,
      period,
      candleConfig?.interval,
      startTimeBucket,
    ],
    queryFn: () =>
      fetchHlCandleHistory({
        account: account!,
        interval: candleConfig!.interval,
        windowMs: candleConfig!.windowMs,
        nowMs: startTimeBucket,
      }),
    enabled: isCandlePeriod && !!normalizedAddress && !!account && account.positions.length > 0,
    staleTime: CANDLE_HISTORY_STALE_TIME_MS,
    gcTime: HISTORY_GC_TIME_MS,
    retry: 2,
    refetchOnWindowFocus: false,
  })

  const portfolioQuery = useQuery({
    queryKey: ['hyperliquidPortfolioHistory', normalizedAddress],
    queryFn: () => fetchHlPortfolioHistory(normalizedAddress!),
    enabled: !isCandlePeriod && !!normalizedAddress,
    staleTime: HISTORY_STALE_TIME_MS,
    gcTime: HISTORY_GC_TIME_MS,
    retry: 2,
    // Historical values don't need refreshes.
    refetchOnWindowFocus: false,
  })

  const query = isCandlePeriod ? candleQuery : portfolioQuery
  const history = useMemo(() => query.data ?? [], [query.data])

  return { history, isLoading: query.isLoading, isError: query.isError }
}
