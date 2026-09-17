import { useQuery } from '@tanstack/react-query'
import { ChartPeriod } from '@uniswap/client-data-api/dist/data/v1/api_pb'
import { useMemo } from 'react'
import { normalizeTokenAddressForCache } from 'uniswap/src/data/cache'
import { GmxPosition } from '~/pages/Portfolio/hooks/useGmxPositions'

/**
 * GMX candles endpoint (same source as the official gmx-interface price charts).
 * Supported period values are 1m, 5m, 15m, 1h, 4h, 1d (NOT 30m/2h); responses are
 * capped at the most recent 1000 candles.
 */
const GMX_CANDLES_API_URL = 'https://arbitrum-api.gmxinfra.io/prices/candles'

/** Retrieved once per bucket and anchored at fetch time — 5 min matches the positions poll cadence. */
const HISTORY_STALE_TIME_MS = 5 * 60 * 1000
const HISTORY_GC_TIME_MS = 60 * 60 * 1000

export interface GmxValueHistoryPoint {
  /** Seconds since epoch (candle open time). */
  timestamp: number
  /** Total GMX positions value (collateral + unrealized PnL) in USD. */
  valueUsd: number
}

/**
 * Candle period + lookback window per chart period. The GMX candles endpoint does not
 * support 30m/2h, so WEEK uses 15m (672 candles) and MONTH uses 1h (720 candles, under
 * the 1000-candle cap) as the closest available granularities.
 */
const CANDLE_PERIOD_CONFIG: Partial<
  Record<ChartPeriod, { candlePeriod: string; intervalMs: number; windowMs: number }>
> = {
  [ChartPeriod.HOUR]: { candlePeriod: '1m', intervalMs: 60_000, windowMs: 60 * 60_000 },
  [ChartPeriod.DAY]: { candlePeriod: '5m', intervalMs: 5 * 60_000, windowMs: 24 * 60 * 60_000 },
  [ChartPeriod.WEEK]: { candlePeriod: '15m', intervalMs: 15 * 60_000, windowMs: 7 * 24 * 60 * 60_000 },
  [ChartPeriod.MONTH]: { candlePeriod: '1h', intervalMs: 60 * 60_000, windowMs: 30 * 24 * 60 * 60_000 },
}

/** Candle entry returned by the endpoint: [timestampSec, open, high, low, close], descending by time. */
type GmxCandle = [number, number, number, number, number]

