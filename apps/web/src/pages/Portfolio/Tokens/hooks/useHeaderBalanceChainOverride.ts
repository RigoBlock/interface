import type { UniverseChainId } from '@universe/chains'
import { isBackendSupportedChainId } from 'uniswap/src/features/chains/utils'
import { useHyperEvmUsdcBalance } from '~/pages/Portfolio/Perps/hyperliquid/useHyperEvmUsdcBalance'

/**
 * Props for the tokens-tab header balance. For a non-backend-supported chain (HyperEVM 999)
 * the backend breakdown is not attributable to the selected chain (it either errors or returns
 * the full multichain set), so the displayed balance is overridden with the on-chain HyperEVM
 * USDC value and the (all-chains) percent change is hidden. Backend-supported chains and
 * All Networks return an empty override.
 */
export function useHeaderBalanceChainOverride(
  effectiveChainId: UniverseChainId | null | undefined,
  evmAddress?: string,
): { overrideBalanceUSD?: number; hidePercentChange?: boolean } {
  const isSupported = effectiveChainId == null || isBackendSupportedChainId(effectiveChainId)
  const { balanceUsd } = useHyperEvmUsdcBalance(isSupported ? undefined : evmAddress)
  return isSupported ? {} : { overrideBalanceUSD: balanceUsd, hidePercentChange: true }
}
