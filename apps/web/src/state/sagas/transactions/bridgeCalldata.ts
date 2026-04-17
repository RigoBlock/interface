import { AbiCoder } from '@ethersproject/abi'
import { BigNumber } from '@ethersproject/bignumber'
import { parseUnits } from '@ethersproject/units'
import { logger } from 'utilities/src/logger/logger'

// Re-export helpers so existing callers don't need to update imports
export {
  checkDestinationPoolHealth,
  computeDestinationSimulationCompensation,
  estimateDestinationMessageGas,
  fetchNativeTokenPriceUSD,
  fetchTokenPriceUSD,
  queryAcrossRelayerGasFee,
} from '~/state/sagas/transactions/bridgeCalldataHelpers'
export type { AcrossRelayFeeResult } from '~/state/sagas/transactions/bridgeCalldataHelpers'

export enum OpType {
  Transfer = 0,
  Sync = 1,
}

/**
 * On-chain maximum bridge fee enforced by AIntents.depositV3 (200 bps = 2%).
 * The contract checks: scaledOutputAmount * 10000 >= inputAmount * (10000 - MAX_BRIDGE_FEE_BPS)
 * where scaledOutputAmount = CrosschainLib.applyBscDecimalConversion(outputToken, inputToken, outputAmount).
 * This normalizes for BSC's 18-decimal USDT/USDC vs 6-decimal on other chains.
 * Exceeding this limit causes OutputAmountTooLow() revert on the source chain.
 */
export const ON_CHAIN_MAX_BRIDGE_FEE_BPS = 200

/** NAV tolerance in basis points (800 = 8%) for destination-chain validation. */
const NAV_TOLERANCE_BPS = 800

const ACROSS_DEPOSIT_V3_SELECTOR = '0x7b939232'
const RIGOBLOCK_DEPOSIT_V3_SELECTOR = '0x770d096f'

const ETHEREUM_MAINNET_CHAIN_ID = 1
const POLYGON_CHAIN_ID = 137

const FALLBACK_MESSAGE_OVERHEAD_USD_L2 = 0.50
const FALLBACK_MESSAGE_OVERHEAD_USD_POLYGON = 1.0
const FALLBACK_MESSAGE_OVERHEAD_USD_MAINNET = 5.0

interface AcrossParams {
  depositor: string
  recipient: string
  inputToken: string
  outputToken: string
  inputAmount: BigNumber
  outputAmount: BigNumber
  destinationChainId: BigNumber
  exclusiveRelayer: string
  quoteTimestamp: number
  fillDeadline: number
  exclusivityDeadline: number
  message: string
}

interface SourceMessageParams {
  opType: OpType
  navTolerance: BigNumber
  sourceNativeAmount: BigNumber
  shouldUnwrapOnDestination: boolean
}

/**
 * Encodes SourceMessageParams into a bytes message
 */
function encodeSourceMessageParams(params: SourceMessageParams): string {
  const abiCoder = new AbiCoder()
  return abiCoder.encode(
    ['uint8', 'uint256', 'uint256', 'bool'],
    [params.opType, params.navTolerance, params.sourceNativeAmount, params.shouldUnwrapOnDestination],
  )
}

/**
 * Decodes the Across SpokePool depositV3 calldata into individual parameters
 */
function decodeAcrossDepositV3(calldata: string): {
  params: AcrossParams
  value: BigNumber
} {
  const abiCoder = new AbiCoder()

  // Remove function selector (first 4 bytes = 10 hex chars including 0x)
  const dataWithoutSelector = '0x' + calldata.slice(10)

  const decoded = abiCoder.decode(
    [
      'address', // depositor
      'address', // recipient
      'address', // inputToken
      'address', // outputToken
      'uint256', // inputAmount
      'uint256', // outputAmount
      'uint256', // destinationChainId
      'address', // exclusiveRelayer
      'uint32', // quoteTimestamp
      'uint32', // fillDeadline
      'uint32', // exclusivityDeadline
      'bytes', // message
    ],
    dataWithoutSelector,
  )

  // Note: RigoBlock pool overwrites fillDeadline with block.timestamp + fillDeadlineBuffer()
  // and uses address(0) as exclusiveRelayer, so we don't need to fix exclusivityDeadline here

  return {
    params: {
      depositor: decoded[0],
      recipient: decoded[1],
      inputToken: decoded[2],
      outputToken: decoded[3],
      inputAmount: BigNumber.from(decoded[4]),
      outputAmount: BigNumber.from(decoded[5]),
      destinationChainId: BigNumber.from(decoded[6]),
      exclusiveRelayer: decoded[7],
      quoteTimestamp: decoded[8],
      fillDeadline: decoded[9],
      exclusivityDeadline: decoded[10],
      message: decoded[11],
    },
    value: BigNumber.from(0), // Will be set from txRequest.value
  }
}

