/**
 * Hyperliquid (HyperEVM) — AHyperliquid adapter ABI and CoreWriter action encoding.
 *
 * Calls are sent TO the smart pool address; the protocol delegatecalls into the
 * AHyperliquid adapter. sendRawAction payloads follow the CoreWriter layout:
 *
 *   data[0]     = uint8 version (must be 1)
 *   data[1:4]   = uint24 action id
 *   data[4:]    = abi-encoded action parameters
 *
 * Decimal conventions (USDC-only integration):
 *   - deposit amount            : EVM USDC, 6 decimals (uint256)
 *   - USD_CLASS_TRANSFER ntl    : perp USDC, 6 decimals (uint64)
 *   - SPOT_SEND amount          : Core spot USDC, 8 decimals core wei (uint64)
 *   - limit order limitPx       : 8-decimal fixed point (uint64)
 *   - limit order sz            : base-asset units on the 1e8 wire scale (uint64)
 *
 * Adapted from RigoBlock/agentic-operator (src/abi/hyperliquid.ts,
 * src/services/hyperliquidTrading.ts).
 */

import {
  HL_ACTION_LIMIT_ORDER,
  HL_ACTION_SPOT_SEND,
  HL_ACTION_USD_CLASS_TRANSFER,
  HL_DEFAULT_PERP_DEX,
  HL_PERP_DECIMALS,
  HL_SPOT_DECIMALS,
} from 'uniswap/src/features/chains/evm/info/hyperevm'
import { encodeAbiParameters, parseUnits, type Hex } from 'viem'

export const HL_TIF = {
  alo: 1,
  gtc: 2,
  ioc: 3,
} as const

export type HlTif = (typeof HL_TIF)[keyof typeof HL_TIF]

/** Destination dex for deposits: 0 = default perp dex (the adapter rejects anything else). */
export const HL_PERP_DEX_DEFAULT = HL_DEFAULT_PERP_DEX

const U64_MAX = (1n << 64n) - 1n

/**
 * Core spot USDC residual required after a bridge send, as a gas buffer. HyperCore
 * charges each Core→HyperEVM send's gas from the Core spot balance (~0.002 USDC at
 * the Core gas schedule); 0.1 is a safety buffer. A pool's first-ever successful
 * Core→HyperEVM send additionally deducts a one-time ~1 USDC activation fee.
 */
export const SPOT_SEND_GAS_USDC = 0.1

// ── Adapter ABI (called on the vault, like RIGOBLOCK_GMX_ABI) ──────────

export const RIGOBLOCK_HYPERLIQUID_ABI = [
  {
    name: 'deposit',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'destinationDex', type: 'uint32' },
    ],
    outputs: [],
  },
  {
    name: 'sendRawAction',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'data', type: 'bytes' }],
    outputs: [],
  },
]

// ── Unit conversions ───────────────────────────────────────────────────

/** Human price (e.g. 67234.5) → Core uint64 fixed point with 8 decimals. */
export function toHlPx(price: number | string): bigint {
  const n = typeof price === 'string' ? parseFloat(price) : price
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Invalid Hyperliquid price: ${price} (must be a positive number).`)
  }
  const px = BigInt(Math.round(n * 10 ** 8))
  if (px > U64_MAX) {
    throw new Error(`Hyperliquid price too large: ${price}`)
  }
  return px
}

/**
 * Formats a human price to a valid Hyperliquid perp price following the official
 * tick rules (≤ 6 − szDecimals decimals, ≤ 5 significant figures for non-integers),
 * mirroring formatPrice() in @nktkas/hyperliquid/utils and the reference
 * implementation in RigoBlock/agentic-operator: truncate toward zero (never round
 * up) so market-order bounds stay conservative in both directions.
 */
export function formatHlPrice(px: number | string, szDecimals: number): string {
  const n = typeof px === 'string' ? parseFloat(px) : px
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Invalid Hyperliquid price: ${px}`)
  }
  const maxDec = Math.max(6 - szDecimals, 0)
  const f = 10 ** maxDec
  let truncated = Math.floor(n * f + 1e-6) / f
  if (truncated <= 0) {
    throw new Error(`Hyperliquid price too small: ${px}`)
  }
  if (!Number.isInteger(truncated)) {
    const sigF = 10 ** (4 - Math.floor(Math.log10(truncated)))
    truncated = Math.floor(truncated * sigF + 1e-6) / sigF
    if (truncated <= 0) {
      throw new Error(`Hyperliquid price too small: ${px}`)
    }
  }
  return String(truncated)
}

/** Minimum base-asset size increment (human units) for a market with szDecimals. */
export function quantumFor(szDecimals: number): number {
  return 10 ** -szDecimals
}

/**
 * USD notional → human base-asset size truncated to the market quantum (toward
 * zero), e.g. usdToSizeRaw(100, { price: 50000, szDecimals: 5 }) → '0.002'.
 * Pair with toHlSz() for the wire value.
 */
export function usdToSizeRaw(usd: number, { price, szDecimals }: { price: number; szDecimals: number }): string {
  if (!Number.isFinite(usd) || usd <= 0 || !Number.isFinite(price) || price <= 0) {
    throw new Error(`Invalid Hyperliquid order size: ${usd} USD at ${price}`)
  }
  const f = 10 ** szDecimals
  const quantum = Math.floor((usd / price) * f + 1e-6) / f
  if (quantum <= 0) {
    throw new Error(`Hyperliquid order size too small: ${usd} USD at ${price}`)
  }
  return String(quantum)
}

