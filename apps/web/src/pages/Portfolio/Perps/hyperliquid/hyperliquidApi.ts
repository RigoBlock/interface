import { HL_INFO_API_URL, HL_SPOT_DECIMALS, HL_USDC_TOKEN_INDEX } from 'uniswap/src/features/chains/evm/info/hyperevm'

/** Perp market metadata entry from the Core `meta` request (asset index = array index). */
export interface HlPerpAsset {
  name: string
  szDecimals: number
  maxLeverage: number
}

export interface HlMeta {
  universe: HlPerpAsset[]
}

/** Raw per-position shape from `clearinghouseState` (numeric fields are strings). */
interface HlApiPosition {
  coin: string
  /** Signed size in base units (negative = short). */
  szi: string
  entryPx?: string
  positionValue: string
  unrealizedPnl: string
  leverage: { type: string; value: number }
  liquidationPx?: string | null
  marginUsed: string
  maxLeverage: number
  /** Unrealized PnL as a fraction of margin/equity (e.g. "0.05" = 5%). */
  returnOnEquity?: string
}

interface HlApiMarginSummary {
  accountValue: string
  totalNtlPos: string
  totalRawUsd: string
  totalMarginUsed: string
}

/** Raw `clearinghouseState` response (marginSummary values are 6-decimal strings). */
export interface HlClearinghouseState {
  marginSummary: HlApiMarginSummary
  withdrawable: string
  assetPositions: Array<{ position: HlApiPosition; type: string }>
}

interface HlSpotBalanceEntry {
  coin: string
  token: number
  total: string
  hold: string
  entryNtl: string
}

export interface HyperliquidPosition {
  coin: string
  /** Core perp asset index (= index in the meta universe). */
  assetIndex: number
  side: 'long' | 'short'
  /** Position notional in USD (Core 6-decimal positionValue). */
  sizeUsd: number
  entryPrice: number
  /** Mark price from allMids (falls back to positionValue / size). */
  markPrice: number
  liquidationPrice?: number
  leverage: { type: 'cross' | 'isolated'; value: number }
  unrealizedPnlUsd: number
  /** Unrealized PnL as a percentage of margin/equity (Core returnOnEquity), when reported. */
  unrealizedPnlPercent?: number
  positionValueUsd: number
  marginUsedUsd: number
  /** Absolute size on the 1e8 wire scale, truncated to the market quantum (for reduce-only close sizing). */
  sizeRaw: string
}

export interface HyperliquidAccount {
  /** Core perp account value in USD (6-decimal accountValue). */
  perpsAccountValueUsd: number
  /** Total open notional in USD. */
  totalNtlPosUsd: number
  /** USD withdrawable from the perp account right now. */
  withdrawableUsd: number
  /** Core spot USDC balance in USD (info API returns a decimal string). */
  spotUsdcBalanceUsd: number
  positions: HyperliquidPosition[]
}

/** POSTs a request body to the Hyperliquid Core info API and unwraps error envelopes. */
export async function hlInfoApi<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch(HL_INFO_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    throw new Error(`Hyperliquid API HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`)
  }
  const data = (await response.json()) as T & { status?: string }
  if (data && data.status === 'err') {
    throw new Error(`Hyperliquid API error: ${JSON.stringify(data).slice(0, 300)}`)
  }
  return data
}

/** Perp market metadata: universe array where the asset index is the array index. */
export function fetchHlMeta(): Promise<HlMeta> {
  return hlInfoApi<HlMeta>({ type: 'meta' })
}

/** Current mid prices keyed by coin, e.g. { BTC: '67234.5', ... }. */
export function fetchHlAllMids(): Promise<Record<string, string>> {
  return hlInfoApi<Record<string, string>>({ type: 'allMids' })
}

/** Full Core perp account state for an address (user = the vault address). */
export function fetchHlClearinghouseState(user: string): Promise<HlClearinghouseState> {
  return hlInfoApi<HlClearinghouseState>({ type: 'clearinghouseState', user })
}

/**
 * Core spot USDC balance in USD for an address (spotClearinghouseState; USDC is
 * token index 0). The info API returns balance `total` as a decimal string (e.g.
 * "1500.0"), not raw core wei — only the on-chain precompile and Core action
 * payloads use the 8-decimal wire scale. Missing entry → 0.
 */
export async function fetchHlSpotUsdcBalance(user: string): Promise<number> {
  const state = await hlInfoApi<{ balances: HlSpotBalanceEntry[] }>({ type: 'spotClearinghouseState', user })
  const usdc = state.balances.find((balance) => balance.token === HL_USDC_TOKEN_INDEX)
  if (!usdc) {
    return 0
  }
  const total = Number(usdc.total)
  return Number.isFinite(total) ? total : 0
}

