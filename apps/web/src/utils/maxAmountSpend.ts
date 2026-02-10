import { Currency, CurrencyAmount } from '@uniswap/sdk-core'
import JSBI from 'jsbi'

const MIN_NATIVE_CURRENCY_FOR_GAS: JSBI = JSBI.exponentiate(JSBI.BigInt(10), JSBI.BigInt(16)) // .01 ETH

/**
 * Given some token amount, return the max that can be spent of it.
 * For native currencies (ETH), reserves a small amount for gas unless operating on a smart pool.
 * Used by BuyModal where the user pays from their own wallet.
 * @param currencyAmount - The currency amount to calculate max spend from
 * @param isSmartPool - If true, returns full balance (gas paid by user's wallet, not the pool)
 */
export function maxAmountSpend(
  currencyAmount?: CurrencyAmount<Currency>,
  isSmartPool?: boolean,
): CurrencyAmount<Currency> | undefined {
  if (!currencyAmount) {
    return undefined
  }
  // For smart pool operations, the native token being spent comes from the pool,
  // not the user's wallet. Gas is paid separately by the user. No reserve needed.
  if (isSmartPool) {
    return currencyAmount
  }
  if (currencyAmount.currency.isNative) {
    if (JSBI.greaterThan(currencyAmount.quotient, MIN_NATIVE_CURRENCY_FOR_GAS)) {
      return CurrencyAmount.fromRawAmount(
        currencyAmount.currency,
        JSBI.subtract(currencyAmount.quotient, MIN_NATIVE_CURRENCY_FOR_GAS),
      )
    }
    return CurrencyAmount.fromRawAmount(currencyAmount.currency, JSBI.BigInt(0))
  }
  return currencyAmount
}
