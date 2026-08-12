import { BigNumber } from '@ethersproject/bignumber'
import { getAddress } from '@ethersproject/address'
import { Contract } from '@ethersproject/contracts'
import { TransactionResponse } from '@ethersproject/providers'
import { useCallback, useMemo } from 'react'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { TransactionType } from 'uniswap/src/features/transactions/types/transactionDetails'
import { logger } from 'utilities/src/logger/logger'
import { parseUnits } from 'viem'
import { getConnectorClient } from 'wagmi/actions'
import { wagmiConfig } from '~/components/Web3Provider/wagmiConfig'
import { useAccount } from '~/hooks/useAccount'
import { clientToProvider } from '~/hooks/useEthersProvider'
import useSelectChain from '~/hooks/useSelectChain'
import { GmxPosition } from '~/pages/Portfolio/hooks/useGmxPositions'
import {
  buildGmxOrderParams,
  GmxCreateOrderParams,
  GmxOrderType,
  RIGOBLOCK_GMX_ABI,
} from '~/pages/Portfolio/Perps/gmx/abi'
import { useTransactionAdder } from '~/state/transactions/hooks'
import { calculateGasMargin } from '~/utils/calculateGasMargin'
import { WrongChainError } from '~/utils/errors'

export enum GmxOrderAction {
  IncreasePosition = 'increase-position',
  IncreaseCollateral = 'increase-collateral',
  DecreasePosition = 'decrease-position',
  DecreaseCollateral = 'decrease-collateral',
  ClosePosition = 'close-position',
  /** Unified collateral edit; direction is chosen inside the modal */
  DeltaCollateral = 'delta-collateral',
}

/** Maps the unified collateral action to a concrete direction; passes everything else through. */
export function resolveCollateralDirection(
  action: GmxOrderAction,
  direction: 'increase' | 'decrease',
): GmxOrderAction {
  if (action === GmxOrderAction.DeltaCollateral) {
    return direction === 'increase' ? GmxOrderAction.IncreaseCollateral : GmxOrderAction.DecreaseCollateral
  }
  return action
}

const USD_DECIMALS = 30
/** Hardcoded 1% slippage bound, same safety choice as the agentic-operator */
const GMX_SLIPPAGE_BPS = 100n
const BPS_BASE = 10_000n

export interface GmxOrderInput {
  /** Human-readable USD size delta (for increase/decrease position) */
  sizeUsd?: string
  /** Human-readable collateral token amount (for collateral edits) */
  collateralAmount?: string
}

export interface GmxOpenPositionInput {
  marketAddress: string
  collateralTokenAddress: string
  isLong: boolean
  /** Human-readable USD position size */
  sizeUsd: string
  /** Human-readable collateral amount in collateral token units */
  collateralAmount: string
  /** Current mark price for the index token, in GMX's 1e30 scale */
  markPriceRaw: string
  indexDecimals: number
  collateralDecimals: number
}

function isIncrease(action: GmxOrderAction): boolean {
  return action === GmxOrderAction.IncreasePosition || action === GmxOrderAction.IncreaseCollateral
}

/**
 * Computes the acceptable execution price on GMX's 10^(30-indexDecimals) scale
 * from the position's mark price (1e30 scale), applying the slippage bound.
 * Increase: longs pay up to price*(1+slip), shorts down to price*(1-slip).
 * Decrease: longs accept down to price*(1-slip), shorts up to price*(1+slip).
 */
export function computeAcceptablePrice({
  markPriceRaw,
  indexDecimals,
  isLong,
  increase,
}: {
  markPriceRaw: string
  indexDecimals: number
  isLong: boolean
  increase: boolean
}): bigint {
  const currentPrice = BigInt(markPriceRaw || '0') / 10n ** BigInt(indexDecimals)
  const delta = (currentPrice * GMX_SLIPPAGE_BPS) / BPS_BASE
  const favorableMove = increase ? isLong : !isLong
  return favorableMove ? currentPrice + delta : currentPrice - delta
}

export function buildGmxOrderParamsFromInputs({
  marketAddress,
  collateralTokenAddress,
  isLong,
  sizeUsd,
  collateralAmount,
  markPriceRaw,
  indexDecimals,
  collateralDecimals,
  action,
}: {
  marketAddress: string
  collateralTokenAddress: string
  isLong: boolean
  sizeUsd?: string
  collateralAmount?: string
  markPriceRaw: string
  indexDecimals: number
  collateralDecimals: number
  action: GmxOrderAction
}): { functionName: 'createIncreaseOrder' | 'createDecreaseOrder'; params: GmxCreateOrderParams } {
  const increase = isIncrease(action)
  const acceptablePrice = computeAcceptablePrice({
    markPriceRaw,
    indexDecimals,
    isLong,
    increase,
  })

  let sizeDeltaUsd = 0n
  let collateralDeltaAmount = 0n
  switch (action) {
    case GmxOrderAction.IncreasePosition:
      sizeDeltaUsd = parseUnits(sizeUsd || '0', USD_DECIMALS)
      collateralDeltaAmount = parseUnits(collateralAmount || '0', collateralDecimals)
      break
    case GmxOrderAction.IncreaseCollateral:
      collateralDeltaAmount = parseUnits(collateralAmount || '0', collateralDecimals)
      break
    case GmxOrderAction.DecreasePosition:
      sizeDeltaUsd = parseUnits(sizeUsd || '0', USD_DECIMALS)
      break
    case GmxOrderAction.DecreaseCollateral:
      collateralDeltaAmount = parseUnits(collateralAmount || '0', collateralDecimals)
      break
  }

  const params = buildGmxOrderParams({
    market: marketAddress,
    collateralToken: collateralTokenAddress,
    sizeDeltaUsd,
    collateralDeltaAmount,
    acceptablePrice,
    orderType: increase ? GmxOrderType.MarketIncrease : GmxOrderType.MarketDecrease,
    isLong,
  })

  return { functionName: increase ? 'createIncreaseOrder' : 'createDecreaseOrder', params }
}

