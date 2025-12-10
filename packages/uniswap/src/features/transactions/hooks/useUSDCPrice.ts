import { Currency, CurrencyAmount, Price, Token, TradeType } from '@uniswap/sdk-core'
import JSBI from 'jsbi'
import { useMemo } from 'react'
import { PollingInterval } from 'uniswap/src/constants/misc'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { getPrimaryStablecoin, isUniverseChainId } from 'uniswap/src/features/chains/utils'
import { useTrade } from 'uniswap/src/features/transactions/swap/hooks/useTrade'
import { isClassic, isJupiter } from 'uniswap/src/features/transactions/swap/utils/routing'
import { areCurrencyIdsEqual, currencyId } from 'uniswap/src/utils/currencyId'

const SONEIUM_AMOUNT_OVERRIDE = 30
const DEFAULT_STABLECOIN_AMOUNT_OUT = 1000
const GRG_AMOUNT_OVERRIDE = 10 // Use smaller amount for GRG tokens due to liquidity constraints
const GRG_FALLBACK_INPUT_AMOUNT = 30 // Fallback amount of GRG tokens for EXACT_INPUT pricing

function getStablecoinAmountOut(chainId: UniverseChainId, currency?: Currency): CurrencyAmount<Token> {
  const primaryStablecoin = getPrimaryStablecoin(chainId)

  // Special override for GRG tokens - use smaller amount due to liquidity constraints
  if (currency?.symbol === 'GRG') {
    const amount = GRG_AMOUNT_OVERRIDE * Math.pow(10, primaryStablecoin.decimals)
    return CurrencyAmount.fromRawAmount(primaryStablecoin, amount)
  }

  if (chainId === UniverseChainId.Soneium) {
    const amount = SONEIUM_AMOUNT_OVERRIDE * Math.pow(10, primaryStablecoin.decimals)
    return CurrencyAmount.fromRawAmount(primaryStablecoin, amount)
  }

  const amount = DEFAULT_STABLECOIN_AMOUNT_OUT * Math.pow(10, primaryStablecoin.decimals)
  return CurrencyAmount.fromRawAmount(primaryStablecoin, amount)
}

function getGrgFallbackAmount(currency?: Currency): CurrencyAmount<Currency> | undefined {
  if (!currency || currency?.symbol !== 'GRG') return undefined
  const amount = GRG_FALLBACK_INPUT_AMOUNT * Math.pow(10, currency.decimals)
  return CurrencyAmount.fromRawAmount(currency, amount)
}

/**
 * Returns the price in USDC of the input currency
 * @param currency currency to compute the USDC price of
 */
export function useUSDCPrice(
  currency?: Currency,
  pollInterval: PollingInterval = PollingInterval.Fast,
): {
  price: Price<Currency, Currency> | undefined
  isLoading: boolean
} {
  const chainId = currency?.chainId

  const quoteAmount = useMemo(
    () => (isUniverseChainId(chainId) ? getStablecoinAmountOut(chainId, currency) : undefined),
    [chainId, currency],
  )
  const stablecoin = quoteAmount?.currency

  // avoid requesting quotes for stablecoin input
  const currencyIsStablecoin = Boolean(
    stablecoin && currency && areCurrencyIdsEqual(currencyId(currency), currencyId(stablecoin)),
  )
  const amountSpecified = currencyIsStablecoin ? undefined : quoteAmount

  // Primary trade: EXACT_OUTPUT (get specific USDC amount for unknown GRG amount)
  const { trade, isLoading } = useTrade({
    amountSpecified,
    otherCurrency: currency,
    tradeType: TradeType.EXACT_OUTPUT,
    pollInterval,
    isUSDQuote: true,
  })

  // Fallback for GRG tokens: EXACT_INPUT (sell specific GRG amount for unknown USDC amount)
  const grgFallbackAmount = useMemo(() => getGrgFallbackAmount(currency), [currency])
  const shouldUseFallback = !trade && !isLoading && currency?.symbol === 'GRG' && grgFallbackAmount && stablecoin

  const { trade: fallbackTrade, isLoading: fallbackLoading } = useTrade({
    amountSpecified: shouldUseFallback ? grgFallbackAmount : undefined,
    otherCurrency: shouldUseFallback ? stablecoin : undefined,
    tradeType: TradeType.EXACT_INPUT,
    pollInterval,
    isUSDQuote: true,
  })

  return useMemo(() => {
    if (!stablecoin) {
      return { price: undefined, isLoading: false }
    }

    if (currencyIsStablecoin) {
      // handle stablecoin
      return { price: new Price(stablecoin, stablecoin, '1', '1'), isLoading: false }
    }

    // Try primary trade first
    if (trade && isJupiter(trade) && currency) {
      // Convert the string amounts to JSBI.BigInt values
      const inputAmount = JSBI.BigInt(trade.quote.quote.inAmount)
      const outputAmount = JSBI.BigInt(trade.quote.quote.outAmount)
      return { price: new Price(currency, stablecoin, inputAmount, outputAmount), isLoading }
    }

    if (trade && isClassic(trade) && trade.routes[0] && currency) {
      const { numerator, denominator } = trade.routes[0].midPrice
      return { price: new Price(currency, stablecoin, denominator, numerator), isLoading }
    }

    // Fallback to EXACT_INPUT trade for GRG tokens
    if (fallbackTrade && currency?.symbol === 'GRG') {
      if (isJupiter(fallbackTrade)) {
        // For Jupiter trades, calculate price from the quote amounts
        const inputAmount = JSBI.BigInt(fallbackTrade.quote.quote.inAmount)
        const outputAmount = JSBI.BigInt(fallbackTrade.quote.quote.outAmount)
        return { price: new Price(currency, stablecoin, inputAmount, outputAmount), isLoading: fallbackLoading }
      }

      if (isClassic(fallbackTrade) && fallbackTrade.routes[0]) {
        // For classic trades, use the midPrice from the route
        const { numerator, denominator } = fallbackTrade.routes[0].midPrice
        return { price: new Price(currency, stablecoin, denominator, numerator), isLoading: fallbackLoading }
      }
    }

    return { price: undefined, isLoading: isLoading || fallbackLoading }
  }, [currency, stablecoin, currencyIsStablecoin, trade, isLoading, fallbackTrade, fallbackLoading])
}

export function useUSDCValue(
  currencyAmount: CurrencyAmount<Currency> | undefined | null,
  pollInterval: PollingInterval = PollingInterval.Fast,
): CurrencyAmount<Currency> | null {
  const { price } = useUSDCPrice(currencyAmount?.currency, pollInterval)

  return useMemo(() => {
    if (!price || !currencyAmount) {
      return null
    }
    try {
      return price.quote(currencyAmount)
    } catch (_error) {
      return null
    }
  }, [currencyAmount, price])
}

/**
 * @param currencyAmount
 * @returns Returns fiat value of the currency amount, and loading status of the currency<->stable quote
 */
export function useUSDCValueWithStatus(currencyAmount: CurrencyAmount<Currency> | undefined | null): {
  value: CurrencyAmount<Currency> | null
  isLoading: boolean
} {
  const { price, isLoading } = useUSDCPrice(currencyAmount?.currency)

  return useMemo(() => {
    if (!price || !currencyAmount) {
      return { value: null, isLoading }
    }
    try {
      return { value: price.quote(currencyAmount), isLoading }
    } catch (_error) {
      return {
        value: null,
        isLoading: false,
      }
    }
  }, [currencyAmount, isLoading, price])
}
