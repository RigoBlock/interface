/* eslint-disable max-lines */

import { BigNumber, type BigNumberish } from '@ethersproject/bignumber'
import { Currency } from '@uniswap/sdk-core'
import { TradingApi } from '@universe/api'
import { normalizeTokenAddressForCache } from 'uniswap/src/data/cache'
import ms from 'ms'
import { useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { call, put, type SagaGenerator } from 'typed-redux-saga'
import POOL_EXTENDED_ABI from 'uniswap/src/abis/pool-extended.json'
import { resolvePlatform } from 'uniswap/src/features/accounts/store/utils/flexibleInput'
import { type UniverseChainId } from 'uniswap/src/features/chains/types'
import { isL2ChainId } from 'uniswap/src/features/chains/utils'
import { useLocalizationContext } from 'uniswap/src/features/language/LocalizationContext'
import { Platform } from 'uniswap/src/features/platforms/types/Platform'
import { SwapEventName } from 'uniswap/src/features/telemetry/constants'
import { sendAnalyticsEvent } from 'uniswap/src/features/telemetry/send'
import { type SwapTradeBaseProperties } from 'uniswap/src/features/telemetry/types'
import { selectSwapStartTimestamp } from 'uniswap/src/features/timing/selectors'
import { updateSwapStartTimestamp } from 'uniswap/src/features/timing/slice'
import {
  SmartPoolBridgeError,
  TokenPriceFeedError,
  UnexpectedTransactionStateError,
} from 'uniswap/src/features/transactions/errors'
import {
  HandleSwapBatchedStepParams,
  type HandleSwapStepParams,
  type TransactionStep,
  TransactionStepType,
} from 'uniswap/src/features/transactions/steps/types'
import {
  type ExtractedBaseTradeAnalyticsProperties,
  getBaseTradeAnalyticsProperties,
} from 'uniswap/src/features/transactions/swap/analytics'
import { planActions } from 'uniswap/src/features/transactions/swap/plan/planSaga'
import { type PlanAnalyticsFields, planAnalyticsToCamelCase } from 'uniswap/src/features/transactions/swap/plan/types'
import { handleSwitchChains } from 'uniswap/src/features/transactions/swap/plan/utils'
import { getSwapTxRequest } from 'uniswap/src/features/transactions/swap/steps/swap'
import { useSwapFormStore } from 'uniswap/src/features/transactions/swap/stores/swapFormStore/useSwapFormStore'
import {
  type SwapCallback,
  type SwapCallbackParams,
  type SwapExecutionCallbacks,
} from 'uniswap/src/features/transactions/swap/types/swapCallback'
import {
  PermitMethod,
  type ValidatedSwapTxContext,
} from 'uniswap/src/features/transactions/swap/types/swapTxAndGasInfo'
import {
  type BridgeTrade,
  type ChainedActionTrade,
  type ClassicTrade,
} from 'uniswap/src/features/transactions/swap/types/trade'
import { getBridgeSyncMode } from 'uniswap/src/features/transactions/swap/utils/bridgeSyncMode'
import { slippageToleranceToPercent } from 'uniswap/src/features/transactions/swap/utils/format'
import { generateSwapTransactionSteps } from 'uniswap/src/features/transactions/swap/utils/generateSwapTransactionSteps'
import {
  isClassic,
  isJupiter,
  requireRouting,
  UNISWAPX_ROUTING_VARIANTS,
} from 'uniswap/src/features/transactions/swap/utils/routing'
import { getClassicQuoteFromResponse } from 'uniswap/src/features/transactions/swap/utils/tradingApi'
import { createMonitoredSaga } from 'uniswap/src/utils/saga'
import { getContract } from 'utilities/src/contracts/getContract'
import { logger } from 'utilities/src/logger/logger'
import { useEvent } from 'utilities/src/react/hooks'
import { useTrace } from 'utilities/src/telemetry/trace/TraceContext'
import { useTotalBalancesUsdForAnalytics } from '~/appGraphql/data/apollo/useTotalBalancesUsdForAnalytics'
import { popupRegistry } from '~/components/Popups/registry'
import { PopupType } from '~/components/Popups/types'
import { DEFAULT_TXN_DISMISS_MS, L2_TXN_DISMISS_MS, ZERO_PERCENT } from '~/constants/misc'
import { RPC_PROVIDERS } from '~/constants/providers'
import { useAccountsStore, useActiveAccount } from '~/features/accounts/store/hooks'
import useSelectChain from '~/hooks/useSelectChain'
import { formatSwapSignedAnalyticsEventProperties } from '~/lib/utils/analytics'
import { PendingModalError } from '~/pages/Swap/Limit/ConfirmSwapModal/Error'
import { useSetOverrideOneClickSwapFlag } from '~/pages/Swap/settings/OneClickSwap'
import { handleAtomicSendCalls } from '~/state/sagas/transactions/5792'
import {
  checkDestinationPoolHealth,
  checkSmartPoolBridgeFeasibility,
  computeDestinationSimulationCompensation,
  extractExpandedMessageFromTrace,
  fetchTokenPriceUSD,
  getAcrossDepositInfo,
  isAcrossDepositV3,
  modifyAcrossDepositV3ForSmartPool,
  OpType,
  queryAcrossRelayerGasFee,
  type AcrossRelayFeeResult,
} from '~/state/sagas/transactions/bridgeCalldata'
import { useGetOnPressRetry } from '~/state/sagas/transactions/retry'
import { jupiterSwap } from '~/state/sagas/transactions/solana'
import { handleUniswapXPlanSignatureStep, handleUniswapXSignatureStep } from '~/state/sagas/transactions/uniswapx'
import { modifyV4ExecuteCalldata, stripBalanceCheckERC20 } from '~/state/sagas/transactions/universalRouterCalldata'
import {
  getDisplayableError,
  getSwapTransactionInfo,
  handleApprovalTransactionStep,
  handleOnChainStep,
  //handlePermitTransactionStep,
  handleSignatureStep,
  sendToast,
  waitForBatch,
} from '~/state/sagas/transactions/utils'
import { type ValidatedTransactionRequest } from 'uniswap/src/features/transactions/types/transactionRequests'
import { type VitalTxFields } from '~/state/transactions/types'

interface ResolveOutputTokenPriceUSDParams {
  outputTokenPriceUSD?: number
  destinationChainId: number
  outputToken: string
}

function* resolveOutputTokenPriceUSD(
  params: ResolveOutputTokenPriceUSDParams,
): SagaGenerator<number | undefined> {
  const { outputTokenPriceUSD, destinationChainId, outputToken } = params
  if (outputTokenPriceUSD) {
    return outputTokenPriceUSD
  }
  try {
    const fetched = yield* call(fetchTokenPriceUSD, destinationChainId, outputToken)
    if (fetched) {
      logger.debug('swapSaga', 'handleSwapTransactionStep', 'Output token price fetched from CoinGecko', {
        price: fetched,
        outputToken,
        destinationChainId,
      })
    }
    return fetched
  } catch (priceError) {
    logger.debug('swapSaga', 'handleSwapTransactionStep', 'CoinGecko token price fetch failed', {
      error: priceError,
    })
    return undefined
  }
}

interface ValidateAcrossFeeResultParams {
  acrossFeeResult: AcrossRelayFeeResult | undefined
  trade: ClassicTrade | BridgeTrade | ChainedActionTrade
}

function validateAcrossFeeResult(params: ValidateAcrossFeeResultParams): void {
  const { acrossFeeResult, trade } = params
  if (acrossFeeResult?.isAmountTooLow) {
    throw new SmartPoolBridgeError(
      'Bridge amount is below the Across minimum for this route. Increase the amount or try a different route.',
    )
  }
  if (acrossFeeResult?.limits) {
    const maxDeposit = BigNumber.from(acrossFeeResult.limits.maxDeposit || '0')
    const depositInputAmount = BigNumber.from(trade.inputAmount.quotient.toString())
    if (maxDeposit.gt(0) && depositInputAmount.gt(maxDeposit)) {
      throw new SmartPoolBridgeError(
        'Bridge amount exceeds available solver liquidity on the destination chain. ' +
          'Try a smaller amount or wait for more liquidity.',
      )
    }
    if (acrossFeeResult.estimatedFillTimeSec && acrossFeeResult.estimatedFillTimeSec > 3600) {
      logger.warn('swapSaga', 'handleSwapTransactionStep', 'Bridge fill may be slow', {
        estimatedFillTimeSec: acrossFeeResult.estimatedFillTimeSec,
        maxDepositInstant: acrossFeeResult.limits.maxDepositInstant,
      })
    }
  }
}

interface ComputeTraceMessageOverheadCompensationParams {
  address: string
  smartPoolAddress: string
  calldata: string
  chainId: number
  destinationChainId: number
  recipient: string
  outputTokenPriceUSD?: number
  outputTokenDecimals: number
  inputTokenDecimals: number
  acrossFeeResult: AcrossRelayFeeResult | undefined
  bridgeOpType: OpType
  originalValue?: BigNumberish
}

function* computeTraceMessageOverheadCompensation(
  params: ComputeTraceMessageOverheadCompensationParams,
): SagaGenerator<BigNumber | undefined> {
  const {
    address,
    smartPoolAddress,
    calldata,
    chainId,
    recipient,
    outputTokenPriceUSD,
    outputTokenDecimals,
    inputTokenDecimals,
    acrossFeeResult,
    bridgeOpType,
    originalValue,
  } = params
  const sourceProvider =
    chainId in RPC_PROVIDERS ? RPC_PROVIDERS[chainId as keyof typeof RPC_PROVIDERS] : undefined
  if (!sourceProvider || !acrossFeeResult) {
    return undefined
  }
  try {
    const initialCalldata = modifyAcrossDepositV3ForSmartPool({
      calldata,
      smartPoolAddress,
      value: String(originalValue || '0'),
      opType: bridgeOpType,
      outputTokenPriceUSD,
      outputTokenDecimals,
      inputTokenDecimals,
      messageOverheadCompensation: BigNumber.from(0),
    })
    const expandedMessage = yield* call(extractExpandedMessageFromTrace, {
      provider: sourceProvider,
      from: address,
      to: smartPoolAddress,
      data: initialCalldata,
    })
    if (!expandedMessage) {
      return undefined
    }
    const acrossWithMessage = yield* call(queryAcrossRelayerGasFee, {
      originChainId: chainId,
      calldata,
      message: expandedMessage,
      recipient,
    })
    if (!acrossWithMessage) {
      return undefined
    }
    const baseGasFee = BigNumber.from(acrossFeeResult.relayerGasFeeTotal || '0')
    const fullGasFee = BigNumber.from(acrossWithMessage.relayerGasFeeTotal || '0')
    if (!fullGasFee.gt(baseGasFee)) {
      return undefined
    }
    const messageOverheadInputUnits = fullGasFee.sub(baseGasFee)
    const messageOverheadCompensation = messageOverheadInputUnits
      .mul(BigNumber.from(10).pow(outputTokenDecimals))
      .div(BigNumber.from(10).pow(inputTokenDecimals))
    logger.debug('swapSaga', 'handleSwapTransactionStep', 'Across message overhead computed', {
      baseGasFee: baseGasFee.toString(),
      fullGasFee: fullGasFee.toString(),
      messageOverheadInputUnits: messageOverheadInputUnits.toString(),
      compensationOutputUnits: messageOverheadCompensation.toString(),
    })
    return messageOverheadCompensation
  } catch (traceError) {
    logger.debug('swapSaga', 'handleSwapTransactionStep', 'Trace-based message extraction unavailable', {
      error: traceError,
    })
    return undefined
  }
}

interface TryDestinationSimulationCompensationParams {
  destinationChainId: number
  smartPoolAddress: string
  outputTokenPriceUSD?: number
  outputTokenDecimals: number
}

function* tryDestinationSimulationCompensation(
  params: TryDestinationSimulationCompensationParams,
): SagaGenerator<BigNumber | undefined> {
  const { destinationChainId, smartPoolAddress, outputTokenPriceUSD, outputTokenDecimals } = params
  if (!outputTokenPriceUSD) {
    return undefined
  }
  const destProvider =
    destinationChainId in RPC_PROVIDERS
      ? RPC_PROVIDERS[destinationChainId as keyof typeof RPC_PROVIDERS]
      : undefined
  if (!destProvider) {
    return undefined
  }
  try {
    const destCompensation = yield* call(computeDestinationSimulationCompensation, {
      provider: destProvider,
      poolAddress: smartPoolAddress,
      destinationChainId,
      outputTokenPriceUSD,
      outputTokenDecimals,
    })
    if (destCompensation) {
      logger.debug('swapSaga', 'handleSwapTransactionStep', 'Destination simulation compensation computed', {
        compensation: destCompensation.toString(),
        destinationChainId,
      })
    }
    return destCompensation
  } catch (destError) {
    logger.debug('swapSaga', 'handleSwapTransactionStep', 'Destination simulation unavailable', {
      error: destError,
    })
    return undefined
  }
}

interface CheckBridgeDestinationPoolHealthParams {
  destinationChainId: number
  smartPoolAddress: string
}

function* checkBridgeDestinationPoolHealth(
  params: CheckBridgeDestinationPoolHealthParams,
): SagaGenerator<void> {
  const { destinationChainId, smartPoolAddress } = params
  const destProvider =
    destinationChainId in RPC_PROVIDERS
      ? RPC_PROVIDERS[destinationChainId as keyof typeof RPC_PROVIDERS]
      : undefined
  if (!destProvider) {
    return
  }
  const poolHealth = yield* call(checkDestinationPoolHealth, {
    provider: destProvider,
    poolAddress: smartPoolAddress,
  })
  if (!poolHealth.healthy) {
    throw new SmartPoolBridgeError(poolHealth.error || 'Bridge fill would fail on the destination chain.')
  }
}

interface EstimateBridgeGasParams {
  txRequest: ValidatedTransactionRequest
  address: string
  smartPoolAddress: string
  chainId: number
  calldata: string
}

function* estimateBridgeGas(params: EstimateBridgeGasParams): SagaGenerator<void> {
  const { txRequest, address, smartPoolAddress, chainId, calldata } = params
  const provider =
    chainId in RPC_PROVIDERS ? RPC_PROVIDERS[chainId as keyof typeof RPC_PROVIDERS] : undefined
  if (!provider) {
    return
  }
  try {
    const gasEstimate = yield* call([provider, provider.estimateGas], {
      from: address,
      to: smartPoolAddress,
      data: calldata,
      value: '0',
    })
    txRequest.gasLimit = gasEstimate.mul(120).div(100).toString()
    logger.debug('swapSaga', 'handleSwapTransactionStep', 'Bridge gas estimated', {
      estimated: gasEstimate.toString(),
      withMargin: txRequest.gasLimit,
    })
  } catch (gasError) {
    const gasErrorMsg = gasError instanceof Error ? gasError.message : String(gasError)
    if (
      gasErrorMsg.includes('execution reverted') ||
      gasErrorMsg.includes('UNPREDICTABLE_GAS_LIMIT') ||
      gasErrorMsg.includes('cannot estimate gas')
    ) {
      let userMessage = 'Bridge transaction would revert on the source chain. '
      if (gasErrorMsg.includes('0xd99e07af')) {
        userMessage =
          "Bridge amount is too small: the output amount after fees is below the protocol's " +
          'minimum threshold (OutputAmountTooLow). Please increase the transfer amount.'
      } else if (gasErrorMsg.includes('0x0f6e887f')) {
        userMessage =
          'The pool is temporarily unable to process bridge transfers (EffectiveSupplyTooLow). ' +
          'Please try again later.'
      } else {
        userMessage +=
          'The pool may be in a temporary invalid state or the amount is not supported. ' +
          'Please try again later or use a different route.'
      }
      throw new SmartPoolBridgeError(userMessage)
    }
    logger.warn('swapSaga', 'handleSwapTransactionStep', 'Bridge gas estimation failed, using fallback', {
      error: gasError,
    })
    const RIGOBLOCK_BRIDGE_GAS_FALLBACK = 2750000
    txRequest.gasLimit = BigNumber.from(txRequest.gasLimit || '500000')
      .add(RIGOBLOCK_BRIDGE_GAS_FALLBACK)
      .toString()
  }
}

interface EstimateNonBridgeGasParams {
  txRequest: ValidatedTransactionRequest
  trade: ClassicTrade | BridgeTrade | ChainedActionTrade
  address: string
  smartPoolAddress: string
}

function* estimateNonBridgeGas(params: EstimateNonBridgeGasParams): SagaGenerator<void> {
  const { txRequest, trade, address, smartPoolAddress } = params
  const swapChainId = trade.inputAmount.currency.chainId
  const swapProvider =
    swapChainId in RPC_PROVIDERS ? RPC_PROVIDERS[swapChainId as keyof typeof RPC_PROVIDERS] : undefined
  if (!swapProvider) {
    return
  }
  try {
    const gasEstimate = yield* call([swapProvider, swapProvider.estimateGas], {
      from: address,
      to: smartPoolAddress,
      data: typeof txRequest.data === 'string' ? txRequest.data : txRequest.data?.toString(),
      value: '0',
    })
    txRequest.gasLimit = gasEstimate.mul(120).div(100).toString()
    logger.debug('swapSaga', 'handleSwapTransactionStep', 'Swap gas estimated', {
      estimated: gasEstimate.toString(),
      withMargin: txRequest.gasLimit,
    })
  } catch (gasError) {
    const gasErrorMsg = gasError instanceof Error ? gasError.message : String(gasError)
    if (
      gasErrorMsg.includes('execution reverted') ||
      gasErrorMsg.includes('UNPREDICTABLE_GAS_LIMIT') ||
      gasErrorMsg.includes('cannot estimate gas')
    ) {
      throw new Error(
        `Swap transaction would fail on-chain. The pool may have insufficient liquidity, ` +
          `the price may have moved beyond your slippage tolerance, or a required token approval ` +
          `is missing. Details: ${gasErrorMsg}`,
      )
    }
    logger.warn(
      'swapSaga',
      'handleSwapTransactionStep',
      'Swap gas estimation failed (network error), using fallback',
      {
        error: gasError,
      },
    )
  }
}

interface NonBridgeTransactionModificationParams {
  txRequest: ValidatedTransactionRequest
  smartPoolAddress: string
  calldata: string
  trade: ClassicTrade | BridgeTrade | ChainedActionTrade
  address: string
}

function* handleNonBridgeTransactionModifications(
  params: NonBridgeTransactionModificationParams,
): SagaGenerator<void> {
  const { txRequest, smartPoolAddress, calldata, trade, address } = params
  try {
    const parametersOnly = calldata.slice(10)
    const updatedParams = modifyV4ExecuteCalldata('0x' + parametersOnly, smartPoolAddress)
    if (updatedParams !== '0x' + parametersOnly) {
      const functionSelector = calldata.slice(0, 10)
      txRequest.data = functionSelector + updatedParams.slice(2)
    }
  } catch (error) {
    logger.warn(
      'swapSaga',
      'handleSwapTransactionStep',
      'Failed to decode Universal Router calldata, using fallback replacement',
      {
        error,
      },
    )
    const targetAddressPadded = '00000000000000000000000027213e28d7fda5c57fe9e5dd923818dbccf71c47'
    const smartPoolAddressWithout0x = smartPoolAddress.replace('0x', '').toLowerCase()
    const smartPoolAddressPadded = '000000000000000000000000' + smartPoolAddressWithout0x
    txRequest.data = calldata.replaceAll(targetAddressPadded, smartPoolAddressPadded)
  }
  if (txRequest.data) {
    const currentCalldata = typeof txRequest.data === 'string' ? txRequest.data : txRequest.data.toString()
    const strippedCalldata = stripBalanceCheckERC20(currentCalldata)
    if (strippedCalldata !== currentCalldata) {
      txRequest.data = strippedCalldata
    }
  }
  yield* call(estimateNonBridgeGas, { txRequest, trade, address, smartPoolAddress })
}

interface BridgeTransactionModificationParams {
  txRequest: ValidatedTransactionRequest
  address: string
  smartPoolAddress: string
  trade: ClassicTrade | BridgeTrade | ChainedActionTrade
  calldata: string
  originalValue?: BigNumberish
  analytics: SwapTradeBaseProperties & PlanAnalyticsFields
}

function* handleBridgeTransactionModifications(
  params: BridgeTransactionModificationParams,
): SagaGenerator<void> {
  const { txRequest, address, smartPoolAddress, trade, calldata, originalValue, analytics } = params
  try {
    const tokenOutAmountUSD = analytics.token_out_amount_usd
    const tokenOutAmount = parseFloat(trade.outputAmount.toExact())
    const outputTokenPriceUSD =
      tokenOutAmountUSD && tokenOutAmount > 0 ? tokenOutAmountUSD / tokenOutAmount : undefined
    const outputTokenDecimals = trade.outputAmount.currency.decimals
    const inputTokenDecimals = trade.inputAmount.currency.decimals
    const chainId = trade.inputAmount.currency.chainId

    const acrossFeeResult = yield* call(queryAcrossRelayerGasFee, {
      originChainId: chainId,
      calldata,
    })
    validateAcrossFeeResult({ acrossFeeResult, trade })

    const { destinationChainId, recipient, outputToken } = getAcrossDepositInfo(calldata)
    const bridgeOpType = getBridgeSyncMode() ? OpType.Sync : OpType.Transfer

    const resolvedOutputTokenPriceUSD = yield* call(resolveOutputTokenPriceUSD, {
      outputTokenPriceUSD,
      destinationChainId,
      outputToken,
    })

    let messageOverheadCompensation = yield* call(computeTraceMessageOverheadCompensation, {
      address,
      smartPoolAddress,
      calldata,
      chainId,
      destinationChainId,
      recipient,
      outputTokenPriceUSD,
      outputTokenDecimals,
      inputTokenDecimals,
      acrossFeeResult,
      bridgeOpType,
      originalValue,
    })

    if (!messageOverheadCompensation && resolvedOutputTokenPriceUSD) {
      messageOverheadCompensation = yield* call(tryDestinationSimulationCompensation, {
        destinationChainId,
        smartPoolAddress,
        outputTokenPriceUSD: resolvedOutputTokenPriceUSD,
        outputTokenDecimals,
      })
    }

    yield* call(checkBridgeDestinationPoolHealth, {
      destinationChainId,
      smartPoolAddress,
    })

    if (!resolvedOutputTokenPriceUSD && !messageOverheadCompensation) {
      throw new SmartPoolBridgeError(
        'Cannot estimate solver gas compensation: output token price is unknown and destination simulation unavailable. ' +
          'This would result in zero solver spread and the bridge intent would never be filled.',
      )
    }

    const feasibility = checkSmartPoolBridgeFeasibility({
      calldata,
      inputTokenDecimals,
      outputTokenDecimals,
      outputTokenPriceUSD: resolvedOutputTokenPriceUSD,
      destinationChainId,
      messageOverheadCompensation,
    })
    if (!feasibility.isFeasible) {
      throw new SmartPoolBridgeError(
        'Bridge amount is too small for this route. The estimated solver gas fee exceeds the ' +
          "protocol's maximum 2% bridge fee limit. Please increase the transfer amount or try a different route.",
      )
    }

    const modifiedCalldata = modifyAcrossDepositV3ForSmartPool({
      calldata,
      smartPoolAddress,
      value: String(originalValue || '0'),
      opType: bridgeOpType,
      outputTokenPriceUSD: resolvedOutputTokenPriceUSD,
      outputTokenDecimals,
      inputTokenDecimals,
      messageOverheadCompensation,
    })
    txRequest.data = modifiedCalldata

    yield* call(estimateBridgeGas, {
      txRequest,
      address,
      smartPoolAddress,
      chainId,
      calldata: modifiedCalldata,
    })
  } catch (error) {
    logger.error('Failed to modify Across depositV3 calldata for smart pool', {
      tags: { file: 'swapSaga', function: 'handleSwapTransactionStep' },
      extra: { error },
    })
    throw error
  }
}

function* handleSwapTransactionStep(params: HandleSwapStepParams): SagaGenerator<string> {
  const { address, smartPoolAddress, trade, step, signature, analytics, onTransactionHash, planId } = params

  const info = getSwapTransactionInfo({
    trade,
    swapStartTimestamp: analytics.swap_start_timestamp,
    planAnalytics: planAnalyticsToCamelCase(analytics),
    transactedUSDValue: analytics.token_in_amount_usd,
  })
  const txRequest = yield* call(getSwapTxRequest, step, signature, smartPoolAddress)

  // Store the original value before zeroing it for smart pool swaps
  const originalValue = txRequest.value

  smartPoolAddress &&
    txRequest.to &&
    normalizeTokenAddressForCache(txRequest.to) !== normalizeTokenAddressForCache(smartPoolAddress) &&
    (txRequest.to = smartPoolAddress)
  txRequest.value !== String(0) && (txRequest.value = String(0)) // Ensure value is zero for smart pool swaps

  // For non-bridge transactions, add gas buffer for RigoBlock smart pool routing
  // Smart pool routing adds gas overhead for the pool contract execution
  // Increased from 150k due to additional gas needed for first-time token approvals
  // (RigoBlock automatically sets permit2 approval inside swap tx on first token use)
  // Bridge transactions will get gas estimated after calldata modification for accuracy
  const isBridgeTransaction = trade.routing === TradingApi.Routing.BRIDGE
  if (txRequest.gasLimit && smartPoolAddress && !isBridgeTransaction) {
    const RIGOBLOCK_GAS_OVERHEAD = 250000
    txRequest.gasLimit = BigNumber.from(txRequest.gasLimit).add(RIGOBLOCK_GAS_OVERHEAD).toString()
  }

  // Override fee recipient in calldata with smart pool address
  if (smartPoolAddress && txRequest.data) {
    // Convert BytesLike to string for manipulation
    const calldata = typeof txRequest.data === 'string' ? txRequest.data : txRequest.data.toString()

    // Check if this is a bridge transaction with Across depositV3
    if (trade.routing === TradingApi.Routing.BRIDGE && isAcrossDepositV3(calldata)) {
      yield* call(handleBridgeTransactionModifications, {
        txRequest,
        address,
        smartPoolAddress,
        trade,
        calldata,
        originalValue,
        analytics,
      })
    } else {
      yield* call(handleNonBridgeTransactionModifications, {
        txRequest,
        smartPoolAddress,
        calldata,
        trade,
        address,
      })
    }

    txRequest.from = address
    txRequest.to = smartPoolAddress
  }

  const onModification = ({ hash, data }: VitalTxFields) => {
    sendAnalyticsEvent(SwapEventName.SwapModifiedInWallet, {
      ...analytics,
      txHash: hash,
      expected: txRequest.data?.toString() ?? '',
      actual: data,
    })
  }

  // Now that we have the txRequest, we can create a definitive SwapTransactionStep, incase we started with an async step.
  const onChainStep = { ...step, txRequest }
  const hash = yield* call(handleOnChainStep, {
    ...params,
    info,
    step: onChainStep,
    ignoreInterrupt: true, // We avoid interruption during the swap step, since it is too late to give user a new trade once the swap is submitted.
    shouldWaitForConfirmation: false,
    onModification,
  })

  handleSwapTransactionAnalytics({ ...params, hash })

  const chainId = trade.inputAmount.currency.chainId

  if (!planId) {
    popupRegistry.addPopup(
      { type: PopupType.Transaction, hash },
      hash,
      isL2ChainId(chainId) ? L2_TXN_DISMISS_MS : DEFAULT_TXN_DISMISS_MS,
    )
  }

  // Update swap form store with actual transaction hash
  if (onTransactionHash) {
    onTransactionHash(hash)
  }

  return hash
}

function createHandleSwapTransactionBatchedStep(ctx: { disableOneClickSwap: () => void; waitForTxHash?: boolean }) {
  return function* handleSwapTransactionBatchedStep(params: HandleSwapBatchedStepParams) {
    const { trade, step, analytics, planId } = params

    const info = getSwapTransactionInfo({
      trade,
      swapStartTimestamp: analytics.swap_start_timestamp,
      planAnalytics: planAnalyticsToCamelCase(analytics),
      transactedUSDValue: analytics.token_in_amount_usd,
    })

    const batchId = yield* handleAtomicSendCalls({
      ...params,
      info,
      step,
      ignoreInterrupt: true, // We avoid interruption during the swap step, since it is too late to give user a new trade once the swap is submitted.
      shouldWaitForConfirmation: false,
      disableOneClickSwap: ctx.disableOneClickSwap,
    })
    handleSwapTransactionAnalytics({ ...params, batchId })

    if (!planId) {
      popupRegistry.addPopup({ type: PopupType.Transaction, hash: batchId }, batchId)
    }

    if (!ctx.waitForTxHash) {
      return { batchId }
    }

    const hash = yield* call(waitForBatch, batchId, step)
    return { batchId, hash }
  }
}

function handleSwapTransactionAnalytics(params: {
  trade: ClassicTrade | BridgeTrade | ChainedActionTrade
  analytics: SwapTradeBaseProperties & PlanAnalyticsFields
  hash?: string
  batchId?: string
}) {
  const { trade, analytics, hash, batchId } = params

  sendAnalyticsEvent(
    SwapEventName.SwapSigned,
    formatSwapSignedAnalyticsEventProperties({
      trade,
      allowedSlippage: trade.slippageTolerance ? slippageToleranceToPercent(trade.slippageTolerance) : ZERO_PERCENT,
      fiatValues: {
        amountIn: analytics.token_in_amount_usd,
        amountOut: analytics.token_out_amount_usd,
        feeUsd: analytics.fee_usd,
      },
      txHash: hash,
      portfolioBalanceUsd: analytics.total_balances_usd,
      trace: analytics,
      isBatched: Boolean(batchId),
      includedPermitTransactionStep: analytics.included_permit_transaction_step,
      batchId,
      planAnalytics: planAnalyticsToCamelCase(analytics),
    }),
  )
}

type SwapParams = SwapExecutionCallbacks & {
  selectChain: (chainId: number) => Promise<boolean>
  startChainId?: number
  address: string
  analytics: ExtractedBaseTradeAnalyticsProperties
  swapTxContext: ValidatedSwapTxContext
  getOnPressRetry: (error: Error | undefined) => (() => void) | undefined
  // TODO(WEB-7763): Upgrade jotai to v2 to avoid need for prop drilling `disableOneClickSwap`
  disableOneClickSwap: () => void
  onTransactionHash?: (hash: string) => void
  smartPoolAddress: string
  swapStartTimestamp?: number
}

function* swap(params: SwapParams) {
  const {
    address,
    disableOneClickSwap,
    setCurrentStep,
    swapTxContext,
    analytics,
    onSuccess,
    onFailure,
    smartPoolAddress,
    setSteps,
  } = params
  const { trade } = swapTxContext

  const { chainSwitchFailed } = yield* call(handleSwitchChains, {
    selectChain: params.selectChain,
    startChainId: params.startChainId,
    swapTxContext,
  })
  if (chainSwitchFailed) {
    onFailure()
    return
  }

  const steps = yield* call(generateSwapTransactionSteps, swapTxContext)
  setSteps(steps)

  const validTokenFeed = yield* call(validateTokenPriceFeed, smartPoolAddress, trade.outputAmount.currency)
  if (!validTokenFeed) {
    throw new TokenPriceFeedError({ step: steps[0] })
  }

  let signature: string | undefined
  let step: TransactionStep | undefined

  const handleSwapTransactionBatchedStep = createHandleSwapTransactionBatchedStep({ disableOneClickSwap })

  try {
    // TODO(SWAP-287): Integrate jupiter swap into TransactionStep, rather than special-casing.
    if (isJupiter(swapTxContext)) {
      yield* call(jupiterSwap, { ...params, swapTxContext })
      yield* call(onSuccess)
      return
    }

    for (step of steps) {
      switch (step.type) {
        case TransactionStepType.TokenRevocationTransaction:
        case TransactionStepType.TokenApprovalTransaction: {
          yield* call(handleApprovalTransactionStep, {
            address,
            smartPoolAddress,
            step,
            setCurrentStep,
          })
          break
        }
        case TransactionStepType.Permit2Signature: {
          signature = undefined //yield* call(handleSignatureStep, { address, step, setCurrentStep })
          break
        }
        case TransactionStepType.Permit2Transaction: {
          //yield* call(handlePermitTransactionStep, { address, step, setCurrentStep })
          break
        }
        case TransactionStepType.SwapTransaction:
        case TransactionStepType.SwapTransactionAsync: {
          requireRouting(trade, [TradingApi.Routing.CLASSIC, TradingApi.Routing.BRIDGE])
          yield* call(handleSwapTransactionStep, {
            address,
            smartPoolAddress,
            signature,
            step,
            setCurrentStep,
            trade,
            analytics,
            onTransactionHash: params.onTransactionHash,
          })
          break
        }
        case TransactionStepType.SwapTransactionBatched: {
          requireRouting(trade, [TradingApi.Routing.CLASSIC, TradingApi.Routing.BRIDGE])
          yield* call(handleSwapTransactionBatchedStep, {
            address,
            smartPoolAddress,
            step,
            setCurrentStep,
            trade,
            analytics,
            disableOneClickSwap,
          })
          break
        }
        case TransactionStepType.UniswapXSignature: {
          requireRouting(trade, UNISWAPX_ROUTING_VARIANTS)
          yield* call(handleUniswapXSignatureStep, {
            address,
            step,
            setCurrentStep,
            trade,
            analytics,
          })
          break
        }
        default: {
          throw new UnexpectedTransactionStateError(`Unexpected step type: ${step.type}`)
        }
      }
    }
  } catch (error) {
    const displayableError = getDisplayableError({ error, step })
    if (displayableError) {
      logger.error(displayableError, {
        tags: { file: 'swapSaga', function: 'swap' },
      })
    }
    const onPressRetry = params.getOnPressRetry(displayableError)
    onFailure(displayableError, onPressRetry)
    return
  }

  yield* call(onSuccess)
}

function getPoolExtendedContract(poolAddress: string, chainId: number): any | undefined {
  const provider = chainId in RPC_PROVIDERS ? RPC_PROVIDERS[chainId as keyof typeof RPC_PROVIDERS] : undefined
  if (!provider) {
    return undefined
  }

  try {
    return getContract({
      address: poolAddress,
      ABI: POOL_EXTENDED_ABI,
      provider,
    })
  } catch (error) {
    const wrappedError = new Error('failed to get contract', { cause: error })
    logger.warn('useContract', 'useContract', wrappedError.message, {
      error: wrappedError,
      contractAddress: poolAddress,
    })
    return undefined
  }
}

function* getIsTokenOwnable(poolAddress?: string, token?: Currency): Generator<any, boolean | undefined, any> {
  if (!poolAddress || !token) {
    return undefined
  }

  // If token is not a token, treat it as ownable.
  if (!token.isToken) {
    return true
  }

  const extendedPool = getPoolExtendedContract(poolAddress, token.chainId)

  if (!extendedPool) {
    return undefined
  }

  try {
    // Call the hasPriceFeed method on the contract with the token address.
    const isTokenOwnable = (yield* call([extendedPool, extendedPool.hasPriceFeed], token.address)) as boolean
    return isTokenOwnable
  } catch (_error) {
    logger.error('Error calling hasPriceFeed on pool contract', {
      tags: { file: 'swapSaga', function: 'getIsTokenOwnable' },
    })
    // Handle error appropriately. Here we return false on failure.
    return false
  }
}

function* validateTokenPriceFeed(selectedPool: string | undefined, outputCurrency: Currency): SagaGenerator<boolean> {
  const isTokenOwnable: boolean | undefined = yield* call(getIsTokenOwnable, selectedPool, outputCurrency)

  if (isTokenOwnable === undefined) {
    return true
  }
  if (!isTokenOwnable) {
    yield* put({
      type: 'SWAP_ERROR',
      error: PendingModalError.TOKEN_PRICE_FEED_ERROR,
    })
    return false
  }
  return true
}

function useGetActiveAccount() {
  const evmAccount = useActiveAccount(Platform.EVM)
  const svmAccount = useActiveAccount(Platform.SVM)

  return useEvent((chainId: UniverseChainId) => {
    const platformMap = {
      [Platform.EVM]: evmAccount,
      [Platform.SVM]: svmAccount,
    }
    const platform = resolvePlatform(chainId)
    return platformMap[platform]
  })
}

export const {
  name: swapSagaName,
  wrappedSaga: swapSaga,
  reducer: swapReducer,
  actions: swapActions,
} = createMonitoredSaga({
  saga: swap,
  name: 'swapSaga',
  options: { timeoutDuration: ms('30m') },
})

/** Callback to submit trades and track progress */
export function useSwapCallback(): SwapCallback {
  const appDispatch = useDispatch()
  const formatter = useLocalizationContext()
  const swapStartTimestamp = useSelector(selectSwapStartTimestamp)
  const selectChain = useSelectChain()
  const trace = useTrace()
  const updateSwapForm = useSwapFormStore((s) => s.updateSwapForm)

  const portfolioBalanceUsd = useTotalBalancesUsdForAnalytics()

  const disableOneClickSwap = useSetOverrideOneClickSwapFlag()
  const getOnPressRetry = useGetOnPressRetry()

  const getActiveAccount = useGetActiveAccount()

  const caip25Info = useAccountsStore((state) => {
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- biome-parity: oxlint is stricter here
    return state.getActiveConnector(Platform.EVM)?.session?.caip25Info
  })

  return useCallback(
    (args: SwapCallbackParams) => {
      const {
        swapTxContext,
        smartPoolAddress,
        onSuccess,
        onFailure,
        currencyInAmountUSD,
        currencyOutAmountUSD,
        presetPercentage,
        preselectAsset,
        isAutoSlippage,
        isFiatInputMode,
        setCurrentStep,
        setSteps,
        onPending,
        onClearForm,
      } = args
      const { trade, gasFee } = swapTxContext

      const isClassicSwap = isClassic(swapTxContext)
      const isBatched = isClassicSwap && swapTxContext.txRequests && swapTxContext.txRequests.length > 1
      const includedPermitTransactionStep = isClassicSwap && swapTxContext.permit?.method === PermitMethod.Transaction

      const analytics = getBaseTradeAnalyticsProperties({
        formatter,
        trade,
        currencyInAmountUSD,
        currencyOutAmountUSD,
        presetPercentage,
        preselectAsset,
        portfolioBalanceUsd,
        trace,
        isBatched,
        includedPermitTransactionStep,
        swapStartTimestamp,
      })

      const account = getActiveAccount(trade.inputAmount.currency.chainId)

      if (!account) {
        throw new Error('No account found')
      }

      if (!smartPoolAddress) {
        throw new Error('No active smart pool selected')
      }

      const swapParams = {
        swapTxContext,
        caip25Info,
        address: account.address,
        analytics,
        getOnPressRetry,
        disableOneClickSwap,
        onClearForm,
        onSuccess,
        onFailure,
        setCurrentStep,
        setSteps,
        selectChain,
        startChainId: account.chainId,
        smartPoolAddress,
        onPending,
        onTransactionHash: (hash: string): void => {
          updateSwapForm({ txHash: hash, txHashReceivedTime: Date.now() })
        },
        swapStartTimestamp,
      }
      if (swapTxContext.trade.routing === TradingApi.Routing.CHAINED) {
        const handleSwapTransactionBatchedStep = createHandleSwapTransactionBatchedStep({
          disableOneClickSwap,
          waitForTxHash: true,
        })

        appDispatch(
          planActions.trigger({
            ...swapParams,
            address: smartPoolAddress,
            handleApprovalTransactionStep,
            handleSwapTransactionStep,
            handleSwapTransactionBatchedStep,
            handleSignatureStep,
            handleUniswapXPlanSignatureStep,
            // oxlint-disable-next-line no-shadow
            getDisplayableError: (args) => getDisplayableError({ ...args, isPlanStep: true }),
            getOnPressRetry,
            sendToast,
          }),
        )
      } else {
        appDispatch(swapActions.trigger(swapParams))
      }

      const blockNumber = getClassicQuoteFromResponse(trade.quote)?.blockNumber?.toString()

      sendAnalyticsEvent(SwapEventName.SwapSubmittedButtonClicked, {
        ...analytics,
        estimated_network_fee_wei: gasFee.value,
        gas_limit: isClassicSwap ? swapTxContext.txRequests?.[0]?.gasLimit?.toString() : undefined,
        transaction_deadline_seconds: trade.deadline,
        swap_quote_block_number: blockNumber,
        is_auto_slippage: isAutoSlippage,
        swap_flow_duration_milliseconds: swapStartTimestamp ? Date.now() - swapStartTimestamp : undefined,
        is_fiat_input_mode: isFiatInputMode,
      })

      // Reset swap start timestamp now that the swap has been submitted
      appDispatch(updateSwapStartTimestamp({ timestamp: undefined }))
    },
    [
      formatter,
      portfolioBalanceUsd,
      trace,
      selectChain,
      getActiveAccount,
      appDispatch,
      swapStartTimestamp,
      getOnPressRetry,
      disableOneClickSwap,
      updateSwapForm,
      caip25Info,
    ],
  )
}
