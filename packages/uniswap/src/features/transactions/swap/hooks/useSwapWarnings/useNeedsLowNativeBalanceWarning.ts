import { useSelector } from 'react-redux'
import { selectHasDismissedLowNetworkTokenWarning } from 'uniswap/src/features/behaviorHistory/selectors'
import { DerivedSwapInfo } from 'uniswap/src/features/transactions/swap/types/derivedSwapInfo'
import { CurrencyField } from 'uniswap/src/types/currency'

export function useNeedsLowNativeBalanceWarning({
  derivedSwapInfo,
  isMax,
}: {
  derivedSwapInfo: DerivedSwapInfo
  isMax: boolean
}): boolean {
  // For smart pool operations, native tokens come from the pool, not the user's wallet.
  // The user's wallet only pays gas, so no low balance warning is needed.
  const isSmartPool = !!derivedSwapInfo.smartPoolAddress
  const needsLowNativeBalanceWarning =
    !isSmartPool && isMax && derivedSwapInfo.currencyAmounts[CurrencyField.INPUT]?.currency.isNative
  const hasDismissedLowNetworkTokenWarning = useSelector(selectHasDismissedLowNetworkTokenWarning)
  return !!needsLowNativeBalanceWarning && !hasDismissedLowNetworkTokenWarning
}
