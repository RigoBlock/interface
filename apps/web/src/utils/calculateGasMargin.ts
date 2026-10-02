/**
 * Returns the gas value plus a margin for
 * unexpected or variable gas costs
 *
 * @param value - The gas value to pad
 * @returns Computed gas margin += 35%
 */
export function calculateGasMargin(value: bigint): bigint {
  return (value * 135n) / 100n
}