/**
 * Encodes the RigoBlock depositV3 calldata with AcrossParams struct
 */
function encodeRigoblockDepositV3(params: AcrossParams): string {
  const abiCoder = new AbiCoder()

  const encodedParams = abiCoder.encode(
    ['tuple(address,address,address,address,uint256,uint256,uint256,address,uint32,uint32,uint32,bytes)'],
    [
      [
        params.depositor,
        params.recipient,
        params.inputToken,
        params.outputToken,
        params.inputAmount,
        params.outputAmount,
        params.destinationChainId,
        params.exclusiveRelayer,
        params.quoteTimestamp,
        params.fillDeadline,
        params.exclusivityDeadline,
        params.message,
      ],
    ],
  )

  // Add RigoBlock function selector
  return RIGOBLOCK_DEPOSIT_V3_SELECTOR + encodedParams.slice(2)
}

/**
 * Checks if the calldata is an Across SpokePool depositV3 call
 */
export function isAcrossDepositV3(calldata: string): boolean {
  return calldata.toLowerCase().startsWith(ACROSS_DEPOSIT_V3_SELECTOR.toLowerCase())
}

/**
 * Extracts destination chain ID and recipient (Across Multicall Handler) from
 * Across depositV3 calldata.
 *
 * NOTE: The recipient is the Across Multicall Handler contract on the destination chain,
 * NOT the RigoBlock pool itself. On fill, the solver calls the SpokePool which invokes
 * handleV3AcrossMessage() on the handler, which then routes the multicall actions
 * to the RigoBlock pool (approve, transfer, updateUnitaryValue, etc.).
 *
 * The RigoBlock pool address is deterministic (same on every chain), so the destination
 * pool address is always equal to the source smartPoolAddress.
 */
export function getAcrossDepositInfo(calldata: string): {
  destinationChainId: number
  recipient: string
  outputToken: string
} {
  const { params } = decodeAcrossDepositV3(calldata)
  return {
    destinationChainId: params.destinationChainId.toNumber(),
    recipient: params.recipient,
    outputToken: params.outputToken,
  }
}

/**
 * Shape of a callTracer trace node from debug_traceCall.
 */
interface CallTrace {
  type?: string
  input?: string
  calls?: CallTrace[]
}

/**
 * Recursively walks a callTracer trace tree to find the Across SpokePool's
 * depositV3 internal call and extracts the expanded message parameter.
 */
export function findExpandedMessageInTrace(trace: CallTrace): string | undefined {
  const input = trace.input?.toLowerCase()
  if (input?.startsWith(ACROSS_DEPOSIT_V3_SELECTOR.toLowerCase())) {
    try {
      const { params } = decodeAcrossDepositV3(trace.input!)
      if (params.message && params.message !== '0x' && params.message.length > 2) {
        return params.message
      }
    } catch {
      // Decode failed — not the call we're looking for
    }
  }
  if (Array.isArray(trace.calls)) {
    for (const child of trace.calls) {
      const result = findExpandedMessageInTrace(child)
      if (result) return result
    }
  }
  return undefined
}

/**
 * Extracts the expanded message from a source chain transaction simulation.
 *
 * The RigoBlock pool expands our compact SourceMessageParams into a full multicall
 * before calling the Across SpokePool's depositV3. This function uses debug_traceCall
 * (supported by Alchemy and other premium RPC providers) to trace the source simulation
 * and extract the expanded message from the internal SpokePool.depositV3 call.
 *
 * The expanded message is a multicall targeting the Across Multicall Handler on
 * the destination chain. It contains actions that the handler routes to the RigoBlock
 * pool (token approvals, transfers, NAV updates, etc.).
 *
 * Returns the expanded message bytes, or undefined if:
 * - debug_traceCall is not supported by the RPC provider
 * - The trace format is unexpected
 * - No depositV3 internal call is found
 */
export async function extractExpandedMessageFromTrace(params: {
  provider: { send(method: string, params: unknown[]): Promise<unknown> }
  from: string
  to: string
  data: string
}): Promise<string | undefined> {
  try {
    const trace = await params.provider.send('debug_traceCall', [
      { from: params.from, to: params.to, data: params.data, value: '0x0' },
      'latest',
      { tracer: 'callTracer', tracerConfig: { onlyTopCall: false } },
    ]) as CallTrace

    const message = findExpandedMessageInTrace(trace)
    if (message) {
      logger.debug('bridgeCalldata', 'extractExpandedMessageFromTrace',
        'Extracted expanded message from source trace', { messageLength: message.length })
    }
    return message
  } catch {
    // debug_traceCall not supported by this RPC provider — fall back gracefully
    return undefined
  }
}

