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
 * on Arbitrum, the Hyperliquid account is cross-chain (counted only in the All Networks
 * total, matching how the Perps tab presents it), and the HyperEVM USDC balance is a literal
 * balance on HyperEVM (999). With a single chain selected, the other chains' extras must not
 * leak into the total or the chart — e.g. selecting BNB must not show the Hyperliquid
 * account value. All Networks (`chainId` undefined) counts everything, unchanged.
 */
export function getPerpsExtrasForChain({
  chainId,
  extras,
}: {
  chainId: UniverseChainId | undefined
  extras: PerpsExtras
}): PerpsExtras & { gmxHistoryForChain: boolean; hyperliquidHistoryForChain: boolean } {
  const isAllNetworks = chainId === undefined
  return {
    gmxTotalNetValueUsd: isAllNetworks || chainId === GMX_CHAIN_ID ? extras.gmxTotalNetValueUsd : 0,
    hyperliquidPerpsValueUsd: isAllNetworks ? extras.hyperliquidPerpsValueUsd : 0,
    hyperliquidSpotValueUsd: isAllNetworks ? extras.hyperliquidSpotValueUsd : 0,
    hyperEvmUsdcValueUsd: isAllNetworks || chainId === UniverseChainId.HyperEvm ? extras.hyperEvmUsdcValueUsd : 0,
    // History arrays are only meaningful alongside their live value; consumers swap in an
    // empty history so the chart bootstraps the (zeroed) current value flatly instead of
    // reconstructing historical values for a source that isn't attributable to this chain.
    gmxHistoryForChain: isAllNetworks || chainId === GMX_CHAIN_ID,
    hyperliquidHistoryForChain: isAllNetworks,
  }
}
