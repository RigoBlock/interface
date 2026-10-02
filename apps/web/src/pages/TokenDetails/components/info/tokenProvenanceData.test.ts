import type { PlainMessage } from '@bufbuild/protobuf'
import type { Auction } from '@uniswap/client-data-api/dist/data/v1/auction_pb'
import { UniverseChainId } from '@universe/chains'
import { AuctionDisplayPhase } from '~/features/Toucan/Auction/utils/resolveAuctionDisplayState'
import { getTokenProvenanceData } from '~/pages/TokenDetails/components/info/tokenProvenanceData'

const AUCTION_ADDRESS = '0x1111111111111111111111111111111111111111'
const CREATOR_ADDRESS = '0x2222222222222222222222222222222222222222'

function makeAuction(overrides: Partial<PlainMessage<Auction>> = {}): PlainMessage<Auction> {
  return {
    address: AUCTION_ADDRESS,
    tokenAddress: '0x3333333333333333333333333333333333333333',
    creatorAddress: CREATOR_ADDRESS,
    createdAt: '2026-08-08T12:00:00Z',
    isQuickLaunch: false,
    startBlock: '100',
    endBlock: '200',
    currencyTokenDecimals: 18,
    currencyPriceUsd: '2000',
    xHandle: 'uniswap',
    xVerified: true,
    xProfileImageUrl: 'https://pbs.twimg.com/profile.jpg',
    ...overrides,
  } as PlainMessage<Auction>
}

const ENDED_SUCCESS = {
  chainId: UniverseChainId.Mainnet,
  phase: AuctionDisplayPhase.Ended,
  currencyRaised: { status: 'success', currencyRaised: '5000000000000000000' },
} as const