async function fetchGmxCandles({
  tokenSymbol,
  candlePeriod,
  range,
}: {
  tokenSymbol: string
  candlePeriod: string
  range: { fromSec: number; toSec: number }
}): Promise<GmxCandle[]> {
  const params = new URLSearchParams({
    tokenSymbol,
    period: candlePeriod,
    from: String(range.fromSec),
    to: String(range.toSec),
  })
  const response = await fetch(`${GMX_CANDLES_API_URL}?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    throw new Error(`GMX candles request failed: ${response.status} ${response.statusText}`)
  }
  const body = (await response.json()) as { candles?: GmxCandle[]; error?: string }
  if (body.error || !body.candles) {
    throw new Error(`GMX candles error for ${tokenSymbol}: ${body.error ?? 'empty response'}`)
  }
  return body.candles
}

/** PnL model of one open position, assuming constant base size and entry price within the window. */
interface GmxPositionPnlModel {
  symbol: string
  sideSign: 1 | -1
  sizeBase: number
  entryPx: number
  markPx: number
}

function toPnlModel(position: GmxPosition): GmxPositionPnlModel | undefined {
  if (position.sizeUsd <= 0 || position.markPrice <= 0 || position.entryPrice <= 0 || !position.indexName) {
    return undefined
  }
  return {
    symbol: position.indexName.split('/')[0]?.trim().toUpperCase() ?? '',
    sideSign: position.isLong ? 1 : -1,
    sizeBase: position.sizeUsd / position.markPrice,
    entryPx: position.entryPrice,
    markPx: position.markPrice,
  }
}

function pnlAt(model: GmxPositionPnlModel, price: number): number {
  return model.sideSign * model.sizeBase * (price - model.entryPx)
}

/**
 * Total GMX positions value history for HOUR/DAY/WEEK/MONTH, reconstructed from
 * index-token candle closes at the period's interval granularity. Position PnL at
 * time t is modeled as sideSign × sizeBase × (price(t) − entryPx); the series is
 * anchored to the live total net value at fetch time so the retrieved history stays
 * stable afterwards and only the live tail moves (see Overview). Positions whose
 * index symbol has no usable candles keep their live PnL as a constant base.
 * Returns [] when there are no open positions (the chart falls back to the flat
 * current value).
 */
async function fetchGmxValueHistory(params: {
  candlePeriod: string
  windowMs: number
  nowMs: number
  positions: GmxPosition[]
  totalNetValueUsd: number
}): Promise<GmxValueHistoryPoint[]> {
  const { candlePeriod, windowMs, nowMs, positions, totalNetValueUsd } = params
  const models = positions
    .map(toPnlModel)
    .filter((model): model is GmxPositionPnlModel => !!model && model.symbol !== '')
  if (models.length === 0) {
    return []
  }

  const fromSec = Math.floor((nowMs - windowMs) / 1000)
  const toSec = Math.ceil(nowMs / 1000)

  // One candles fetch per unique index symbol (several markets can share an index).
  const symbols = [...new Set(models.map((model) => model.symbol))]
  const results = await Promise.all(
    symbols.map(async (symbol) => {
      const candles = await fetchGmxCandles({ tokenSymbol: symbol, candlePeriod, range: { fromSec, toSec } })
      return {
        symbol,
        // Endpoint returns descending [tsSec, o, h, l, c] — keep close, ascending.
        prices: new Map<number, number>(
          candles.map((candle): [number, number] => [candle[0], candle[4]]).sort((a, b) => a[0] - b[0]),
        ),
      }
    }),
  )
  const pricesBySymbol = new Map(results.map(({ symbol, prices }) => [symbol, prices]))

  // Symbols without usable candles contribute their positions' live PnL as a constant
  // base so the anchor below stays consistent with the reconstructed series.
  let constantPnl = 0
  const usableSymbols = new Set<string>()
  for (const model of models) {
    const prices = pricesBySymbol.get(model.symbol)
    if (!prices || prices.size === 0) {
      constantPnl += pnlAt(model, model.markPx)
    } else {
      usableSymbols.add(model.symbol)
    }
  }
  if (usableSymbols.size === 0) {
    return []
  }
  const usableModels = models.filter((model) => usableSymbols.has(model.symbol))

  // Union timeline across all symbols; per-symbol prices are forward-filled (and
  // back-filled at the start of the window where a symbol has no candles yet).
  const timestamps = [
    ...new Set(
      results
        .filter(({ symbol, prices }) => usableSymbols.has(symbol) && prices.size > 0)
        .flatMap(({ prices }) => [...prices.keys()]),
    ),
  ].sort((a, b) => a - b)
  const anchorTs = timestamps[timestamps.length - 1] ?? 0

  const priceAt = (symbol: string, ts: number): number => {
    const prices = pricesBySymbol.get(symbol)
    if (!prices) {
      return 0
    }
    const exact = prices.get(ts)
    if (exact !== undefined) {
      return exact
    }
    let prev = 0
    for (const key of prices.keys()) {
      if (key > ts) {
        break
      }
      prev = key
    }
    return prices.get(prev) ?? 0
  }

  const pnlSumAt = (ts: number): number =>
    usableModels.reduce((acc, model) => acc + pnlAt(model, priceAt(model.symbol, ts)), 0)
  const pnlNowSum = usableModels.reduce((acc, model) => acc + pnlAt(model, model.markPx), 0)

  const anchorValue = totalNetValueUsd - constantPnl - (pnlNowSum - pnlSumAt(anchorTs))

  return timestamps.map((ts) => ({ timestamp: ts, valueUsd: anchorValue - (pnlSumAt(anchorTs) - pnlSumAt(ts)) }))
}

/**
 * Historical total GMX positions value (collateral + unrealized PnL) samples for
 * HOUR/DAY/WEEK/MONTH, reconstructed from index-token candle closes at the period's
 * interval granularity (1m/5m/15m/1h) and anchored to the live total net value at
 * fetch time. Points are candle-timestamped; consumers should forward-fill and
 * overlay the live total after the last sample (see Overview chart assembly).
 * YEAR/MAX keep using the daily cumulative-PnL history from `useGmxPnlHistory`.
 * Returns [] when there is no reconstructable history (no open positions) — the
 * chart then falls back to the flat current value.
 */
export function useGmxValueHistory({
  address,
  period,
  positions,
  totalNetValueUsd,
}: {
  address: string | undefined
  period: ChartPeriod
  positions: GmxPosition[]
  totalNetValueUsd: number
}): {
  history: GmxValueHistoryPoint[]
  isLoading: boolean
  isError: boolean
} {
  const candleConfig = CANDLE_PERIOD_CONFIG[period]
  const isCandlePeriod = candleConfig !== undefined

  // Align the window start to interval buckets so queries rendered within the same
  // bucket share cache; the key (and thus a fresh anchored fetch) advances once per
  // candle period as time crosses bucket boundaries (Overview re-renders on every 5s
  // positions poll). There is intentionally no refetchInterval: historical values are
  // retrieved once per bucket and only the live tail refreshes (see Overview).
  // Recomputed every render on purpose — memoizing would freeze the anchor.
  const startTimeBucket = candleConfig ? Math.floor(Date.now() / candleConfig.intervalMs) * candleConfig.intervalMs : 0

  const normalizedAddress = address ? normalizeTokenAddressForCache(address) : undefined

  const { data, isLoading, isError } = useQuery({
    queryKey: ['gmxValueHistory', normalizedAddress, period, candleConfig?.candlePeriod, startTimeBucket],
    queryFn: () =>
      fetchGmxValueHistory({
        candlePeriod: candleConfig!.candlePeriod,
        windowMs: candleConfig!.windowMs,
        nowMs: startTimeBucket,
        positions,
        totalNetValueUsd,
      }),
    enabled: isCandlePeriod && !!normalizedAddress && positions.length > 0,
    staleTime: HISTORY_STALE_TIME_MS,
    gcTime: HISTORY_GC_TIME_MS,
    retry: 2,
    refetchOnWindowFocus: false,
  })

  const history = useMemo(() => (isCandlePeriod ? (data ?? []) : []), [isCandlePeriod, data])

  return { history, isLoading, isError }
}
