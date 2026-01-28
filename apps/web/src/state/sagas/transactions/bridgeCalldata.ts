import { AbiCoder } from '@ethersproject/abi'
import { BigNumber } from '@ethersproject/bignumber'

/**
 * OpType enum for SourceMessageParams
 * - Transfer (0): Standard bridging operation - does not affect pool NAV
 * - Sync (1): Synchronization operation - rebalances NAV performance across chains
 */
export enum OpType {
  Transfer = 0,
  Sync = 1,
}

/**
 * Default NAV tolerance in basis points (100 = 1%)
 * Used as a safety buffer for price fluctuations during cross-chain transfers
 */
const DEFAULT_NAV_TOLERANCE = 100

// Across SpokePool depositV3 function selector
// depositV3(address,address,address,address,uint256,uint256,uint256,address,uint32,uint32,uint32,bytes)
const ACROSS_DEPOSIT_V3_SELECTOR = '0x7b939232'

// RigoBlock depositV3 function selector (tuple-based)
// depositV3((address,address,address,address,uint256,uint256,uint256,address,uint32,uint32,uint32,bytes))
const RIGOBLOCK_DEPOSIT_V3_SELECTOR = '0x770d096f'

// Ethereum mainnet chain ID
const ETHEREUM_MAINNET_CHAIN_ID = 1

/**
 * Solver gas compensation in USD equivalent (in basis points of output amount)
 * - L2 chains: ~$0.02 gas cost
 * - Ethereum mainnet: ~$0.20 gas cost (10x higher)
 * 
 * These values are approximations and should be adjusted based on actual gas costs.
 * The solver is compensated via the spread between inputAmount and outputAmount.
 */
const SOLVER_GAS_COMPENSATION_USD_L2 = 0.02
const SOLVER_GAS_COMPENSATION_USD_MAINNET = 0.20

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
    [
      'tuple(address,address,address,address,uint256,uint256,uint256,address,uint32,uint32,uint32,bytes)',
    ],
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

export interface ModifyAcrossParams {
  calldata: string
  smartPoolAddress: string
  value: string
  opType?: OpType
  /**
   * Price of the output token in USD (e.g., 3000 for ETH at $3000)
   * Used to calculate the solver gas compensation in output token terms
   */
  outputTokenPriceUSD?: number
  /**
   * Number of decimals for the output token (e.g., 18 for ETH, 6 for USDC)
   */
  outputTokenDecimals?: number
}

/**
 * Modifies Across SpokePool depositV3 calldata for RigoBlock smart pools
 *
 * This function:
 * 1. Decodes the Across depositV3 calldata
 * 2. Encodes SourceMessageParams in the message field
 * 3. Changes the depositor to the smart pool address
 * 4. Re-encodes using RigoBlock's tuple-based depositV3 format
 *
 * @param params - Object containing calldata, smartPoolAddress, value, and opType
 * @returns The modified calldata for RigoBlock depositV3
 */
interface SolverGasCompensationParams {
  destinationChainId: BigNumber
  outputTokenPriceUSD?: number
  outputTokenDecimals?: number
}

/**
 * Calculates the solver gas compensation in output token units
 * The solver pays gas on the destination chain to fill the order,
 * and is compensated via the spread between input and output amounts.
 * 
 * @param params - Object containing destinationChainId, outputTokenPriceUSD, and outputTokenDecimals
 * @returns The compensation amount in output token base units
 */
function calculateSolverGasCompensation(params: SolverGasCompensationParams): BigNumber {
  const { destinationChainId, outputTokenPriceUSD, outputTokenDecimals } = params

  // If we don't have price info, skip compensation (use 0)
  if (!outputTokenPriceUSD || !outputTokenDecimals) {
    return BigNumber.from(0)
  }

  // Determine gas cost in USD based on destination chain
  const isMainnet = destinationChainId.eq(ETHEREUM_MAINNET_CHAIN_ID)
  const gasCostUSD = isMainnet ? SOLVER_GAS_COMPENSATION_USD_MAINNET : SOLVER_GAS_COMPENSATION_USD_L2

  // Convert USD gas cost to output token amount
  // gasCostInToken = gasCostUSD / outputTokenPriceUSD
  // Then scale by token decimals
  const gasCostInToken = gasCostUSD / outputTokenPriceUSD
  const compensation = BigNumber.from(Math.floor(gasCostInToken * Math.pow(10, outputTokenDecimals)))

  return compensation
}

export function modifyAcrossDepositV3ForSmartPool(fnParams: ModifyAcrossParams): string {
  const { calldata, smartPoolAddress, value, opType = OpType.Transfer, outputTokenPriceUSD, outputTokenDecimals } =
    fnParams
  try {
    // Decode the Across depositV3 calldata
    const { params: decodedParams } = decodeAcrossDepositV3(calldata)

    // Get the source native amount from the transaction value
    const sourceNativeAmount = BigNumber.from(value || '0')

    // Calculate solver gas compensation for destination chain
    const solverCompensation = calculateSolverGasCompensation({
      destinationChainId: decodedParams.destinationChainId,
      outputTokenPriceUSD,
      outputTokenDecimals,
    })

    // Reduce output amount by solver compensation
    // This creates spread for the solver to cover destination chain gas costs
    let adjustedOutputAmount = decodedParams.outputAmount
    if (solverCompensation.gt(0) && adjustedOutputAmount.gt(solverCompensation)) {
      adjustedOutputAmount = adjustedOutputAmount.sub(solverCompensation)
    }

    // Create SourceMessageParams
    const sourceMessageParams: SourceMessageParams = {
      opType,
      navTolerance: BigNumber.from(DEFAULT_NAV_TOLERANCE),
      sourceNativeAmount,
      shouldUnwrapOnDestination: sourceNativeAmount.gt(0),
    }

    // Encode the SourceMessageParams as the message
    const encodedMessage = encodeSourceMessageParams(sourceMessageParams)

    // Update params for RigoBlock:
    // - depositor becomes the smart pool (it's the one calling Across)
    // - recipient stays the same (destination address on the other chain)
    // - exclusiveRelayer must be address(0) - RigoBlock pool asserts this
    // - message contains the SourceMessageParams
    // - outputAmount reduced to compensate solver for destination gas
    const modifiedParams: AcrossParams = {
      ...decodedParams,
      depositor: smartPoolAddress,
      exclusiveRelayer: '0x0000000000000000000000000000000000000000', // Must be null address for RigoBlock
      outputAmount: adjustedOutputAmount,
      exclusivityDeadline: 0, // Not used by RigoBlock, can set to 0
      message: encodedMessage,
    }

    // Encode using RigoBlock's depositV3 format
    return encodeRigoblockDepositV3(modifiedParams)
  } catch (error) {
    console.error('Failed to modify Across depositV3 for smart pool:', error)
    throw error
  }
}