/** Normalizes one clearinghouseState assetPosition entry; markPrice comes from allMids. */
export function normalizeHlPosition(
  raw: HlApiPosition,
  { assetIndex, szDecimals, midPrice }: { assetIndex: number; szDecimals: number; midPrice?: number },
): HyperliquidPosition {
  const szi = parseFloat(raw.szi) || 0
  const absSize = Math.abs(szi)
  const positionValueUsd = parseFloat(raw.positionValue) || 0
  const entryPrice = raw.entryPx ? parseFloat(raw.entryPx) || 0 : 0
  const markPrice =
    midPrice && midPrice > 0 ? midPrice : absSize > 0 ? positionValueUsd / absSize : 0
  const liquidationPrice = raw.liquidationPx ? parseFloat(raw.liquidationPx) || undefined : undefined
  // Absolute size truncated to the market quantum (toward zero), scaled to the 1e8
  // wire scale — mirrors toHlSz() in hlAdapterAbi so closes size the full position.
  const quantum = BigInt(Math.floor(absSize * 10 ** szDecimals + 1e-6))
  const sizeRaw = (quantum * 10n ** BigInt(HL_SPOT_DECIMALS - szDecimals)).toString()

  return {
    coin: raw.coin,
    assetIndex,
    side: szi >= 0 ? 'long' : 'short',
    sizeUsd: positionValueUsd,
    entryPrice,
    markPrice,
    liquidationPrice: liquidationPrice && liquidationPrice > 0 ? liquidationPrice : undefined,
    leverage: { type: raw.leverage.type === 'isolated' ? 'isolated' : 'cross', value: raw.leverage.value },
    unrealizedPnlUsd: parseFloat(raw.unrealizedPnl) || 0,
    unrealizedPnlPercent:
      raw.returnOnEquity != null && Number.isFinite(parseFloat(raw.returnOnEquity))
        ? parseFloat(raw.returnOnEquity) * 100
        : undefined,
    positionValueUsd,
    marginUsedUsd: parseFloat(raw.marginUsed) || 0,
    sizeRaw,
  }
}

/**
 * Core account state for an address (the vault): clearinghouseState + Core spot USDC.
 * Two info-API calls, polled by useHyperliquidAccount. Market metadata (meta) and mid
 * prices (allMids) are NOT fetched here — they live in their own cached/polled queries
 * (useHyperliquidMeta / useHyperliquidMids) so the account poll stays minimal.
 */
export async function fetchHlAccountState(user: string): Promise<{
  clearinghouse: HlClearinghouseState
  spotUsdcBalanceUsd: number
}> {
  const [clearinghouse, spotUsdcBalanceUsd] = await Promise.all([
    fetchHlClearinghouseState(user),
    fetchHlSpotUsdcBalance(user),
  ])
  return { clearinghouse, spotUsdcBalanceUsd }
}

/**
 * Assembles the account snapshot from the polled state plus market metadata/mids
 * (either may be undefined while its query is still loading — positions are then
 * omitted and mark prices fall back to positionValue / size).
 */
export function buildHyperliquidAccount(params: {
  clearinghouse: HlClearinghouseState
  spotUsdcBalanceUsd: number
  meta?: HlMeta
  mids?: Record<string, string>
}): HyperliquidAccount {
  const { clearinghouse, spotUsdcBalanceUsd, meta, mids } = params
  const coinIndex = new Map<string, number>()
  meta?.universe.forEach((asset, index) => coinIndex.set(asset.name.toUpperCase(), index))

  const positions = clearinghouse.assetPositions
    .map(({ position }) => {
      const assetIndex = coinIndex.get(position.coin.toUpperCase()) ?? -1
      const szDecimals = assetIndex >= 0 ? meta!.universe[assetIndex].szDecimals : 6
      const midPrice = mids ? Number(mids[position.coin]) : NaN
      return normalizeHlPosition(position, {
        assetIndex,
        szDecimals,
        midPrice: Number.isFinite(midPrice) && midPrice > 0 ? midPrice : undefined,
      })
    })
    .filter((position) => position.assetIndex >= 0)

  return {
    perpsAccountValueUsd: parseFloat(clearinghouse.marginSummary.accountValue) || 0,
    totalNtlPosUsd: parseFloat(clearinghouse.marginSummary.totalNtlPos) || 0,
    withdrawableUsd: parseFloat(clearinghouse.withdrawable) || 0,
    spotUsdcBalanceUsd,
    positions,
  }
}
