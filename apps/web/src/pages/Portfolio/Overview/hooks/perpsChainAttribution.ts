import { UniverseChainId } from '@universe/chains'
import { GMX_CHAIN_ID } from '~/pages/Portfolio/hooks/useGmxPositions'

/** Live perps/HyperEVM value sources the backend portfolio APIs don't cover. */
export interface PerpsExtras {
  /** GMX v2 position equity (collateral + unrealized PnL - fees), USD */
  gmxTotalNetValueUsd: number
  /** Hyperliquid perps account value (cross-chain HyperCore account), USD */
  hyperliquidPerpsValueUsd: number
  /** Hyperliquid Core spot USDC (in-transit balance), USD */
  hyperliquidSpotValueUsd: number
  /** On-chain HyperEVM (999) USDC balance, USD */
  hyperEvmUsdcValueUsd: number
}

/**
 * Attributes the non-backend value sources to the selected portfolio chain. GMX perps live
 * on Arbitrum. The Hyperliquid account is a cross-chain HyperCore account but is presented
 * as "Hyperliquid positions on HyperEVM" in the Perps tab, so it counts toward HyperEVM
 * (999) and the All Networks total — NOT toward any other single chain (selecting BNB must
 * not show the Hyperliquid account value). The HyperEVM USDC balance is a literal balance
 * on HyperEVM (999). All Networks (`chainId` undefined) counts everything, unchanged.
 */
export function getPerpsExtrasForChain({
  chainId,
  extras,
}: {
  chainId: UniverseChainId | undefined
  extras: PerpsExtras
}): PerpsExtras & { gmxHistoryForChain: boolean; hyperliquidHistoryForChain: boolean } {
  const isAllNetworks = chainId === undefined
  const isHyperEvm = chainId === UniverseChainId.HyperEvm
  return {
    gmxTotalNetValueUsd: isAllNetworks || chainId === GMX_CHAIN_ID ? extras.gmxTotalNetValueUsd : 0,
    hyperliquidPerpsValueUsd: isAllNetworks || isHyperEvm ? extras.hyperliquidPerpsValueUsd : 0,
    hyperliquidSpotValueUsd: isAllNetworks || isHyperEvm ? extras.hyperliquidSpotValueUsd : 0,
    hyperEvmUsdcValueUsd: isAllNetworks || isHyperEvm ? extras.hyperEvmUsdcValueUsd : 0,
    // History arrays are only meaningful alongside their live value; consumers swap in an
    // empty history so the chart bootstraps the (zeroed) current value flatly instead of
    // reconstructing historical values for a source that isn't attributable to this chain.
    gmxHistoryForChain: isAllNetworks || chainId === GMX_CHAIN_ID,
    hyperliquidHistoryForChain: isAllNetworks || isHyperEvm,
  }
}
