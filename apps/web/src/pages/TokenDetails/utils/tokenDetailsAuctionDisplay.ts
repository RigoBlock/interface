import type { PlainMessage, Timestamp } from '@bufbuild/protobuf'
import type { Auction } from '@uniswap/client-data-api/dist/data/v1/auction_pb'
import type { EVMUniverseChainId } from '@universe/chains'
import { AuctionLaunchMethod, getAuctionLaunchMethod } from '~/features/Toucan/Auction/utils/auctionLaunchMethod'
import {
  AuctionDisplayPhase,
  PoolAvailability,
  resolveAuctionDisplayState,
  type AuctionDisplayResult,
  type CurrencyRaisedState,
  type CurrentBlockState,
} from '~/features/Toucan/Auction/utils/resolveAuctionDisplayState'
import type { TokenPoolState } from '~/types/tokenPool'

export interface TokenDetailsAuctionDisplay {
  /** Present only when the TDP resolved an auction on an EVM chain; the other fields are inert without it. */
  auction: PlainMessage<Auction> | undefined
  chainId: EVMUniverseChainId | undefined
  /** Classified by the served enum, never inferred from isQuickLaunch. */
  launchMethod?: AuctionLaunchMethod
  phase: AuctionDisplayPhase
  result: AuctionDisplayResult
  poolAvailability: PoolAvailability
  /** Pool-only resolver result; replacing TDP Swap additionally requires a known Custom method that has not ended. */
  shouldShowSwap: boolean
  /** Optional start estimate while Upcoming or end estimate while Live. */
  phaseEndsAtMs: number | undefined
  currencyRaised: CurrencyRaisedState
}

function timestampToMs(timestamp: PlainMessage<Timestamp> | undefined): number | undefined {
  return timestamp ? Number(timestamp.seconds) * 1000 + Math.floor(timestamp.nanos / 1_000_000) : undefined
}

export function resolveTokenDetailsAuctionDisplay({
  auction,
  chainId,
  currentBlock,
  currencyRaised,
  pools,
}: {
  auction: PlainMessage<Auction> | undefined
  chainId: EVMUniverseChainId | undefined
  currentBlock: CurrentBlockState
  currencyRaised: CurrencyRaisedState
  pools: TokenPoolState
}): TokenDetailsAuctionDisplay {
  const state = resolveAuctionDisplayState({ auction: auction ?? null, currentBlock, currencyRaised, pools })
  let phaseEndsAtMs: number | undefined
  if (state.phase === AuctionDisplayPhase.Upcoming) {
    phaseEndsAtMs = timestampToMs(auction?.estimatedStartTime)
  } else if (state.phase === AuctionDisplayPhase.Live) {
    phaseEndsAtMs = timestampToMs(auction?.estimatedEndTime)
  }

  return {
    ...state,
    auction,
    chainId,
    launchMethod: auction ? getAuctionLaunchMethod({ auction }) : undefined,
    phaseEndsAtMs,
    currencyRaised,
  }
}

/** Custom auctions without a pool replace the trading layout only while they have not ended. */
export function shouldShowAuctionOnlyLayout({
  launchMethod,
  phase,
  shouldShowSwap,
}: TokenDetailsAuctionDisplay): boolean {
  return launchMethod === AuctionLaunchMethod.Custom && phase !== AuctionDisplayPhase.Ended && !shouldShowSwap
}

/** Tradeable Custom auction tokens (pool exists) with a live auction get a banner pointing back at it. */
export function shouldShowLiveAuctionBanner({
  launchMethod,
  phase,
  poolAvailability,
}: TokenDetailsAuctionDisplay): boolean {
  return (
    launchMethod === AuctionLaunchMethod.Custom &&
    phase === AuctionDisplayPhase.Live &&
    poolAvailability === PoolAvailability.HasPool
  )
}

export function shouldReserveLiveAuctionBannerSpace(
  display: TokenDetailsAuctionDisplay & { isInitialLoading: boolean },
): boolean {
  return (
    shouldShowLiveAuctionBanner(display) ||
    (display.isInitialLoading &&
      display.launchMethod === AuctionLaunchMethod.Custom &&
      display.phase === AuctionDisplayPhase.Live)
  )
}
