import { parseUnits } from 'viem'
import { GmxPosition } from '~/pages/Portfolio/hooks/useGmxPositions'
import { GmxOrderType } from '~/pages/Portfolio/Perps/gmx/abi'
import { GMX_NO_SWAP, GMX_ZERO_ADDRESS, GMX_ZERO_BYTES32 } from '~/pages/Portfolio/Perps/gmx/abi'
import { getStaticTokenDecimals } from '~/pages/Portfolio/Perps/gmx/useGmxTokenDecimals'
import {
  buildParamsForAction,
  computeAcceptablePrice,
  GmxOrderAction,
  resolveCollateralDirection,
} from '~/pages/Portfolio/Perps/gmx/useGmxOrderCallback'

const WETH = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1'
const MARKET = '0x70d95587d40A2caf56bd97485aB3Eec10Bee6336'

const mockPosition: GmxPosition = {
  marketAddress: MARKET,
  collateralTokenAddress: WETH,
  indexName: 'ETH/USD',
  poolName: 'ETH/USD [WETH-USDC]',
  isLong: true,
  sizeUsd: 1000,
  netValueUsd: 500,
  collateralUsd: 480,
  leverage: 2,
  entryPrice: 2900,
  markPrice: 3000,
  liquidationPrice: 1500,
  unrealizedPnlUsd: 20,
  unrealizedPnlPercent: 4,
  sizeInUsdRaw: parseUnits('1000', 30).toString(),
  collateralAmountRaw: parseUnits('0.16', 18).toString(),
  markPriceRaw: parseUnits('3000', 30).toString(),
}

describe('computeAcceptablePrice', () => {
  // markPrice 3000 USD (1e30 scale), ETH 18 decimals → price on 1e12 scale = 3000e12
  const markPriceRaw = parseUnits('3000', 30).toString()
  const price = parseUnits('3000', 12)

  it('adds 1% for a long increase', () => {
    const result = computeAcceptablePrice({ markPriceRaw, indexDecimals: 18, isLong: true, increase: true })
    expect(result).toBe(price + price / 100n)
  })

  it('subtracts 1% for a long decrease', () => {
    const result = computeAcceptablePrice({ markPriceRaw, indexDecimals: 18, isLong: true, increase: false })
    expect(result).toBe(price - price / 100n)
  })

  it('subtracts 1% for a short increase', () => {
    const result = computeAcceptablePrice({ markPriceRaw, indexDecimals: 18, isLong: false, increase: true })
    expect(result).toBe(price - price / 100n)
  })

  it('adds 1% for a short decrease', () => {
    const result = computeAcceptablePrice({ markPriceRaw, indexDecimals: 18, isLong: false, increase: false })
    expect(result).toBe(price + price / 100n)
  })

  it('rescales from the 1e30 mark price to the 10^(30-indexDecimals) scale', () => {
    // USDC-indexed market (6 decimals) → 1e24 scale
    const result = computeAcceptablePrice({ markPriceRaw, indexDecimals: 6, isLong: true, increase: true })
    expect(result).toBe(parseUnits('3000', 24) + parseUnits('3000', 24) / 100n)
  })
})

