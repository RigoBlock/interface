import { HL_USDC_ADDRESS } from 'uniswap/src/features/chains/evm/info/hyperevm'
import { UniverseChainId } from 'uniswap/src/features/chains/types'

/** EVM chains offered as the non-HyperEVM endpoint of the pool USDC bridge.
 *  Mirrors the on-chain CrosschainTokens allowlist (USDC on all Rigoblock chains). */
export const HYPERLIQUID_BRIDGE_EVM_CHAINS: readonly UniverseChainId[] = [
  UniverseChainId.ArbitrumOne,
  UniverseChainId.Mainnet,
  UniverseChainId.Optimism,
  UniverseChainId.Base,
  UniverseChainId.Polygon,
  UniverseChainId.Bnb,
  UniverseChainId.Unichain,
]

export interface BridgeUsdcConfig {
  address: string
  decimals: number
}

/**
 * Bridgeable USDC per chain, mirroring the on-chain CrosschainTokens / CrosschainLib
 * allowlist. HyperEVM (999) supports USDC only. BSC USDC uses 18 decimals — the
 * Across quote and the AIntents decimal-normalization handle the conversion.
 */
export const HYPERLIQUID_BRIDGE_USDC: Partial<Record<UniverseChainId, BridgeUsdcConfig>> = {
  [UniverseChainId.ArbitrumOne]: { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6 },
  [UniverseChainId.Mainnet]: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
  [UniverseChainId.Optimism]: { address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', decimals: 6 },
  [UniverseChainId.Base]: { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
  [UniverseChainId.Polygon]: { address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6 },
  [UniverseChainId.Bnb]: { address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18 },
  [UniverseChainId.Unichain]: { address: '0x078D782b760474a361dDA0AF3839290b0EF57AD6', decimals: 6 },
  [UniverseChainId.HyperEvm]: { address: HL_USDC_ADDRESS, decimals: 6 },
}
