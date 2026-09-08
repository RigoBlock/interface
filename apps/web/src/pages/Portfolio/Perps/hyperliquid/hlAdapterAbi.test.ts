import { decodeAbiParameters } from 'viem'
import {
  buildLimitOrderAction,
  buildSpotSendAction,
  buildUsdClassTransferAction,
  encodeHlAction,
  formatHlPrice,
  HL_TIF,
  quantumFor,
  toHlPx,
  toHlSz,
  usdToCoreWei,
  usdToPerpUnits,
  usdToSizeRaw,
} from '~/pages/Portfolio/Perps/hyperliquid/hlAdapterAbi'

const HL_USDC_SYSTEM_ADDRESS = '0x2000000000000000000000000000000000000000'

describe('formatHlPrice', () => {
  it('truncates to 6 − szDecimals decimals', () => {
    // BTC has szDecimals 5 → 1 decimal place, then 5 significant figures (67234.5 → 67234)
    expect(formatHlPrice(67234.56, 5)).toBe('67234')
    // ETH has szDecimals 4 → 2 decimal places, then 5 significant figures
    expect(formatHlPrice(3500.129, 4)).toBe('3500.1')
  })

  it('keeps integer prices below the 5 significant-figure cap', () => {
    expect(formatHlPrice(79474, 5)).toBe('79474')
  })

  it('truncates non-integer prices to 5 significant figures', () => {
    // 1234.56 → truncate to 2 decimals (5 sig figs)
    expect(formatHlPrice(1234.56, 3)).toBe('1234.5')
  })

  it('rejects non-positive prices', () => {
    expect(() => formatHlPrice(0, 5)).toThrow()
    expect(() => formatHlPrice(-1, 5)).toThrow()
  })
})

describe('toHlPx', () => {
  it('scales human prices to 8-decimal fixed point', () => {
    expect(toHlPx(67234.5)).toBe(6723450000000n)
    expect(toHlPx('3500.12')).toBe(350012000000n)
  })

  it('rejects invalid prices', () => {
    expect(() => toHlPx(0)).toThrow()
    expect(() => toHlPx('abc')).toThrow()
  })
})

describe('toHlSz', () => {
  it('truncates to the market quantum then scales to the 1e8 wire scale', () => {
    // 0.15 BTC at szDecimals 5 → quantum 15000 → 0.15 * 1e8 = 15000000
    expect(toHlSz(0.15, 5)).toBe(15000000n)
    expect(toHlSz('0.15', 5)).toBe(15000000n)
  })

  it('rejects sizes that truncate to zero', () => {
    expect(() => toHlSz(0.000001, 5)).toThrow()
  })
})

describe('usdToSizeRaw', () => {
  it('converts USD notional to quantum-truncated base size', () => {
    expect(usdToSizeRaw(100, { price: 50000, szDecimals: 5 })).toBe('0.002')
    expect(usdToSizeRaw(101, { price: 50000, szDecimals: 5 })).toBe('0.00202')
  })

  it('rejects non-positive inputs', () => {
    expect(() => usdToSizeRaw(0, { price: 50000, szDecimals: 5 })).toThrow()
    expect(() => usdToSizeRaw(100, { price: 0, szDecimals: 5 })).toThrow()
  })
})

describe('quantumFor', () => {
  it('returns the minimum size increment for a market', () => {
    expect(quantumFor(5)).toBe(0.00001)
    expect(quantumFor(0)).toBe(1)
  })
})

describe('USDC unit conversions', () => {
  it('converts human USDC to 6-decimal perp units', () => {
    expect(usdToPerpUnits(10)).toBe(10000000n)
    expect(usdToPerpUnits('1,250.5')).toBe(1250500000n)
  })

  it('converts human USDC to 8-decimal Core spot wei', () => {
    expect(usdToCoreWei(0.1)).toBe(10000000n)
    expect(usdToCoreWei(25)).toBe(2500000000n)
  })

  it('rejects non-positive amounts', () => {
    expect(() => usdToPerpUnits(0)).toThrow()
    expect(() => usdToCoreWei(-5)).toThrow()
  })
})

describe('encodeHlAction', () => {
  it('prepends version 1 and the uint24 action id', () => {
    const payload = encodeHlAction(7, ('0x' + '00'.repeat(32)) as `0x${string}`)
    expect(payload.slice(0, 10)).toBe('0x01000007')
    expect(payload.length).toBe(2 + 8 + 64)
  })
})

describe('buildLimitOrderAction', () => {
  it('builds a versioned limit-order payload with abi-encoded params', () => {
    const cloid = 12345678901234567890n
    const payload = buildLimitOrderAction({
      asset: 0,
      isBuy: true,
      limitPx: toHlPx(68000),
      sz: toHlSz(0.15, 5),
      reduceOnly: false,
      tif: HL_TIF.ioc,
      cloid,
    })

    expect(payload.slice(0, 10)).toBe('0x01000001')

    const decoded = decodeAbiParameters(
      [
        { type: 'uint32' },
        { type: 'bool' },
        { type: 'uint64' },
        { type: 'uint64' },
        { type: 'bool' },
        { type: 'uint8' },
        { type: 'uint128' },
      ],
      (`0x${payload.slice(10)}`) as `0x${string}`,
    )
    expect(decoded[0]).toBe(0)
    expect(decoded[1]).toBe(true)
    expect(decoded[2]).toBe(6800000000000n)
    expect(decoded[3]).toBe(15000000n)
    expect(decoded[4]).toBe(false)
    expect(decoded[5]).toBe(3)
    expect(decoded[6]).toBe(cloid)
  })

  it('rejects spot/outcome asset indices', () => {
    expect(() =>
      buildLimitOrderAction({
        asset: 10000,
        isBuy: true,
        limitPx: 1n,
        sz: 1n,
        reduceOnly: false,
        tif: HL_TIF.gtc,
        cloid: 1n,
      }),
    ).toThrow()
  })
})

describe('buildUsdClassTransferAction', () => {
  it('builds a perp→spot transfer with toPerp=false', () => {
    const payload = buildUsdClassTransferAction(usdToPerpUnits(25))
    expect(payload.slice(0, 10)).toBe('0x01000007')

    const decoded = decodeAbiParameters(
      [{ type: 'uint64' }, { type: 'bool' }],
      (`0x${payload.slice(10)}`) as `0x${string}`,
    )
    expect(decoded[0]).toBe(25000000n)
    expect(decoded[1]).toBe(false)
  })
})

describe('buildSpotSendAction', () => {
  it('builds a Core spot→HyperEVM send for USDC token index 0', () => {
    const payload = buildSpotSendAction({ destination: HL_USDC_SYSTEM_ADDRESS, token: 0, amountWei: usdToCoreWei(25) })
    expect(payload.slice(0, 10)).toBe('0x01000006')

    const decoded = decodeAbiParameters(
      [{ type: 'address' }, { type: 'uint64' }, { type: 'uint64' }],
      (`0x${payload.slice(10)}`) as `0x${string}`,
    )
    expect(decoded[0]).toBe(HL_USDC_SYSTEM_ADDRESS)
    expect(decoded[1]).toBe(0n)
    expect(decoded[2]).toBe(2500000000n)
  })
})
