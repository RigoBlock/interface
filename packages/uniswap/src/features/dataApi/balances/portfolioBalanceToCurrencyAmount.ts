import { Currency, CurrencyAmount } from '@uniswap/sdk-core'
import { parseUnits } from 'ethers/lib/utils'
import type { PortfolioBalance } from 'uniswap/src/features/dataApi/types'

/**
 * Converts a portfolio API balance to an exact CurrencyAmount.
 *
 * `quantityRaw` (the exact base-unit string from the API) must be preferred: `quantity` is a
 * float64 that loses precision past ~15-17 significant digits and can round ABOVE the true
 * balance for 18-decimal tokens (e.g. 0.999999999999999999 ETH becomes `1`). Feeding such a
 * value to a MAX-amount flow requests more than the account holds and the on-chain transfer
 * reverts (TRANSFER_FROM_FAILED). Falls back to parsing the float only when the API omitted
 * the raw value, and returns undefined when neither source is usable.
 */
export function portfolioBalanceToCurrencyAmount(
  portfolioBalance: Pick<PortfolioBalance, 'quantity' | 'quantityRaw'>,
  currency: Currency,
): CurrencyAmount<Currency> | undefined {
  try {
    if (portfolioBalance.quantityRaw) {
      return CurrencyAmount.fromRawAmount(currency, portfolioBalance.quantityRaw)
    }
    const rawAmount = parseUnits(portfolioBalance.quantity.toString(), currency.decimals).toString()
    return CurrencyAmount.fromRawAmount(currency, rawAmount)
  } catch {
    return undefined
  }
}
