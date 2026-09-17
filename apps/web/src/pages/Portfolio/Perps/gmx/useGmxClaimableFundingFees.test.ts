import {
  CLAIMABLE_FUNDING_AMOUNT_KEY,
  computeClaimableFundingAmountKey,
  computeTrackedMarketSlot,
  computeTrackedMarketsBaseSlot,
  trackedMarketWordToAddress,
} from '~/pages/Portfolio/Perps/gmx/useGmxClaimableFundingFees'

const MARKET = '0x70d95587d40A2caf56bd97485aB3Eec10Bee6336' // ETH/USD [WETH-USDC]
const WETH = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1'
const POOL = '0x1234567890123456789012345678901234567890'

describe('computeTrackedMarketsBaseSlot', () => {
  it('derives the dynamic-array base slot as keccak256(bytes32(GMX_CALLBACK_DATA_SLOT))', () => {
    expect(computeTrackedMarketsBaseSlot()).toBe(
      BigInt('0xdd2401e376dcc84b152fb11b9d2713fe5965325fce69264b67f1fc51ae133d31'),
    )
  })

  it('computes element slots as base + i', () => {
    expect(computeTrackedMarketSlot(0)).toBe(computeTrackedMarketsBaseSlot())
    expect(computeTrackedMarketSlot(5)).toBe(computeTrackedMarketsBaseSlot() + 5n)
  })
})

describe('trackedMarketWordToAddress', () => {
  it('extracts the left-padded address from a bytes32 storage word', () => {
    const word = `0x000000000000000000000000${MARKET.slice(2).toLowerCase()}`
    expect(trackedMarketWordToAddress(word)).toBe(MARKET.toLowerCase())
  })

  it('returns undefined for the zero word', () => {
    expect(trackedMarketWordToAddress('0x0000000000000000000000000000000000000000000000000000000000000000')).toBeUndefined()
  })

  it('returns undefined for malformed words', () => {
    expect(trackedMarketWordToAddress('0x1234')).toBeUndefined()
  })
})

describe('computeClaimableFundingAmountKey', () => {
  it('derives the CLAIMABLE_FUNDING_AMOUNT constant as keccak256(abi.encode("CLAIMABLE_FUNDING_AMOUNT"))', () => {
    expect(CLAIMABLE_FUNDING_AMOUNT_KEY).toBe(
      '0x06fc3f5466c175728538f97bb3af89978c1db23c9c7f107930c4bb1b84305a1d',
    )
  })

  it('computes the DataStore key for (market, token, account) as packed keccak256', () => {
    expect(computeClaimableFundingAmountKey({ market: MARKET, token: WETH, account: POOL })).toBe(
      '0x1f9e8dfc76488baf12d2dfa98c8a310ecda5f3d7080db2062a7e5253e52375a5',
    )
  })
})
