import { BigNumber } from '@ethersproject/bignumber'
import { calculateGasMargin } from '~/utils/calculateGasMargin'

// JS BigInt division truncates toward zero (the fractional part is
// discarded, ECMA-262 `BigInt::divide`). Gas values are always positive,
// so for `(value * 135n) / 100n` truncation is equivalent to floor, which
// makes the +35% margin safe (we always round down, never overshoot).
describe('bigint division truncates toward zero', () => {
  it.each([
    [7n, 2n, 3n], // 3.5 -> 3
    [5n, 2n, 2n], // 2.5 -> 2
    [9n, 2n, 4n], // 4.5 -> 4
    [1n, 2n, 0n], // 0.5 -> 0
    // Toward zero, NOT floor behaviour
    [-7n, 2n, -3n], // -3.5 -> -3
    [-9n, 2n, -4n], // -4.5 -> -4
  ])('%s / %s = %s (bigint and BigNumber agree)', (a, b, expected) => {
    expect(a / b).toBe(expected)
    expect(BigNumber.from(a).div(BigNumber.from(b)).toBigInt()).toBe(expected)
  })
})

describe('#calculateGasMargin', () => {
  it('returns 0n for 0n', () => {
    expect(calculateGasMargin(0n)).toBe(0n)
  })

  it.each([
    [1000n, 1350n],
    [50n, 67n],
    [210000n, 283500n], // typical EVM gas estimate
    [15_000_000n, 20_250_000n], // near block-gas-limit estimate
  ])('adds 35%% to %s -> %s', (input, expected) => {
    expect(calculateGasMargin(input)).toBe(expected)
  })

  // (x * 135n) / 100n floor-truncates toward zero. For values not divisible
  // by 20 the exact +35% is fractional, so the result rounds down. This is
  // the same flooring behavior as ethers' BigNumber.mul(135).div(100).
  it.each([
    [1n, 1n], // 1.35 -> 1
    [4n, 5n], // 5.4 -> 5
    [20n, 27n], // exact
    [7n, 9n], // 9.45 -> 9
    [9n, 12n], // 12.15 -> 12
  ])('floors toward zero: %s -> %s', (input, expected) => {
    expect(calculateGasMargin(input)).toBe(expected)
  })

  it('handles values larger than Number.MAX_SAFE_INTEGER without precision loss', () => {
    const large = 2n ** 64n // beyond safe integer
    expect(calculateGasMargin(large)).toBe((large * 135n) / 100n)
  })
})