/**
 * Human base-asset size → Core uint64 size on the 1e8 wire scale. The size is
 * first truncated to szDecimals decimals (matching-engine quantization — never
 * exceeds the requested size), then scaled by 10^(8 − szDecimals), exact in
 * integers. Mirrors toHlSz() in RigoBlock/agentic-operator.
 */
export function toHlSz(size: number | string, szDecimals: number): bigint {
  const n = typeof size === 'string' ? parseFloat(size) : size
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Invalid Hyperliquid order size: ${size} (must be a positive number).`)
  }
  const quantum = BigInt(Math.floor(n * 10 ** szDecimals + 1e-6))
  if (quantum === 0n) {
    throw new Error(`Hyperliquid order size too small: ${size} (truncates to 0 at ${szDecimals} decimals).`)
  }
  const sz = quantum * 10n ** BigInt(8 - szDecimals)
  if (sz > U64_MAX) {
    throw new Error(`Hyperliquid order size too large: ${size}`)
  }
  return sz
}

/** Human USDC amount → 6-decimal perp USDC units (deposit, USD_CLASS_TRANSFER). */
export function usdToPerpUnits(amount: number | string): bigint {
  const n = typeof amount === 'string' ? parseFloat(amount.replace(/[$,]/g, '')) : amount
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Invalid USDC amount: ${amount} (must be a positive number).`)
  }
  const units = BigInt(Math.round(n * 10 ** HL_PERP_DECIMALS))
  if (units === 0n) {
    throw new Error(`USDC amount too small: ${amount}`)
  }
  return units
}

/** Human USDC amount → 8-decimal Core spot wei (SPOT_SEND). */
export function usdToCoreWei(amount: number | string): bigint {
  const n = typeof amount === 'string' ? parseFloat(amount.replace(/[$,]/g, '')) : amount
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Invalid USDC amount: ${amount} (must be a positive number).`)
  }
  const wei = BigInt(Math.round(n * 10 ** HL_SPOT_DECIMALS))
  if (wei === 0n) {
    throw new Error(`USDC amount too small: ${amount}`)
  }
  if (wei > U64_MAX) {
    throw new Error(`USDC amount too large: ${amount}`)
  }
  return wei
}

/** Human USDC amount → 6-decimal EVM USDC units (adapter deposit). */
export function usdToEvmUnits(amount: number | string): bigint {
  const cleaned = typeof amount === 'string' ? amount.replace(/[$,]/g, '') : String(amount)
  const units = parseUnits(cleaned, HL_PERP_DECIMALS)
  if (units <= 0n) {
    throw new Error(`Invalid deposit amount: ${amount}`)
  }
  return units
}

/** Random uint128 client order id. */
export function randomCloid(): bigint {
  const buf = new Uint8Array(16)
  crypto.getRandomValues(buf)
  return BigInt(`0x${Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('')}`)
}

// ── sendRawAction payloads ─────────────────────────────────────────────

/** Builds the raw CoreWriter payload: version byte + uint24 action id + abi-encoded params. */
export function encodeHlAction(actionId: number, params: Hex): Hex {
  const actionBytes = new Uint8Array(4)
  actionBytes[0] = 1 // version
  actionBytes[1] = (actionId >> 16) & 0xff
  actionBytes[2] = (actionId >> 8) & 0xff
  actionBytes[3] = actionId & 0xff
  return (`0x${Array.from(actionBytes, (b) => b.toString(16).padStart(2, '0')).join('')}${params.slice(2)}`) as Hex
}

export interface HlLimitOrderParams {
  asset: number
  isBuy: boolean
  limitPx: bigint
  sz: bigint
  reduceOnly: boolean
  tif: HlTif
  cloid: bigint
}

/**
 * LIMIT_ORDER_ACTION payload — open, increase, decrease (reduceOnly), or close a
 * perp position. Returns the full sendRawAction bytes payload.
 */
export function buildLimitOrderAction({ asset, isBuy, limitPx, sz, reduceOnly, tif, cloid }: HlLimitOrderParams): Hex {
  if (asset < 0 || asset >= 10000) {
    throw new Error(`Invalid core perp asset index: ${asset}`)
  }
  return encodeHlAction(
    HL_ACTION_LIMIT_ORDER,
    encodeAbiParameters(
      [
        { type: 'uint32' },
        { type: 'bool' },
        { type: 'uint64' },
        { type: 'uint64' },
        { type: 'bool' },
        { type: 'uint8' },
        { type: 'uint128' },
      ],
      [asset, isBuy, limitPx, sz, reduceOnly, tif, cloid],
    ),
  )
}

/**
 * USD_CLASS_TRANSFER_ACTION payload — move USDC from the Core perp margin account
 * to Core spot (the adapter is perps-only and rejects toPerp=true). ntl is 6-decimal
 * perp USDC units.
 */
export function buildUsdClassTransferAction(ntl: bigint): Hex {
  return encodeHlAction(HL_ACTION_USD_CLASS_TRANSFER, encodeAbiParameters([{ type: 'uint64' }, { type: 'bool' }], [ntl, false]))
}

/**
 * SPOT_SEND_ACTION payload — bridge Core spot USDC back to HyperEVM (step 2 of a
 * withdrawal). amountWei is 8-decimal Core spot wei; the adapter only accepts USDC
 * (token index 0) destined for the USDC system address.
 */
export function buildSpotSendAction({
  destination,
  token,
  amountWei,
}: {
  destination: string
  token: number
  amountWei: bigint
}): Hex {
  return encodeHlAction(
    HL_ACTION_SPOT_SEND,
    encodeAbiParameters(
      [{ type: 'address' }, { type: 'uint64' }, { type: 'uint64' }],
      [destination as Hex, BigInt(token), amountWei],
    ),
  )
}
