import { Auction, AuctionType } from '@uniswap/client-data-api/dist/data/v1/auction_pb'
import type { TFunction } from 'i18next'
import {
  AuctionLaunchMethod,
  getAuctionLaunchMethod,
  getAuctionLaunchMethodCopy,
} from '~/features/Toucan/Auction/utils/auctionLaunchMethod'

const t = ((key: string) => key) as unknown as TFunction

describe('getAuctionLaunchMethod', () => {
  it.each([
    [AuctionType.CUSTOM, AuctionLaunchMethod.Custom],
    [AuctionType.CROWD, AuctionLaunchMethod.Crowd],
    [AuctionType.UNSPECIFIED, undefined],
  ])('uses the served auction type %s', (auctionType, expected) => {
    expect(getAuctionLaunchMethod({ auction: new Auction({ auctionType }) })).toBe(expected)
  })

  it.each([false, true])('does not infer a method from isQuickLaunch=%s', (isQuickLaunch) => {
    expect(getAuctionLaunchMethod({ auction: new Auction({ isQuickLaunch }) })).toBeUndefined()
  })
})

describe('getAuctionLaunchMethodCopy', () => {
  it('returns the Crowd Launch copy keys', () => {
    expect(getAuctionLaunchMethodCopy({ method: AuctionLaunchMethod.Crowd, t })).toEqual({
      label: 'toucan.launchMethod.crowd',
      explainerTitle: 'toucan.launchMethod.crowd.title',
      explainerDescription: 'toucan.launchMethod.crowd.description',
    })
  })

  it('returns the Instant Launch copy keys', () => {
    expect(getAuctionLaunchMethodCopy({ method: AuctionLaunchMethod.Instant, t })).toEqual({
      label: 'toucan.launchMethod.instant',
      explainerTitle: 'toucan.launchMethod.instant.title',
      explainerDescription: 'toucan.launchMethod.instant.description',
    })
  })

  it('returns the Custom auction copy keys', () => {
    expect(getAuctionLaunchMethodCopy({ method: AuctionLaunchMethod.Custom, t })).toEqual({
      label: 'toucan.launchMethod.custom',
      explainerTitle: 'toucan.launchMethod.custom.title',
      explainerDescription: 'toucan.launchMethod.custom.description',
    })
  })
})