describe('buildParamsForAction', () => {
  const decimals = { indexDecimals: 18, collateralDecimals: 18 }

  it('builds an increase-position order with size and collateral', () => {
    const { functionName, params } = buildParamsForAction({
      action: GmxOrderAction.IncreasePosition,
      position: mockPosition,
      input: { sizeUsd: '100', collateralAmount: '0.5' },
      ...decimals,
    })
    expect(functionName).toBe('createIncreaseOrder')
    expect(params.orderType).toBe(GmxOrderType.MarketIncrease)
    expect(params.numbers.sizeDeltaUsd).toBe(parseUnits('100', 30))
    expect(params.numbers.initialCollateralDeltaAmount).toBe(parseUnits('0.5', 18))
    expect(params.isLong).toBe(true)
  })

  it('builds an increase-position order with zero collateral when omitted', () => {
    const { params } = buildParamsForAction({
      action: GmxOrderAction.IncreasePosition,
      position: mockPosition,
      input: { sizeUsd: '100' },
      ...decimals,
    })
    expect(params.numbers.initialCollateralDeltaAmount).toBe(0n)
  })

  it('builds an increase-collateral order with zero size delta', () => {
    const { functionName, params } = buildParamsForAction({
      action: GmxOrderAction.IncreaseCollateral,
      position: mockPosition,
      input: { collateralAmount: '0.25' },
      ...decimals,
    })
    expect(functionName).toBe('createIncreaseOrder')
    expect(params.numbers.sizeDeltaUsd).toBe(0n)
    expect(params.numbers.initialCollateralDeltaAmount).toBe(parseUnits('0.25', 18))
  })

  it('builds a decrease-position order with zero collateral delta', () => {
    const { functionName, params } = buildParamsForAction({
      action: GmxOrderAction.DecreasePosition,
      position: mockPosition,
      input: { sizeUsd: '250' },
      ...decimals,
    })
    expect(functionName).toBe('createDecreaseOrder')
    expect(params.orderType).toBe(GmxOrderType.MarketDecrease)
    expect(params.numbers.sizeDeltaUsd).toBe(parseUnits('250', 30))
    expect(params.numbers.initialCollateralDeltaAmount).toBe(0n)
  })

  it('builds a decrease-collateral order with zero size delta', () => {
    const { functionName, params } = buildParamsForAction({
      action: GmxOrderAction.DecreaseCollateral,
      position: mockPosition,
      input: { collateralAmount: '0.1' },
      ...decimals,
    })
    expect(functionName).toBe('createDecreaseOrder')
    expect(params.numbers.sizeDeltaUsd).toBe(0n)
    expect(params.numbers.initialCollateralDeltaAmount).toBe(parseUnits('0.1', 18))
  })

  it('builds a close order for the full size and full collateral', () => {
    const { functionName, params } = buildParamsForAction({
      action: GmxOrderAction.ClosePosition,
      position: mockPosition,
      input: {},
      ...decimals,
    })
    expect(functionName).toBe('createDecreaseOrder')
    expect(params.numbers.sizeDeltaUsd.toString()).toBe(mockPosition.sizeInUsdRaw)
    expect(params.numbers.initialCollateralDeltaAmount.toString()).toBe(mockPosition.collateralAmountRaw)
  })

  it('zeros every adapter-overridden field', () => {
    const { params } = buildParamsForAction({
      action: GmxOrderAction.IncreasePosition,
      position: mockPosition,
      input: { sizeUsd: '1' },
      ...decimals,
    })
    expect(params.addresses.receiver).toBe(GMX_ZERO_ADDRESS)
    expect(params.addresses.cancellationReceiver).toBe(GMX_ZERO_ADDRESS)
    expect(params.addresses.callbackContract).toBe(GMX_ZERO_ADDRESS)
    expect(params.addresses.uiFeeReceiver).toBe(GMX_ZERO_ADDRESS)
    expect(params.addresses.market).toBe(MARKET)
    expect(params.addresses.initialCollateralToken).toBe(WETH)
    expect(params.addresses.swapPath).toEqual([])
    expect(params.numbers.executionFee).toBe(0n)
    expect(params.numbers.callbackGasLimit).toBe(0n)
    expect(params.numbers.triggerPrice).toBe(0n)
    expect(params.decreasePositionSwapType).toBe(GMX_NO_SWAP)
    expect(params.shouldUnwrapNativeToken).toBe(false)
    expect(params.referralCode).toBe(GMX_ZERO_BYTES32)
    expect(params.dataList).toEqual([])
  })
})

describe('resolveCollateralDirection', () => {
  it('maps the unified collateral action to increase or decrease', () => {
    expect(resolveCollateralDirection(GmxOrderAction.DeltaCollateral, 'increase')).toBe(
      GmxOrderAction.IncreaseCollateral,
    )
    expect(resolveCollateralDirection(GmxOrderAction.DeltaCollateral, 'decrease')).toBe(
      GmxOrderAction.DecreaseCollateral,
    )
  })

  it('passes other actions through unchanged', () => {
    expect(resolveCollateralDirection(GmxOrderAction.IncreasePosition, 'increase')).toBe(
      GmxOrderAction.IncreasePosition,
    )
    expect(resolveCollateralDirection(GmxOrderAction.ClosePosition, 'decrease')).toBe(GmxOrderAction.ClosePosition)
  })
})

describe('getStaticTokenDecimals', () => {
  it('resolves common Arbitrum tokens without RPC', () => {
    expect(getStaticTokenDecimals(WETH)).toBe(18)
    expect(getStaticTokenDecimals('0xaf88d065e77c8cC2239327C5EDb3A432268e5831')).toBe(6) // USDC
    expect(getStaticTokenDecimals('0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f')).toBe(8) // WBTC
  })

  it('is case-insensitive', () => {
    expect(getStaticTokenDecimals(WETH.toLowerCase())).toBe(18)
    expect(getStaticTokenDecimals(WETH.toUpperCase().replace('0X', '0x'))).toBe(18)
  })

  it('returns undefined for unknown tokens (on-chain fallback path)', () => {
    expect(getStaticTokenDecimals('0x97Ce1F309B949f7FBC4f58c5cb6aa417A5ff8964')).toBeUndefined()
    expect(getStaticTokenDecimals(undefined)).toBeUndefined()
  })
})
