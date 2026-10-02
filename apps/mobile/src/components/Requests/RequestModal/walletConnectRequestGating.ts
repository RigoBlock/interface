import { DappRequestType, UwULinkMethod } from 'uniswap/src/types/walletConnect'
import { TransactionRiskLevel } from 'wallet/src/features/dappRequests/types'
import { shouldDisableConfirm } from 'wallet/src/features/dappRequests/utils/riskUtils'

interface WalletConnectRequestProvenance {
  type: string
  requestType: DappRequestType
}

/** True only for the allowlisted deep-link flow whose transaction is constructed by the wallet. */
export function isWalletBuiltUwULinkErc20Send({ type, requestType }: WalletConnectRequestProvenance): boolean {
  return type === UwULinkMethod.Erc20Send && requestType === DappRequestType.UwULink
}

interface ShouldDisableWalletConnectConfirmForSafetyParams {
  isInternetReachable: boolean | null
  isLinkModeSupported: boolean | undefined
  requiresScan: boolean
  riskLevel: TransactionRiskLevel | null
  confirmedRisk: boolean
}

/** Link mode bypasses only the transport check; every external dapp request still requires a usable scan verdict. */
export function shouldDisableWalletConnectConfirmForSafety({
  isInternetReachable,
  isLinkModeSupported,
  requiresScan,
  riskLevel,
  confirmedRisk,
}: ShouldDisableWalletConnectConfirmForSafetyParams): boolean {
  if (!isInternetReachable && !isLinkModeSupported) {
    return true
  }

  return requiresScan && shouldDisableConfirm({ riskLevel, confirmedRisk })
}
