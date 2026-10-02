import type { PlainMessage } from '@bufbuild/protobuf'
import { Amount, ChainToken, PoolStats, TokenStats } from '@uniswap/client-explore/dist/uniswap/explore/v1/service_pb'
import type { FeeData as CreatePositionFeeData, PositionRewardApr } from 'uniswap/src/features/positions/types'

/** Explore URL tab segments — shared routing / URL surface (not feature-local). */
export enum ExploreTab {
  Tokens = 'tokens',
  Pools = 'pools',
  Transactions = 'transactions',
  Toucan = 'auctions',
}

type PricePoint = { timestamp: number; value: number }

export type LegacyExploreStatChainToken = Pick<
  PlainMessage<ChainToken>,
  'chainId' | 'address' | 'decimals' | 'isBridged'
> &
  Partial<Pick<PlainMessage<ChainToken>, 'volume1h' | 'volume1d' | 'volume7d' | 'volume30d' | 'volume1y'>>

/** Data-only shape for token stats (display/API). Plain type so plain objects satisfy it without cast. */
export type TokenStat = Omit<
  PlainMessage<TokenStats>,
  'volume1Hour' | 'volume1Day' | 'volume1Week' | 'volume1Month' | 'volume1Year' | 'chainTokens'
> & {
  volume?: Amount
  priceHistory?: PricePoint[]
  /** Stable key for sparkline/cache/row: multichainId when from multichain, normalized address when single-chain. */
  id?: string
  chainTokens?: LegacyExploreStatChainToken[]
}

type PoolStatWithoutMethods = Omit<
  PoolStats,
  | 'clone'
  | 'toBinary'
  | 'toJson'
  | 'equals'
  | 'fromBinary'
  | 'fromJson'
  | 'fromJsonString'
  | 'toJsonString'
  | 'getType'
  | 'feeTier'
>

export interface PoolStat extends PoolStatWithoutMethods {
  /** Backend-served fee APR in percent units (4.99 = 4.99%), from `PoolRankStats.apr`. */
  apr?: number
  /** Backend-summed fee + reward APR, from `PoolRankStats.totalApr`. Never recomposed here. */
  totalApr?: number
  boostedApr?: number
  /**
   * The tokens `boostedApr` is paid in, one entry per token, from `PoolRankStats.token_boosts`.
   * Empty when the pool runs no live campaign — every reward badge renders nothing on an empty list.
   */
  rewards?: PositionRewardApr[]
  volOverTvl?: number
  hookAddress?: string
  feeTier?: CreatePositionFeeData
  /** Backend-served per-pool protocol fee (integer pips); shared with the fee-display column. */
  protocolFeePips?: number
}
