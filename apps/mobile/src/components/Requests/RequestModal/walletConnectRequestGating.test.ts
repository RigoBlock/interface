import {
  isWalletBuiltUwULinkErc20Send,
  shouldDisableWalletConnectConfirmForSafety,
} from 'src/components/Requests/RequestModal/walletConnectRequestGating'
import { EthMethod } from 'uniswap/src/features/dappRequests/types'
import { DappRequestType, UwULinkMethod } from 'uniswap/src/types/walletConnect'
import { TransactionRiskLevel } from 'wallet/src/features/dappRequests/types'

describe('shouldDisableWalletConnectConfirmForSafety', () => {
  it('keeps an offline link-mode request disabled without a scan verdict', () => {
    expect(
      shouldDisableWalletConnectConfirmForSafety({
        isInternetReachable: false,
        isLinkModeSupported: true,
        requiresScan: true,
        riskLevel: null,
        confirmedRisk: false,
      }),
    ).toBe(true)
  })

  it('allows link mode to bypass only the offline transport check after a usable scan', () => {
    expect(
      shouldDisableWalletConnectConfirmForSafety({
        isInternetReachable: false,
        isLinkModeSupported: true,
        requiresScan: true,
        riskLevel: TransactionRiskLevel.None,
        confirmedRisk: false,
      }),
    ).toBe(false)
  })

  it('keeps a non-link-mode request disabled while offline', () => {
    expect(
      shouldDisableWalletConnectConfirmForSafety({
        isInternetReachable: false,
        isLinkModeSupported: false,
        requiresScan: true,
        riskLevel: TransactionRiskLevel.None,
        confirmedRisk: false,
      }),
    ).toBe(true)
  })

  it('allows an online wallet-built UwULink send without a dapp scan verdict', () => {
    expect(
      shouldDisableWalletConnectConfirmForSafety({
        isInternetReachable: true,
        isLinkModeSupported: false,
        requiresScan: false,
        riskLevel: null,
        confirmedRisk: false,
      }),
    ).toBe(false)
  })

  it('still blocks a wallet-built UwULink send while offline', () => {
    expect(
      shouldDisableWalletConnectConfirmForSafety({
        isInternetReachable: false,
        isLinkModeSupported: false,
        requiresScan: false,
        riskLevel: null,
        confirmedRisk: false,
      }),
    ).toBe(true)
  })
})

describe('isWalletBuiltUwULinkErc20Send', () => {
  it('trusts only an ERC-20 send created by the UwULink flow', () => {
    expect(
      isWalletBuiltUwULinkErc20Send({
        type: UwULinkMethod.Erc20Send,
        requestType: DappRequestType.UwULink,
      }),
    ).toBe(true)
  })

  it('does not waive scanning for an ERC-20 send discriminant with WalletConnect provenance', () => {
    expect(
      isWalletBuiltUwULinkErc20Send({
        type: UwULinkMethod.Erc20Send,
        requestType: DappRequestType.WalletConnectSessionRequest,
      }),
    ).toBe(false)
  })

  it('does not waive scanning for a generic UwULink transaction', () => {
    expect(
      isWalletBuiltUwULinkErc20Send({
        type: EthMethod.EthSendTransaction,
        requestType: DappRequestType.UwULink,
      }),
    ).toBe(false)
  })
})