/**
 * Checks if a smart pool bridge intent is fillable under the on-chain 2% cap.
 * Returns isFeasible=false when the needed solver compensation exceeds the available
 * room, meaning no solver will fill the intent (funds locked until expiry).
 */
export function checkSmartPoolBridgeFeasibility(params: {
  calldata: string
  inputTokenDecimals: number
  outputTokenDecimals: number
  outputTokenPriceUSD?: number
  destinationChainId: number
  messageOverheadCompensation?: BigNumber
}): { isFeasible: boolean; maxAllowedCompensation: BigNumber; neededCompensation: BigNumber } {
  const { calldata, inputTokenDecimals, outputTokenDecimals, destinationChainId, messageOverheadCompensation } = params
  const { params: decoded } = decodeAcrossDepositV3(calldata)

  // Compute needed compensation (from simulation or USD fallback)
  let neededCompensation = messageOverheadCompensation
  if (!neededCompensation) {
    if (!params.outputTokenPriceUSD) {
      // Can't compute — assume feasible (will be caught later during TX build)
      return { isFeasible: true, maxAllowedCompensation: BigNumber.from(0), neededCompensation: BigNumber.from(0) }
    }
    let overheadUSD = FALLBACK_MESSAGE_OVERHEAD_USD_L2
    if (destinationChainId === ETHEREUM_MAINNET_CHAIN_ID) {
      overheadUSD = FALLBACK_MESSAGE_OVERHEAD_USD_MAINNET
    } else if (destinationChainId === POLYGON_CHAIN_ID) {
      overheadUSD = FALLBACK_MESSAGE_OVERHEAD_USD_POLYGON
    }
    neededCompensation = parseUnits(
      (overheadUSD / params.outputTokenPriceUSD).toFixed(outputTokenDecimals),
      outputTokenDecimals,
    )
  }

  // Compute max allowed under 2% cap
  const decimalDiff = outputTokenDecimals - inputTokenDecimals
  const normalizedInput = decimalDiff >= 0
    ? decoded.inputAmount.mul(BigNumber.from(10).pow(decimalDiff))
    : decoded.inputAmount.div(BigNumber.from(10).pow(-decimalDiff))

  const minRequired = normalizedInput.mul(10000 - ON_CHAIN_MAX_BRIDGE_FEE_BPS).div(10000)
  const room = decoded.outputAmount.sub(minRequired)

  if (room.lte(0)) {
    return { isFeasible: false, maxAllowedCompensation: BigNumber.from(0), neededCompensation }
  }

  const maxAllowed = room.mul(90).div(100)
  return {
    isFeasible: neededCompensation.lte(maxAllowed),
    maxAllowedCompensation: maxAllowed,
    neededCompensation,
  }
}

export interface ModifyAcrossParams {
  calldata: string
  smartPoolAddress: string
  value: string
  opType?: OpType
  outputTokenPriceUSD?: number
  outputTokenDecimals?: number
  inputTokenDecimals?: number
  /** Pre-computed message overhead compensation in output token base units (from destination simulation) */
  messageOverheadCompensation?: BigNumber
}

interface SolverGasCompensationParams {
  destinationChainId: BigNumber
  outputTokenPriceUSD?: number
  outputTokenDecimals?: number
}

/**
 * USD-based fallback when destination simulation is not available.
 * Throws if outputTokenPriceUSD is unknown.
 */
function calculateSolverGasCompensation(params: SolverGasCompensationParams): BigNumber {
  const { destinationChainId, outputTokenPriceUSD, outputTokenDecimals } = params

  if (!outputTokenDecimals || !outputTokenPriceUSD) {
    throw new Error(
      'Cannot estimate solver gas compensation: output token price is unknown. ' +
      'Bridge transactions require a known token price to ensure correct solver compensation.',
    )
  }

  // Estimate vault message execution overhead in USD based on destination chain
  const chainIdNum = destinationChainId.toNumber()
  let messageOverheadUSD: number
  if (chainIdNum === ETHEREUM_MAINNET_CHAIN_ID) {
    messageOverheadUSD = FALLBACK_MESSAGE_OVERHEAD_USD_MAINNET
  } else if (chainIdNum === POLYGON_CHAIN_ID) {
    messageOverheadUSD = FALLBACK_MESSAGE_OVERHEAD_USD_POLYGON
  } else {
    messageOverheadUSD = FALLBACK_MESSAGE_OVERHEAD_USD_L2
  }

  return parseUnits((messageOverheadUSD / outputTokenPriceUSD).toFixed(outputTokenDecimals), outputTokenDecimals)
}