describe('getTokenProvenanceData', () => {
  it('links a valid X handle with its verified mark and avatar', () => {
    const { creator } = getTokenProvenanceData({ auction: makeAuction(), ...ENDED_SUCCESS })

    expect(creator).toEqual({
      name: '@uniswap',
      href: 'https://x.com/uniswap',
      verified: true,
      avatarUrl: 'https://pbs.twimg.com/profile.jpg',
    })
  })

  it('falls back to the shortened creator address and explorer link without a handle', () => {
    const { creator } = getTokenProvenanceData({
      auction: makeAuction({ xHandle: undefined, xVerified: true, xProfileImageUrl: undefined }),
      ...ENDED_SUCCESS,
    })

    expect(creator.name).toBe('0x2222...2222')
    expect(creator.href).toContain(CREATOR_ADDRESS)
    expect(creator.verified).toBe(false)
    expect(creator.avatarUrl).toBeUndefined()
  })

  it('treats a malformed handle like a missing one', () => {
    const { creator } = getTokenProvenanceData({
      auction: makeAuction({ xHandle: 'intent/follow?screen_name=x' }),
      ...ENDED_SUCCESS,
    })

    expect(creator.name).toBe('0x2222...2222')
    expect(creator.verified).toBe(false)
  })

  it('renders a placeholder creator when neither handle nor address exists', () => {
    const { creator } = getTokenProvenanceData({
      auction: makeAuction({ xHandle: undefined, creatorAddress: '' }),
      ...ENDED_SUCCESS,
    })

    expect(creator).toEqual({ name: '--', href: undefined, verified: false, avatarUrl: undefined })
  })

  it('parses the ISO launch date and drops an unparseable one', () => {
    expect(getTokenProvenanceData({ auction: makeAuction(), ...ENDED_SUCCESS }).launchDate).toEqual(
      new Date('2026-08-08T12:00:00Z'),
    )
    expect(
      getTokenProvenanceData({ auction: makeAuction({ createdAt: 'not-a-date' }), ...ENDED_SUCCESS }).launchDate,
    ).toBeUndefined()
  })

  it('prices the ended raise from the checkpoint and links the auction details page', () => {
    const { raised } = getTokenProvenanceData({ auction: makeAuction(), ...ENDED_SUCCESS })

    expect(raised?.usd).toBeCloseTo(10_000)
    expect(raised?.detailsHref).toBe(`/explore/auctions/ethereum/${AUCTION_ADDRESS}`)
  })

  it('omits the raise row while the auction is live or upcoming', () => {
    for (const phase of [AuctionDisplayPhase.Live, AuctionDisplayPhase.Upcoming, AuctionDisplayPhase.Loading]) {
      expect(getTokenProvenanceData({ auction: makeAuction(), ...ENDED_SUCCESS, phase }).raised).toBeUndefined()
    }
  })

  it('keeps the row but leaves the amount unknown while the checkpoint loads or fails', () => {
    for (const currencyRaised of [{ status: 'loading' }, { status: 'error' }, { status: 'idle' }] as const) {
      const { raised } = getTokenProvenanceData({ auction: makeAuction(), ...ENDED_SUCCESS, currencyRaised })
      expect(raised?.usd).toBeUndefined()
      expect(raised?.detailsHref).toBeDefined()
    }
  })

  it('never reports zero or an unpriced raise as an amount', () => {
    expect(
      getTokenProvenanceData({
        auction: makeAuction(),
        ...ENDED_SUCCESS,
        currencyRaised: { status: 'success', currencyRaised: '0' },
      }).raised?.usd,
    ).toBeUndefined()
    expect(
      getTokenProvenanceData({ auction: makeAuction({ currencyPriceUsd: undefined }), ...ENDED_SUCCESS }).raised?.usd,
    ).toBeUndefined()
    expect(
      getTokenProvenanceData({ auction: makeAuction({ currencyTokenDecimals: undefined }), ...ENDED_SUCCESS }).raised
        ?.usd,
    ).toBeUndefined()
  })

  it.each([-1, 1.5, 256, NaN, Infinity])(
    'leaves the raise unknown for invalid currency decimals %s',
    (currencyTokenDecimals) => {
      expect(
        getTokenProvenanceData({ auction: makeAuction({ currencyTokenDecimals }), ...ENDED_SUCCESS }).raised?.usd,
      ).toBeUndefined()
    },
  )

  it('prices a legitimate zero-decimal currency', () => {
    expect(
      getTokenProvenanceData({
        auction: makeAuction({ currencyTokenDecimals: 0, currencyPriceUsd: '20' }),
        ...ENDED_SUCCESS,
        currencyRaised: { status: 'success', currencyRaised: '5' },
      }).raised?.usd,
    ).toBe(100)
  })

  it.each(['0', '-1', '', 'Infinity', 'NaN'])(
    'leaves the raise unknown for an invalid currency price %s',
    (currencyPriceUsd) => {
      expect(
        getTokenProvenanceData({ auction: makeAuction({ currencyPriceUsd }), ...ENDED_SUCCESS }).raised?.usd,
      ).toBeUndefined()
    },
  )

  it.each(['', 'not-a-number', '-1'])('leaves the raise unknown for an invalid raw amount %s', (currencyRaised) => {
    expect(
      getTokenProvenanceData({
        auction: makeAuction(),
        ...ENDED_SUCCESS,
        currencyRaised: { status: 'success', currencyRaised },
      }).raised?.usd,
    ).toBeUndefined()
  })

  it.each([
    { currencyPriceUsd: '1e308', rawCurrencyRaised: '5000000000000000000' },
    { currencyPriceUsd: '5e-324', rawCurrencyRaised: '1' },
  ])('keeps an unrepresentable USD amount unknown ($currencyPriceUsd)', ({ currencyPriceUsd, rawCurrencyRaised }) => {
    expect(
      getTokenProvenanceData({
        auction: makeAuction({ currencyPriceUsd }),
        ...ENDED_SUCCESS,
        currencyRaised: { status: 'success', currencyRaised: rawCurrencyRaised },
      }).raised?.usd,
    ).toBeUndefined()
  })
})
