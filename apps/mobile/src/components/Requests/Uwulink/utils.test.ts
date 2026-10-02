import { UniverseChainId } from '@universe/chains'
import { getFormattedUwuLinkTxnRequest } from 'src/components/Requests/Uwulink/utils'
import { EthMethod } from 'uniswap/src/features/dappRequests/types'
import type { UwULinkRequest } from 'uniswap/src/types/walletConnect'
import { signerMnemonicAccount } from 'wallet/src/test/fixtures'

const ACTIVE_ACCOUNT = signerMnemonicAccount({ address: '0x1111111111111111111111111111111111111111' })
const DAPP_SUPPLIED_ACCOUNT = '0x2222222222222222222222222222222222222222'
const RECIPIENT = '0x3333333333333333333333333333333333333333'

function formatRequest(request: UwULinkRequest): ReturnType<typeof getFormattedUwuLinkTxnRequest> {
  return getFormattedUwuLinkTxnRequest({
    request,
    activeAccount: ACTIVE_ACCOUNT,
    allowList: { contracts: [], tokenRecipients: [] },
    providerManager: undefined as never,
    contractManager: undefined as never,
  })
}

describe(getFormattedUwuLinkTxnRequest, () => {
  it('canonicalizes generic transaction fields and pins the active account before queueing', async () => {
    const result = await formatRequest({
      method: EthMethod.EthSendTransaction,
      chainId: UniverseChainId.Mainnet,
      value: {
        from: DAPP_SUPPLIED_ACCOUNT,
        to: RECIPIENT,
        value: [0],
        gasLimit: [0x52, 0x08],
        data: [0xab, 0xcd],
      },
    } as unknown as UwULinkRequest)

    expect(result.request).toMatchObject({
      type: EthMethod.EthSendTransaction,
      transaction: {
        from: ACTIVE_ACCOUNT.address,
        to: RECIPIENT,
        value: '0x00',
        gasLimit: '0x5208',
        data: '0xabcd',
      },
    })
  })

  it('rejects a generic transaction that cannot be signed', async () => {
    await expect(
      formatRequest({
        method: EthMethod.EthSendTransaction,
        chainId: UniverseChainId.Mainnet,
        value: { to: RECIPIENT, value: '-1' },
      }),
    ).rejects.toThrow('Transaction numeric fields must be unsigned')
  })
})
