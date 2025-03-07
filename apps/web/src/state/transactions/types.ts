import { TradeType } from '@uniswap/sdk-core'
import { VoteOption } from 'state/governance/types'
import {
  AssetActivityPartsFragment,
  TransactionDetailsPartsFragment,
  TransactionStatus,
} from 'uniswap/src/data/graphql/uniswap-data-api/__generated__/types-and-hooks'
import { UniverseChainId } from 'uniswap/src/types/chains'

export type TransactionActivity = AssetActivityPartsFragment & { details: TransactionDetailsPartsFragment }

/**
 * Always add to the bottom of this enum because these values is persisted in state and if you change the value it will cause errors
 */
export enum TransactionType {
  APPROVAL = 0,
  SWAP,
  DEPOSIT_LIQUIDITY_STAKING,
  WITHDRAW_LIQUIDITY_STAKING,
  CLAIM,
  VOTE,
  DELEGATE,
  WRAP,
  CREATE_V3_POOL,
  ADD_LIQUIDITY_V3_POOL,
  ADD_LIQUIDITY_V2_POOL,
  MIGRATE_LIQUIDITY_V3,
  COLLECT_FEES,
  REMOVE_LIQUIDITY_V3,
  SUBMIT_PROPOSAL,
  QUEUE,
  EXECUTE,
  BUY,
  SEND,
  RECEIVE,
  MINT,
  BURN,
  BORROW,
  REPAY,
  DEPLOY,
  CANCEL,
  LIMIT,
  SELL,
  SET_SPREAD,
  SET_LOCKUP,
  SET_VALUE,
  INCREASE_LIQUIDITY,
  DECREASE_LIQUIDITY,
  BRIDGE,
  // Always add to the bottom of this enum
}

interface BaseTransactionInfo {
  type: TransactionType
}

export interface VoteTransactionInfo extends BaseTransactionInfo {
  type: TransactionType.VOTE
  governorAddress: string
  proposalId: number
  decision: VoteOption
  reason: string
}

export interface QueueTransactionInfo extends BaseTransactionInfo {
  type: TransactionType.QUEUE
  governorAddress: string
  proposalId: number
}

export interface ExecuteTransactionInfo extends BaseTransactionInfo {
  type: TransactionType.EXECUTE
  governorAddress: string
  proposalId: number
}

export interface DelegateTransactionInfo extends BaseTransactionInfo {
  type: TransactionType.DELEGATE
  delegatee: string
}

export interface ApproveTransactionInfo extends BaseTransactionInfo {
  type: TransactionType.APPROVAL
  tokenAddress: string
  spender: string
  amount: string
}

interface BaseSwapTransactionInfo extends BaseTransactionInfo {
  type: TransactionType.SWAP
  tradeType: TradeType
  inputCurrencyId: string
  outputCurrencyId: string
  isUniswapXOrder: boolean
}

export interface BridgeTransactionInfo extends BaseTransactionInfo {
  type: TransactionType.BRIDGE
  inputCurrencyId: string
  inputChainId: UniverseChainId
  inputCurrencyAmountRaw: string
  outputCurrencyId: string
  outputChainId: UniverseChainId
  outputCurrencyAmountRaw: string
  quoteId?: string
  depositConfirmed: boolean
}

export interface ExactInputSwapTransactionInfo extends BaseSwapTransactionInfo {
  tradeType: TradeType.EXACT_INPUT
  inputCurrencyAmountRaw: string
  expectedOutputCurrencyAmountRaw: string
  minimumOutputCurrencyAmountRaw: string
  settledOutputCurrencyAmountRaw?: string
}
export interface ExactOutputSwapTransactionInfo extends BaseSwapTransactionInfo {
  tradeType: TradeType.EXACT_OUTPUT
  outputCurrencyAmountRaw: string
  expectedInputCurrencyAmountRaw: string
  maximumInputCurrencyAmountRaw: string
}

interface DepositLiquidityStakingTransactionInfo {
  type: TransactionType.DEPOSIT_LIQUIDITY_STAKING
  token0Address: string
  token1Address: string
}

interface WithdrawLiquidityStakingTransactionInfo {
  type: TransactionType.WITHDRAW_LIQUIDITY_STAKING
  token0Address: string
  token1Address: string
}

export interface WrapTransactionInfo {
  type: TransactionType.WRAP
  unwrapped: boolean
  currencyAmountRaw: string
  chainId?: number
}

export interface ClaimTransactionInfo {
  type: TransactionType.CLAIM
  recipient: string
  uniAmountRaw?: string
}

