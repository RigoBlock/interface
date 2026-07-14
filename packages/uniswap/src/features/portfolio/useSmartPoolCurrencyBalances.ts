import { Currency, CurrencyAmount } from '@uniswap/sdk-core'
import { parseUnits } from 'ethers/lib/utils'
import { useMemo } from 'react'
import { usePortfolioBalancesForAddressById } from 'uniswap/src/components/TokenSelector/hooks/usePortfolioBalancesForAddressById'
import { normalizeCurrencyIdForMapLookup } from 'uniswap/src/data/cache'
import { CurrencyField } from 'uniswap/src/types/currency'
import { currencyId } from 'uniswap/src/utils/currencyId'
import { isValidHexString } from 'utilities/src/addresses/hex'

function getPortfolioCurrencyBalance(
  currency: Currency | null | undefined,
  portfolioBalancesById: Record<string, { quantity: number }> | undefined,
): CurrencyAmount<Currency> | undefined {
  if (!currency || !portfolioBalancesById) {
    return undefined
  }

  const id = normalizeCurrencyIdForMapLookup(currencyId(currency))
  if (!id) {
    return undefined
  }

  const portfolioBalance = portfolioBalancesById[id]
  if (!portfolioBalance) {
    return undefined
  }

  try {
    const rawAmount = parseUnits(portfolioBalance.quantity.toString(), currency.decimals).toString()
    return CurrencyAmount.fromRawAmount(currency, rawAmount)
  } catch {
    return undefined
  }
}

/**
 * Returns CurrencyAmount balances for the given currencies from the portfolio API
 * for a smart pool address. This mirrors the token selector's balance source and
 * works even when the user's wallet is disconnected.
 */
export function useSmartPoolCurrencyBalances({
  currencyIn,
  currencyOut,
  smartPoolAddress,
}: {
  currencyIn: Currency | null | undefined
  currencyOut: Currency | null | undefined
  smartPoolAddress?: string
}): {
  [CurrencyField.INPUT]: CurrencyAmount<Currency> | undefined
  [CurrencyField.OUTPUT]: CurrencyAmount<Currency> | undefined
  isLoading: boolean
} {
  const { data: portfolioBalancesById, loading } = usePortfolioBalancesForAddressById({
    evmAddress: smartPoolAddress && isValidHexString(smartPoolAddress) ? smartPoolAddress : undefined,
  })

  return useMemo(
    () => ({
      [CurrencyField.INPUT]: getPortfolioCurrencyBalance(currencyIn, portfolioBalancesById),
      [CurrencyField.OUTPUT]: getPortfolioCurrencyBalance(currencyOut, portfolioBalancesById),
      isLoading: loading,
    }),
    [currencyIn, currencyOut, portfolioBalancesById, loading],
  )
}
