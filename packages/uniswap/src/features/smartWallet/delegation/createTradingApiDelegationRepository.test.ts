import type { CheckWalletDelegation } from 'uniswap/src/data/apiClients/tradingApi/TradingApiClient'
import { createTradingApiDelegationRepository } from 'uniswap/src/features/smartWallet/delegation/createTradingApiDelegationRepository'

const WALLET = '0x0000000000000000000000000000000000000001'

function createMockClient(delegationDetails?: Record<string, Record<string, unknown>>) {
  const checkWalletDelegation = vi.fn(async () => ({ delegationDetails })) as unknown as CheckWalletDelegation & {
    mock: { calls: unknown[][] }
  }
  return { checkWalletDelegation }
}

describe('createTradingApiDelegationRepository', () => {
  it('excludes HyperEvm (999) from check_delegation and reports it as not delegated', async () => {
    const { checkWalletDelegation } = createMockClient({
      [WALLET]: {
        '1': {
          currentDelegationAddress: '0xDelegate',
          isWalletDelegatedToUniswap: true,
          latestDelegationAddress: '0xDelegate',
        },
      },
    })
    const repository = createTradingApiDelegationRepository({ tradingApiClient: { checkWalletDelegation } })

    const result = await repository.getWalletDelegations({ address: WALLET, chainIds: [1, 999] })

    // 999 must not reach the API — the backend 400s the entire request when it is present.
    expect(checkWalletDelegation.mock.calls[0]?.[0]).toEqual({ walletAddresses: [WALLET], chainIds: [1] })
    expect(result['1']).toEqual({
      currentDelegationAddress: '0xDelegate',
      isWalletDelegatedToUniswap: true,
      latestDelegationAddress: '0xDelegate',
    })
    expect(result['999']).toBeNull()
  })

  it('never calls the API when every requested chain is delegation-unsupported', async () => {
    const { checkWalletDelegation } = createMockClient()
    const repository = createTradingApiDelegationRepository({ tradingApiClient: { checkWalletDelegation } })

    const result = await repository.getWalletDelegations({ address: WALLET, chainIds: [999] })

    expect(checkWalletDelegation).not.toHaveBeenCalled()
    expect(result['999']).toBeNull()
  })
})
