import type { PlainMessage } from '@bufbuild/protobuf'
import type { Auction } from '@uniswap/client-data-api/dist/data/v1/auction_pb'
import type { UniverseChainId } from '@universe/chains'
import { ExplorerDataType, getExplorerLink } from 'uniswap/src/utils/linking'
import { shortenAddress } from 'utilities/src/addresses'
import { approximateNumberFromRaw } from '~/features/Toucan/Auction/utils/fixedPointFdv'
import { parseCreatedAt } from '~/features/Toucan/Auction/utils/parseCreatedAt'
import {
  AuctionDisplayPhase,
  type CurrencyRaisedState,
} from '~/features/Toucan/Auction/utils/resolveAuctionDisplayState'
import { safeBigInt } from '~/features/Toucan/Auction/utils/safeBigInt'
import { getXProfileUrl } from '~/features/Toucan/Auction/utils/tokenMetadata'
import { getAuctionDetailsURL } from '~/utils/auctionDetailsUrl'

export interface TokenProvenanceCreator {
  name: string
  href: string | undefined
  verified: boolean
  avatarUrl: string | undefined
}

export interface TokenProvenanceRaised {
  /** Final raise in USD, before display-currency conversion; undefined when unavailable. */
  usd: number | undefined
  detailsHref: string | undefined
}

export interface TokenProvenanceData {
  creator: TokenProvenanceCreator
  launchDate: Date | undefined
  /** Only ended auctions have a final raise; live and upcoming auctions omit the row entirely. */
  raised: TokenProvenanceRaised | undefined
}

function getCreator({
  auction,
  chainId,
}: {
  auction: PlainMessage<Auction>
  chainId: UniverseChainId
}): TokenProvenanceCreator {
  // getXProfileUrl validates the handle, so a malformed value falls back to the address instead of
  // linking an arbitrary x.com path under a verified mark.
  const xProfileUrl = auction.xHandle ? getXProfileUrl(auction.xHandle) : undefined
  if (xProfileUrl) {
    return {
      name: `@${auction.xHandle}`,
      href: xProfileUrl,
      verified: auction.xVerified === true,
      avatarUrl: auction.xProfileImageUrl || undefined,
    }
  }

  if (!auction.creatorAddress) {
    return { name: '--', href: undefined, verified: false, avatarUrl: undefined }
  }

  return {
    name: shortenAddress({ address: auction.creatorAddress, chars: 4 }),
    href: getExplorerLink({ chainId, data: auction.creatorAddress, type: ExplorerDataType.ADDRESS }),
    verified: false,
    avatarUrl: undefined,
  }
}

function getLaunchDate(createdAt: string): Date | undefined {
  const { timestampMs } = parseCreatedAt(createdAt)
  return timestampMs === undefined ? undefined : new Date(timestampMs)
}

function hasValidRaisedUsdInputs(inputs: {
  raw: bigint | null
  decimals: number | undefined
  priceUsd: number | undefined
}): inputs is { raw: bigint; decimals: number; priceUsd: number } {
  const { raw, decimals, priceUsd } = inputs
  // ERC-20 decimals are uint8; invalid metadata must not change the scale of the raise.
  return (
    raw !== null &&
    raw > 0n &&
    decimals !== undefined &&
    Number.isInteger(decimals) &&
    decimals >= 0 &&
    decimals <= 255 &&
    priceUsd !== undefined &&
    Number.isFinite(priceUsd) &&
    priceUsd > 0
  )
}

// The checkpoint's currency_raised priced at the auction's currency price — never total bid volume,
// and never a zero placeholder when the amount is unknown.
function getRaisedUsd({
  auction,
  currencyRaised,
}: {
  auction: PlainMessage<Auction>
  currencyRaised: CurrencyRaisedState
}): number | undefined {
  if (currencyRaised.status !== 'success') {
    return undefined
  }
  const inputs = {
    raw: safeBigInt(currencyRaised.currencyRaised),
    decimals: auction.currencyTokenDecimals,
    priceUsd: auction.currencyPriceUsd !== undefined ? Number(auction.currencyPriceUsd) : undefined,
  }
  if (!hasValidRaisedUsdInputs(inputs)) {
    return undefined
  }
  const { raw, decimals, priceUsd } = inputs
  const usd = approximateNumberFromRaw({ raw, decimals }) * priceUsd
  return Number.isFinite(usd) && usd > 0 ? usd : undefined
}

export function getTokenProvenanceData({
  auction,
  chainId,
  phase,
  currencyRaised,
}: {
  auction: PlainMessage<Auction>
  chainId: UniverseChainId
  phase: AuctionDisplayPhase
  currencyRaised: CurrencyRaisedState
}): TokenProvenanceData {
  return {
    creator: getCreator({ auction, chainId }),
    launchDate: getLaunchDate(auction.createdAt),
    raised:
      phase === AuctionDisplayPhase.Ended
        ? {
            usd: getRaisedUsd({ auction, currencyRaised }),
            detailsHref: getAuctionDetailsURL({ chainId, auctionAddress: auction.address }),
          }
        : undefined,
  }
}
