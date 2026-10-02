import type { GasFeeResult } from '@universe/api'
import { UniverseChainId } from '@universe/chains'
import type { ComponentProps, ComponentType } from 'react'
import { WalletConnectRequestModalContent } from 'src/components/Requests/RequestModal/WalletConnectRequestModalContent'
import type { SignRequest, UwuLinkErc20Request } from 'src/features/walletConnect/walletConnectSlice'
import { renderWithProviders } from 'src/test/render'
import { EthMethod } from 'uniswap/src/features/dappRequests/types'
import { DappRequestType, UwULinkMethod } from 'uniswap/src/types/walletConnect'
import type { DappSignTypedDataContent } from 'wallet/src/components/dappRequests/DappSignTypedDataContent'
import type { DappTransactionScanningContent } from 'wallet/src/components/dappRequests/DappTransactionScanningContent'

// Capture the params handed to the Blockaid typed-data scanner so we can assert the
// scan order matches the signing order for both legacy and v4 typed-data requests.
type DappSignTypedDataContentProps = ComponentProps<typeof DappSignTypedDataContent>
const capturedProps: { current: DappSignTypedDataContentProps | undefined } = { current: undefined }
type DappTransactionScanningContentProps = ComponentProps<typeof DappTransactionScanningContent>
const capturedTransactionProps: { current: DappTransactionScanningContentProps | undefined } = { current: undefined }

vi.mock('wallet/src/components/dappRequests/DappSignTypedDataContent', () => ({
  DappSignTypedDataContent: (props: DappSignTypedDataContentProps) => {
    capturedProps.current = props
    return null
  },
}))

vi.mock('wallet/src/components/dappRequests/DappTransactionScanningContent', () => ({
  DappTransactionScanningContent: (props: DappTransactionScanningContentProps) => {
    capturedTransactionProps.current = props
    return null
  },
}))

vi.mock('src/components/Requests/RequestModal/ClientDetails', () => ({
  ClientDetails: () => null,
}))

vi.mock('@react-native-community/netinfo', () => ({
  useNetInfo: () => ({ isInternetReachable: true }),
}))

// This test renders the request content without its production BottomSheet parent. Stub the
// internal footer-height value that the component reads only to size its bottom spacer.
vi.mock('@gorhom/bottom-sheet', async () => {
  const { View } = (await import('react-native')) as unknown as { View: ComponentType }
  return {
    default: View,
    BottomSheetModal: View,
    BottomSheetModalProvider: View,
    BottomSheetView: View,
    useBottomSheetInternal: () => ({ animatedLayoutState: { value: { footerHeight: 0 } } }),
  }
})

const ACCOUNT = '0x1234567890123456789012345678901234567890'
// A Permit2 approval payload, matching the finding's PoC shape.
const TYPED_DATA = JSON.stringify({
  types: { EIP712Domain: [] },
  domain: { name: 'Permit2', chainId: 1, verifyingContract: '0x000000000022D473030F116dDEE9F6B43aC78BA3' },
  primaryType: 'PermitSingle',
  message: { spender: '0x00001f78189be22c3498cff1b8e02272c3220000' },
})

function createSignRequest(type: EthMethod.SignTypedData | EthMethod.SignTypedDataV4): SignRequest {
  return {
    type,
    sessionId: 'session-1',
    internalId: 'req-1',
    account: ACCOUNT,
    chainId: UniverseChainId.Mainnet,
    message: null,
    rawMessage: TYPED_DATA,
    dappRequestInfo: {
      requestType: DappRequestType.WalletConnectSessionRequest,
      name: 'Malicious dapp',
      url: 'https://dapp.example',
      icon: null,
    },
  }
}

const gasFee: GasFeeResult = { isLoading: false, error: null }
const noop = (): void => {}

describe('WalletConnectRequestModalContent typed-data Blockaid scan params', () => {
  beforeEach(() => {
    capturedProps.current = undefined
  })

  // The signer parses both legacy eth_signTypedData and eth_signTypedData_v4 as [account, typedData]
  // and signs the typed data. A prior bug reversed the legacy scan params to [typedData, account],
  // silently disabling Blockaid's malicious-request detection for legacy requests (finding #753).
  it.each([EthMethod.SignTypedData, EthMethod.SignTypedDataV4] as const)(
    'scans %s with the same [account, typedData] order it signs',
    (type) => {
      renderWithProviders(
        <WalletConnectRequestModalContent
          request={createSignRequest(type)}
          hasSufficientFunds
          gasFee={gasFee}
          confirmedRisk={false}
          onConfirmRisk={noop}
          onRiskLevelChange={noop}
          onCriticalRiskChange={noop}
        />,
      )

      expect(capturedProps.current?.params).toEqual([ACCOUNT, TYPED_DATA])
      expect(capturedProps.current?.method).toBe(type)
    },
  )
})

describe('WalletConnectRequestModalContent transaction scanning', () => {
  beforeEach(() => {
    capturedTransactionProps.current = undefined
  })

  it('scans an ERC-20 send discriminant with external provenance instead of trusting the UwULink bypass', () => {
    const transaction = {
      from: ACCOUNT,
      to: '0x1111111111111111111111111111111111111111',
      data: '0x',
      value: '0x0',
    }
    const request: UwuLinkErc20Request = {
      type: UwULinkMethod.Erc20Send,
      sessionId: 'session-1',
      internalId: 'req-1',
      account: ACCOUNT,
      chainId: UniverseChainId.Mainnet,
      dappRequestInfo: {
        requestType: DappRequestType.WalletConnectSessionRequest,
        name: 'External dapp',
        url: 'https://dapp.example',
        icon: null,
      },
      recipient: { address: transaction.to, name: 'Recipient' },
      tokenAddress: '0x2222222222222222222222222222222222222222',
      amount: '1',
      isStablecoin: false,
      transaction,
    }

    renderWithProviders(
      <WalletConnectRequestModalContent
        request={request}
        hasSufficientFunds
        gasFee={gasFee}
        confirmedRisk={false}
        onConfirmRisk={noop}
        onRiskLevelChange={noop}
        onCriticalRiskChange={noop}
      />,
    )

    expect(capturedTransactionProps.current?.transaction).toEqual(transaction)
    expect(capturedTransactionProps.current?.requestMethod).toBe(EthMethod.EthSendTransaction)
  })
})
