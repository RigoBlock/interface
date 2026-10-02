import { AuctionType, type Auction } from '@uniswap/client-data-api/dist/data/v1/auction_pb'
import { TFunction } from 'i18next'

export enum AuctionLaunchMethod {
  Custom = 'CUSTOM',
  Crowd = 'CROWD',
  Instant = 'INSTANT',
}

export function getAuctionLaunchMethod({
  auction,
}: {
  auction: Pick<Auction, 'auctionType'>
}): AuctionLaunchMethod | undefined {
  switch (auction.auctionType) {
    case AuctionType.CUSTOM:
      return AuctionLaunchMethod.Custom
    case AuctionType.CROWD:
      return AuctionLaunchMethod.Crowd
    // TODO(CONS-3228): bonding-curve launches have no auction row; canonical token provenance classifies Instant.
    default:
      return undefined
  }
}

export interface AuctionLaunchMethodCopy {
  label: string
  explainerTitle: string
  explainerDescription: string
}

/** Row label and explainer-modal copy for a launch method, kept together so surfaces can't drift. */
export function getAuctionLaunchMethodCopy({
  method,
  t,
}: {
  method: AuctionLaunchMethod
  t: TFunction
}): AuctionLaunchMethodCopy {
  const copy: Record<AuctionLaunchMethod, AuctionLaunchMethodCopy> = {
    [AuctionLaunchMethod.Custom]: {
      label: t('toucan.launchMethod.custom'),
      explainerTitle: t('toucan.launchMethod.custom.title'),
      explainerDescription: t('toucan.launchMethod.custom.description'),
    },
    [AuctionLaunchMethod.Crowd]: {
      label: t('toucan.launchMethod.crowd'),
      explainerTitle: t('toucan.launchMethod.crowd.title'),
      explainerDescription: t('toucan.launchMethod.crowd.description'),
    },
    [AuctionLaunchMethod.Instant]: {
      label: t('toucan.launchMethod.instant'),
      explainerTitle: t('toucan.launchMethod.instant.title'),
      explainerDescription: t('toucan.launchMethod.instant.description'),
    },
  }
  return copy[method]
}
