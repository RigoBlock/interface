import { createRestPriceClient } from 'uniswap/src/features/prices/createRestPriceClient'
import { SAMPLE_SEED_ADDRESS_1, SAMPLE_SEED_ADDRESS_1_LOWERCASE } from 'uniswap/src/test/fixtures/assets/constants'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getTokenPrices: vi.fn(),
}))

vi.mock('@connectrpc/connect', () => {
  return {
    createPromiseClient: vi.fn(() => ({
      getTokenPrices: mocks.getTokenPrices,
    })),
  }
})

// Fork: createRestPriceClient now pulls in createUniswapFetchClient → constants/urls,
// which imports far more than the two stubs below from @universe/api — spread the
// actual module and override only what the price client reads.
vi.mock('@universe/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@universe/api')>()
  return {
    ...actual,
    getEntryGatewayUrl: vi.fn(() => '/entry-gateway'),
    getRbCloudflareApiBaseUrl: vi.fn(() => 'https://interface.gateway.rigoblock.com'),
    getTransport: vi.fn(() => ({})),
  }
})

describe('createRestPriceClient', () => {
  beforeEach(() => {
    mocks.getTokenPrices.mockClear()
    mocks.getTokenPrices.mockResolvedValue({
      tokenPrices: [
        {
          chainId: 1,
          address: SAMPLE_SEED_ADDRESS_1_LOWERCASE,
          priceUsd: 123,
          updatedAt: '2026-05-21T12:00:00.000Z',
        },
      ],
    })
  })

  it('normalizes addresses and tags prices as aurora_rest_fallback', async () => {
    const client = createRestPriceClient()

    const result = await client.getTokenPrices([{ chainId: 1, address: SAMPLE_SEED_ADDRESS_1 }])

    expect(mocks.getTokenPrices).toHaveBeenCalledWith({
      tokens: [{ chainId: 1, address: SAMPLE_SEED_ADDRESS_1_LOWERCASE }],
    })
    expect(result.get(`1-${SAMPLE_SEED_ADDRESS_1_LOWERCASE}`)).toEqual({
      price: 123,
      timestamp: Date.parse('2026-05-21T12:00:00.000Z'),
      source: 'aurora_rest_fallback',
    })
  })
})
