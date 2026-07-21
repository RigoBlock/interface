/**
 * GMX v2 Synthetics — RigoBlock vault adapter interface (IAGmxV2).
 *
 * Calls are sent TO the smart pool address; the protocol routes them to GMX via
 * the AGmxV2 adapter (delegatecall). The adapter overrides receiver/callback fields,
 * computes the keeper execution fee on-chain, and handles collateral transfers.
 *
 * Adapted from RigoBlock/agentic-operator (src/abi/gmx.ts).
 */

export enum GmxOrderType {
  MarketSwap = 0,
  LimitSwap = 1,
  MarketIncrease = 2,
  LimitIncrease = 3,
  MarketDecrease = 4,
  LimitDecrease = 5,
  StopLossDecrease = 6,
  Liquidation = 7,
}

export const GMX_NO_SWAP = 0

export const GMX_ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
export const GMX_ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000'

const GMX_CREATE_ORDER_PARAMS_COMPONENTS = [
  {
    name: 'addresses',
    type: 'tuple',
    components: [
      { name: 'receiver', type: 'address' },
      { name: 'cancellationReceiver', type: 'address' },
      { name: 'callbackContract', type: 'address' },
      { name: 'uiFeeReceiver', type: 'address' },
      { name: 'market', type: 'address' },
      { name: 'initialCollateralToken', type: 'address' },
      { name: 'swapPath', type: 'address[]' },
    ],
  },
  {
    name: 'numbers',
    type: 'tuple',
    components: [
      { name: 'sizeDeltaUsd', type: 'uint256' },
      { name: 'initialCollateralDeltaAmount', type: 'uint256' },
      { name: 'triggerPrice', type: 'uint256' },
      { name: 'acceptablePrice', type: 'uint256' },
      { name: 'executionFee', type: 'uint256' },
      { name: 'callbackGasLimit', type: 'uint256' },
      { name: 'minOutputAmount', type: 'uint256' },
      { name: 'validFromTime', type: 'uint256' },
    ],
  },
  { name: 'orderType', type: 'uint8' },
  { name: 'decreasePositionSwapType', type: 'uint8' },
  { name: 'isLong', type: 'bool' },
  { name: 'shouldUnwrapNativeToken', type: 'bool' },
  { name: 'autoCancel', type: 'bool' },
  { name: 'referralCode', type: 'bytes32' },
  { name: 'dataList', type: 'bytes32[]' },
]

export interface GmxCreateOrderParams {
  addresses: {
    receiver: string
    cancellationReceiver: string
    callbackContract: string
    uiFeeReceiver: string
    market: string
    initialCollateralToken: string
    swapPath: string[]
  }
  numbers: {
    sizeDeltaUsd: bigint
    initialCollateralDeltaAmount: bigint
    triggerPrice: bigint
    acceptablePrice: bigint
    executionFee: bigint
    callbackGasLimit: bigint
    minOutputAmount: bigint
    validFromTime: bigint
  }
  orderType: GmxOrderType
  decreasePositionSwapType: number
  isLong: boolean
  shouldUnwrapNativeToken: boolean
  autoCancel: boolean
  referralCode: string
  dataList: string[]
}

export const RIGOBLOCK_GMX_ABI = [
  {
    name: 'createIncreaseOrder',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'params', type: 'tuple', components: GMX_CREATE_ORDER_PARAMS_COMPONENTS }],
    outputs: [{ name: 'orderKey', type: 'bytes32' }],
  },
  {
    name: 'createDecreaseOrder',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'params', type: 'tuple', components: GMX_CREATE_ORDER_PARAMS_COMPONENTS }],
    outputs: [{ name: 'orderKey', type: 'bytes32' }],
  },
]

/** Builds the CreateOrderParams tuple; adapter-overridden fields are zeroed. */
export function buildGmxOrderParams({
  market,
  collateralToken,
  sizeDeltaUsd,
  collateralDeltaAmount,
  acceptablePrice,
  orderType,
  isLong,
}: {
  market: string
  collateralToken: string
  sizeDeltaUsd: bigint
  collateralDeltaAmount: bigint
  acceptablePrice: bigint
  orderType: GmxOrderType
  isLong: boolean
}): GmxCreateOrderParams {
  return {
    addresses: {
      receiver: GMX_ZERO_ADDRESS, // overridden by adapter
      cancellationReceiver: GMX_ZERO_ADDRESS, // overridden by adapter
      callbackContract: GMX_ZERO_ADDRESS, // overridden by adapter
      uiFeeReceiver: GMX_ZERO_ADDRESS, // overridden by adapter
      market,
      initialCollateralToken: collateralToken,
      swapPath: [], // overridden by adapter
    },
    numbers: {
      sizeDeltaUsd,
      initialCollateralDeltaAmount: collateralDeltaAmount,
      triggerPrice: 0n,
      acceptablePrice,
      executionFee: 0n, // computed on-chain by the adapter
      callbackGasLimit: 0n, // overridden by adapter
      minOutputAmount: 0n,
      validFromTime: 0n,
    },
    orderType,
    decreasePositionSwapType: GMX_NO_SWAP, // forced by adapter
    isLong,
    shouldUnwrapNativeToken: false, // overridden by adapter
    autoCancel: false,
    referralCode: GMX_ZERO_BYTES32, // overridden by adapter
    dataList: [], // overridden by adapter
  }
}