export function modifyAcrossDepositV3ForSmartPool(fnParams: ModifyAcrossParams): string {
  const {
    calldata,
    smartPoolAddress,
    value,
    opType = OpType.Transfer,
    outputTokenPriceUSD,
    outputTokenDecimals,
    inputTokenDecimals,
    messageOverheadCompensation,
  } = fnParams
  try {
    const { params: decodedParams } = decodeAcrossDepositV3(calldata)
    const sourceNativeAmount = BigNumber.from(value || '0')

    // Use pre-computed compensation or fall back to USD estimates
    let solverCompensation = messageOverheadCompensation ?? calculateSolverGasCompensation({
      destinationChainId: decodedParams.destinationChainId,
      outputTokenPriceUSD,
      outputTokenDecimals,
    })

    // Cap solver compensation based on the on-chain MAX_BRIDGE_FEE_BPS (2%) limit.
    // AIntents.depositV3 enforces: scaledOutputAmount * 10000 >= inputAmount * (10000 - 200)
    // where scaledOutputAmount normalizes for BSC decimal differences.
    // The Across relay fee is already deducted from outputAmount, so the remaining room
    // for solver compensation is: outputAmount - (inputAmount * 0.98 * decimalScaling).
    // For 10 USDT, this leaves ~$0.19; for 30 USDT ~$0.57; for 40 USDT ~$0.78.
    if (inputTokenDecimals !== undefined && outputTokenDecimals !== undefined) {
      const decimalDiff = outputTokenDecimals - inputTokenDecimals
      const normalizedInputAmount = decimalDiff >= 0
        ? decodedParams.inputAmount.mul(BigNumber.from(10).pow(decimalDiff))
        : decodedParams.inputAmount.div(BigNumber.from(10).pow(-decimalDiff))
      // Minimum output the AIntents contract will accept (MAX_BRIDGE_FEE_BPS = 2% max fee)
      const minRequiredOutput = normalizedInputAmount.mul(10000 - ON_CHAIN_MAX_BRIDGE_FEE_BPS).div(10000)
      const remainingRoom = decodedParams.outputAmount.sub(minRequiredOutput)
      if (remainingRoom.lte(0)) {
        // Across fee alone reaches the limit — no room for solver compensation
        solverCompensation = BigNumber.from(0)
      } else {
        // Use 90% of remaining room to avoid boundary rounding issues
        const maxAllowedComp = remainingRoom.mul(90).div(100)
        if (solverCompensation.gt(maxAllowedComp)) {
          solverCompensation = maxAllowedComp
        }
      }
    } else {
      // Fallback: cap at 2% of outputAmount when decimal info is unavailable
      const fallbackCap = decodedParams.outputAmount.mul(ON_CHAIN_MAX_BRIDGE_FEE_BPS).div(10000)
      if (solverCompensation.gt(fallbackCap)) {
        solverCompensation = fallbackCap
      }
    }

    // Reduce output amount by solver compensation
    let adjustedOutputAmount = decodedParams.outputAmount
    if (solverCompensation.gt(0) && adjustedOutputAmount.gt(solverCompensation)) {
      adjustedOutputAmount = adjustedOutputAmount.sub(solverCompensation)
    }

    const sourceMessageParams: SourceMessageParams = {
      opType,
      navTolerance: BigNumber.from(NAV_TOLERANCE_BPS),
      sourceNativeAmount,
      shouldUnwrapOnDestination: sourceNativeAmount.gt(0),
    }

    const encodedMessage = encodeSourceMessageParams(sourceMessageParams)

    // recipient = pool itself (used in destination multicall for token transfer + drain).
    // The AIntents contract internally resolves the Across handler via CrosschainLib.getAcrossHandler().
    const modifiedParams: AcrossParams = {
      ...decodedParams,
      depositor: smartPoolAddress,
      recipient: smartPoolAddress,
      exclusiveRelayer: '0x0000000000000000000000000000000000000000',
      outputAmount: adjustedOutputAmount,
      exclusivityDeadline: 0,
      message: encodedMessage,
    }

    // Encode using RigoBlock's depositV3 format
    return encodeRigoblockDepositV3(modifiedParams)
  } catch (error) {
    console.error('Failed to modify Across depositV3 for smart pool:', error)
    throw error
  }
}