export interface CreateV3PoolTransactionInfo {
  type: TransactionType.CREATE_V3_POOL
  baseCurrencyId?: string
  quoteCurrencyId?: string
}

export interface IncreaseLiquidityTransactionInfo {
  type: TransactionType.INCREASE_LIQUIDITY
  token0CurrencyId: string
  token1CurrencyId: string
  token0CurrencyAmountRaw: string
  token1CurrencyAmountRaw: string
}

export interface DecreaseLiquidityTransactionInfo {
  type: TransactionType.DECREASE_LIQUIDITY
  token0CurrencyId: string
  token1CurrencyId: string
  token0CurrencyAmountRaw: string
  token1CurrencyAmountRaw: string
}

export interface AddLiquidityV3PoolTransactionInfo {
  type: TransactionType.ADD_LIQUIDITY_V3_POOL
  createPool: boolean
  baseCurrencyId: string
  quoteCurrencyId: string
  feeAmount: number
  expectedAmountBaseRaw: string
  expectedAmountQuoteRaw: string
}

export interface AddLiquidityV2PoolTransactionInfo {
  type: TransactionType.ADD_LIQUIDITY_V2_POOL
  baseCurrencyId: string
  quoteCurrencyId: string
  expectedAmountBaseRaw: string
  expectedAmountQuoteRaw: string
}

export interface MigrateV2LiquidityToV3TransactionInfo {
  type: TransactionType.MIGRATE_LIQUIDITY_V3
  baseCurrencyId: string
  quoteCurrencyId: string
  isFork: boolean
}

export interface CollectFeesTransactionInfo {
  type: TransactionType.COLLECT_FEES
  currencyId0: string
  currencyId1: string
  expectedCurrencyOwed0: string
  expectedCurrencyOwed1: string
}

export interface RemoveLiquidityV3TransactionInfo {
  type: TransactionType.REMOVE_LIQUIDITY_V3
  baseCurrencyId: string
  quoteCurrencyId: string
  expectedAmountBaseRaw: string
  expectedAmountQuoteRaw: string
}

interface SubmitProposalTransactionInfo {
  type: TransactionType.SUBMIT_PROPOSAL
}

export interface SendTransactionInfo {
  type: TransactionType.SEND
  currencyId: string
  amount: string
  recipient: string
}

export interface BuySmartPoolTransactionInfo {
  type: TransactionType.BUY
}

export interface SellSmartPoolTransactionInfo {
  type: TransactionType.SELL
}

export interface SetSmartPoolSpreadTransactionInfo {
  type: TransactionType.SET_SPREAD
}

export interface SetSmartPoolLockupPoolTransactionInfo {
  type: TransactionType.SET_LOCKUP
}

export interface SetSmartPoolValuePoolTransactionInfo {
  type: TransactionType.SET_VALUE
}

export type TransactionInfo =
  | ApproveTransactionInfo
  | ExactOutputSwapTransactionInfo
  | ExactInputSwapTransactionInfo
  | ClaimTransactionInfo
  | VoteTransactionInfo
  | QueueTransactionInfo
  | ExecuteTransactionInfo
  | DelegateTransactionInfo
  | DepositLiquidityStakingTransactionInfo
  | WithdrawLiquidityStakingTransactionInfo
  | WrapTransactionInfo
  | CreateV3PoolTransactionInfo
  | AddLiquidityV3PoolTransactionInfo
  | AddLiquidityV2PoolTransactionInfo
  | MigrateV2LiquidityToV3TransactionInfo
  | CollectFeesTransactionInfo
  | RemoveLiquidityV3TransactionInfo
  | SubmitProposalTransactionInfo
  | SendTransactionInfo
  | BuySmartPoolTransactionInfo
  | SellSmartPoolTransactionInfo
  | SetSmartPoolSpreadTransactionInfo
  | SetSmartPoolLockupPoolTransactionInfo
  | SetSmartPoolValuePoolTransactionInfo
  | IncreaseLiquidityTransactionInfo
  | DecreaseLiquidityTransactionInfo
  | BridgeTransactionInfo

interface BaseTransactionDetails {
  status: TransactionStatus
  hash: string
  addedTime: number
  from: string
  info: TransactionInfo
  nonce?: number
  cancelled?: true
}

export interface PendingTransactionDetails extends BaseTransactionDetails {
  status: TransactionStatus.Pending
  lastCheckedBlockNumber?: number
  deadline?: number
}

export interface ConfirmedTransactionDetails extends BaseTransactionDetails {
  status: TransactionStatus.Confirmed | TransactionStatus.Failed
  confirmedTime: number
}

export type TransactionDetails = PendingTransactionDetails | ConfirmedTransactionDetails
