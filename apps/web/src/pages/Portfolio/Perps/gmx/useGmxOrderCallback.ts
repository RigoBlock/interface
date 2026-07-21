import { BigNumber } from '@ethersproject/bignumber'
import { getAddress } from '@ethersproject/address'
import { TransactionResponse } from '@ethersproject/providers'
import { useCallback, useMemo } from 'react'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { TransactionType } from 'uniswap/src/features/transactions/types/transactionDetails'
import { logger } from 'utilities/src/logger/logger'
import { parseUnits } from 'viem'
import { useAccount } from '~/hooks/useAccount'
import { useContract } from '~/hooks/useContract'
import { GmxPosition } from '~/pages/Portfolio/hooks/useGmxPositions'
import {
  buildGmxOrderParams,
  GmxCreateOrderParams,
  GmxOrderType,
  RIGOBLOCK_GMX_ABI,
} from '~/pages/Portfolio/Perps/gmx/abi'
import { useTransactionAdder } from '~/state/transactions/hooks'

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
  const increase = isIncrease(action)
  const acceptablePrice = computeAcceptablePrice({
    markPriceRaw: position.markPriceRaw,
    indexDecimals,
    isLong: position.isLong,
    increase,
  })

  let sizeDeltaUsd = 0n
  let collateralDeltaAmount = 0n
  switch (action) {
    case GmxOrderAction.IncreasePosition:
      sizeDeltaUsd = parseUnits(input.sizeUsd || '0', USD_DECIMALS)
      collateralDeltaAmount = parseUnits(input.collateralAmount || '0', collateralDecimals)
      break
    case GmxOrderAction.IncreaseCollateral:
      collateralDeltaAmount = parseUnits(input.collateralAmount || '0', collateralDecimals)
      break
    case GmxOrderAction.DecreasePosition:
      sizeDeltaUsd = parseUnits(input.sizeUsd || '0', USD_DECIMALS)
      break
    case GmxOrderAction.DecreaseCollateral:
      collateralDeltaAmount = parseUnits(input.collateralAmount || '0', collateralDecimals)
      break
    case GmxOrderAction.ClosePosition:
      sizeDeltaUsd = BigInt(position.sizeInUsdRaw || '0')
      collateralDeltaAmount = BigInt(position.collateralAmountRaw || '0')
      break
  }

  const params = buildGmxOrderParams({
    market: position.marketAddress,
    collateralToken: position.collateralTokenAddress,
    sizeDeltaUsd,
    collateralDeltaAmount,
    acceptablePrice,
    orderType: increase ? GmxOrderType.MarketIncrease : GmxOrderType.MarketDecrease,
    isLong: position.isLong,
  })

  return { functionName: increase ? 'createIncreaseOrder' : 'createDecreaseOrder', params }
}

/** Hardcoded 1.5M gas limit for GMX v2 orders via the Rigoblock adapter.
 * Observed usage: ~1.04M for createIncreaseOrder + Rigoblock proxy overhead.
 * Estimate gas is attempted first; this value is used as a fallback so the
 * transaction can still be submitted if estimation fails or the wallet is not
 * on Arbitrum. */
const GMX_GAS_LIMIT = 1_500_000

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
} {
  const account = useAccount()
  const addTransaction = useTransactionAdder()

  // getContract requires a checksummed address; poolAddress may arrive lowercase.
  const checksummedAddress = useMemo(() => {
    if (!poolAddress) {
      return undefined
    }
    try {
      return getAddress(poolAddress)
    } catch {
      return undefined
    }
  }, [poolAddress])

  const gmxContract = useContract({
    address: checksummedAddress,
    ABI: RIGOBLOCK_GMX_ABI,
    withSignerIfPossible: true,
    chainId: UniverseChainId.ArbitrumOne,
  })

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
      if (!account.address) {
        logger.error(new Error('GMX order attempted without a connected wallet'), {
          tags: { file: 'useGmxOrderCallback', function: 'sendGmxOrder' },
        })
        return Promise.reject(new Error('Connect your wallet to send an order'))
      }
      if (!gmxContract) {
        logger.error(
          new Error(`Failed to initialize GMX adapter contract at ${checksummedAddress ?? poolAddress}`),
          {
            tags: { file: 'useGmxOrderCallback', function: 'sendGmxOrder' },
          },
        )
        return Promise.reject(new Error('Could not initialize the GMX adapter contract on Arbitrum'))
      }

      const { functionName, params } = buildParamsForAction({
        action,
        position,
        input,
        indexDecimals,
        collateralDecimals,
      })

      logger.info('useGmxOrderCallback', 'sendGmxOrder', `Sending ${functionName} for market ${position.marketAddress}`, {
        tags: { file: 'useGmxOrderCallback', function: 'sendGmxOrder' },
      })

      const txOptions = { gasLimit: BigNumber.from(GMX_GAS_LIMIT).mul(120).div(100) }
      const txPromise = gmxContract[functionName](params, txOptions) as Promise<TransactionResponse>
      return txPromise.then((response: TransactionResponse) => {
        addTransaction(response, {
          type: TransactionType.ClaimUni,
          recipient: account.address ?? '',
        })
        return response.hash
      })
    },
    [account.address, gmxContract, addTransaction, checksummedAddress, poolAddress],
  )

  return { sendGmxOrder }
}