export function buildParamsForAction({
  action,
  position,
  input,
  indexDecimals,
  collateralDecimals,
}: {
  action: GmxOrderAction
  position: GmxPosition
  input: GmxOrderInput
  indexDecimals: number
  collateralDecimals: number
}): { functionName: 'createIncreaseOrder' | 'createDecreaseOrder'; params: GmxCreateOrderParams } {
  if (action === GmxOrderAction.ClosePosition) {
    const acceptablePrice = computeAcceptablePrice({
      markPriceRaw: position.markPriceRaw,
      indexDecimals,
      isLong: position.isLong,
      increase: false,
    })

    const params = buildGmxOrderParams({
      market: position.marketAddress,
      collateralToken: position.collateralTokenAddress,
      sizeDeltaUsd: BigInt(position.sizeInUsdRaw || '0'),
      collateralDeltaAmount: BigInt(position.collateralAmountRaw || '0'),
      acceptablePrice,
      orderType: GmxOrderType.MarketDecrease,
      isLong: position.isLong,
    })

    return { functionName: 'createDecreaseOrder', params }
  }

  return buildGmxOrderParamsFromInputs({
    marketAddress: position.marketAddress,
    collateralTokenAddress: position.collateralTokenAddress,
    isLong: position.isLong,
    sizeUsd: input.sizeUsd,
    collateralAmount: input.collateralAmount,
    markPriceRaw: position.markPriceRaw,
    indexDecimals,
    collateralDecimals,
    action,
  })
}

/**
 * Builds and sends a GMX v2 order through the smart pool's adapter (Arbitrum).
 * The caller must be the pool operator and the wallet must be on Arbitrum.
 */
export function useGmxOrderCallback(poolAddress?: string): {
  sendGmxOrder: (args: {
    action: GmxOrderAction
    position: GmxPosition
    input: GmxOrderInput
    indexDecimals: number
    collateralDecimals: number
  }) => Promise<string> | undefined
  sendGmxOpenPosition: (input: GmxOpenPositionInput) => Promise<string> | undefined
} {
  const account = useAccount()
  const addTransaction = useTransactionAdder()
  const selectChain = useSelectChain()

  const executeOrder = useCallback(
    async ({
      functionName,
      params,
      marketAddress,
    }: {
      functionName: 'createIncreaseOrder' | 'createDecreaseOrder'
      params: GmxCreateOrderParams
      marketAddress: string
    }): Promise<string> => {
      if (!poolAddress) {
        throw new Error('Pool address is required')
      }
      if (!account.address) {
        throw new Error('Account address is required')
      }

      // Switch to the correct chain if needed
      const switchChainResult = await selectChain(UniverseChainId.ArbitrumOne)
      if (!switchChainResult) {
        throw new WrongChainError()
      }

      // Use the connected wallet client directly, mirroring the standard transaction flow.
      // Do NOT use a hook-derived public provider here: that would forward eth_sendTransaction
      // to a read-only RPC and fail in production.
      const client = await getConnectorClient(wagmiConfig)
      const provider = clientToProvider(client)
      if (!provider) {
        throw new Error('Failed to get wallet provider')
      }

      const signer = provider.getSigner(account.address)
      const gmxContract = new Contract(getAddress(poolAddress), RIGOBLOCK_GMX_ABI, signer)

      logger.info('useGmxOrderCallback', 'executeOrder', `Sending ${functionName} for market ${marketAddress}`, {
        tags: { file: 'useGmxOrderCallback', function: 'executeOrder' },
      })

      const estimatedGasLimit = (await gmxContract.estimateGas[functionName](params)) as BigNumber
      const response = (await gmxContract[functionName](params, {
        gasLimit: calculateGasMargin(estimatedGasLimit),
      })) as TransactionResponse

      addTransaction(response, {
        type: TransactionType.ClaimUni, // TODO: replace with a GMX-specific type
        recipient: account.address,
      })
      return response.hash
    },
    [account.address, addTransaction, poolAddress, selectChain],
  )

  const sendGmxOrder = useCallback(
    ({
      action,
      position,
      input,
      indexDecimals,
      collateralDecimals,
    }: {
      action: GmxOrderAction
      position: GmxPosition
      input: GmxOrderInput
      indexDecimals: number
      collateralDecimals: number
    }): Promise<string> | undefined => {
      if (!poolAddress) {
        return undefined
      }
      const { functionName, params } = buildParamsForAction({
        action,
        position,
        input,
        indexDecimals,
        collateralDecimals,
      })

      return executeOrder({ functionName, params, marketAddress: position.marketAddress })
    },
    [executeOrder, poolAddress],
  )

  const sendGmxOpenPosition = useCallback(
    (input: GmxOpenPositionInput): Promise<string> | undefined => {
      if (!poolAddress) {
        return undefined
      }
      const { functionName, params } = buildGmxOrderParamsFromInputs({
        ...input,
        action: GmxOrderAction.IncreasePosition,
      })

      return executeOrder({ functionName, params, marketAddress: input.marketAddress })
    },
    [executeOrder, poolAddress],
  )

  return useMemo(
    () => ({ sendGmxOrder, sendGmxOpenPosition }),
    [sendGmxOrder, sendGmxOpenPosition],
  )
}
