import { UniverseChainId } from '@universe/chains'
import type { Warning } from 'uniswap/src/components/modals/WarningModal/types'
import { WarningLabel } from 'uniswap/src/components/modals/WarningModal/types'
import { getChainInfo } from 'uniswap/src/features/chains/chainInfo'
import { useEnabledChains } from 'uniswap/src/features/chains/hooks/useEnabledChains'
import { useSwapFormStoreDerivedSwapInfo } from 'uniswap/src/features/transactions/swap/stores/swapFormStore/useSwapFormStore'

/** Resolves an output-first canonical bridge for cross-chain `NoQuotesFound` warnings outside testnet mode. */
export function useCanonicalBridgeChainId(warning?: Warning): UniverseChainId | undefined {
  const { isTestnetModeEnabled } = useEnabledChains()
  const inputChainId = useSwapFormStoreDerivedSwapInfo((s) => s.currencies.input?.currency.chainId)
  const outputChainId = useSwapFormStoreDerivedSwapInfo((s) => s.currencies.output?.currency.chainId)

  if (isTestnetModeEnabled || warning?.type !== WarningLabel.NoQuotesFound || inputChainId === outputChainId) {
    return undefined
  }

  return [outputChainId, inputChainId].find(
    (chainId): chainId is UniverseChainId => chainId !== undefined && getChainInfo(chainId).bridge !== undefined,
  )
}
