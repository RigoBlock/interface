import { CurrencyAmount, TradeType } from '@uniswap/sdk-core'
import { TradingApi } from '@universe/api'
import { useMemo } from 'react'
import { useUniswapContextSelector } from 'uniswap/src/contexts/UniswapContext'
import { useEnabledChains } from 'uniswap/src/features/chains/hooks/useEnabledChains'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { useOnChainCurrencyBalance } from 'uniswap/src/features/portfolio/api'
import { getCurrencyAmount, ValueType } from 'uniswap/src/features/tokens/getCurrencyAmount'
import { useCurrencyInfo } from 'uniswap/src/features/tokens/useCurrencyInfo'
import { useTransactionSettingsStore } from 'uniswap/src/features/transactions/components/settings/stores/transactionSettingsStore/useTransactionSettingsStore'
import { useUSDCValue } from 'uniswap/src/features/transactions/hooks/useUSDCPriceWrapper'
import { useTrade } from 'uniswap/src/features/transactions/swap/hooks/useTrade'
import { useTradeFromExistingPlan } from 'uniswap/src/features/transactions/swap/hooks/useTradeFromExistingPlan'
import type { DerivedSwapInfo } from 'uniswap/src/features/transactions/swap/types/derivedSwapInfo'
import { getWrapType } from 'uniswap/src/features/transactions/swap/utils/wrap'
import type { TransactionState } from 'uniswap/src/features/transactions/types/transactionState'
import { useWallet } from 'uniswap/src/features/wallet/hooks/useWallet'
import { CurrencyField } from 'uniswap/src/types/currency'
import { buildCurrencyId } from 'uniswap/src/utils/currencyId'

/** Returns information derived from the current swap state */
export function useDerivedSwapInfo({
  isDebouncing,
  smartPoolAddress,
  ...state
}: TransactionState & { isDebouncing?: boolean; smartPoolAddress?: string }): DerivedSwapInfo {
  const {
    [CurrencyField.INPUT]: currencyAssetIn,
    [CurrencyField.OUTPUT]: currencyAssetOut,
    exactAmountFiat,
    exactAmountToken,
    exactCurrencyField,
    focusOnCurrencyField = CurrencyField.INPUT,
    selectingCurrencyField,
    txId,
  } = state

  const { defaultChainId } = useEnabledChains()

  const { customSlippageTolerance, selectedProtocols, isV4HookPoolsEnabled } = useTransactionSettingsStore((s) => ({
    customSlippageTolerance: s.customSlippageTolerance,
    selectedProtocols: s.selectedProtocols,
    isV4HookPoolsEnabled: s.isV4HookPoolsEnabled,
  }))

  const currencyInInfo = useCurrencyInfo(
    currencyAssetIn ? buildCurrencyId(currencyAssetIn.chainId, currencyAssetIn.address) : undefined,
    { refetch: true },
  )

  const currencyOutInfo = useCurrencyInfo(
    currencyAssetOut ? buildCurrencyId(currencyAssetOut.chainId, currencyAssetOut.address) : undefined,
    { refetch: true },
  )

  const currencyIn = currencyInInfo?.currency
  const currencyOut = currencyOutInfo?.currency

  const chainId = currencyIn?.chainId ?? currencyOut?.chainId ?? defaultChainId

  const { evmAccount, svmAccount } = useWallet()

  const account = chainId === UniverseChainId.Solana ? svmAccount : evmAccount

  const currencies = useMemo(() => {
    return {
      [CurrencyField.INPUT]: currencyInInfo,
      [CurrencyField.OUTPUT]: currencyOutInfo,
    }
  }, [currencyInInfo, currencyOutInfo])

  // Use smart pool address for balances if available, otherwise fall back to user account
  const balanceAddress = smartPoolAddress || account?.address
  const { balance: tokenInBalance } = useOnChainCurrencyBalance(currencyIn, balanceAddress)
  const { balance: tokenOutBalance } = useOnChainCurrencyBalance(currencyOut, balanceAddress)

  const isExactIn = exactCurrencyField === CurrencyField.INPUT
  const wrapType = getWrapType(currencyIn, currencyOut)

  const otherCurrency = isExactIn ? currencyOut : currencyIn
  const exactCurrency = isExactIn ? currencyIn : currencyOut

  // amountSpecified, otherCurrency, tradeType fully defines a trade
  const amountSpecified = useMemo(() => {
    return getCurrencyAmount({
      value: exactAmountToken,
      valueType: ValueType.Exact,
      currency: exactCurrency,
    })
  }, [exactAmountToken, exactCurrency])

  // TODO: we disable fee logic here, otherwise protocol will revert
  const sendPortionEnabled = false //useFeatureFlag(FeatureFlags.PortionFields)

  const generatePermitAsTransaction = useUniswapContextSelector((ctx) => {
    // For RigoBlock smart pools, don't generate permits as transactions and don't include permitData
    if (smartPoolAddress) {
      return false
    }
    // If the account cannot sign typedData, permits should be completed as a transaction step,
    // unless the swap is going through the 7702 smart wallet flow, in which case the
    // swap_7702 endpoint consumes typedData in the process encoding the swap.
    return ctx.getCanSignPermits?.(chainId) && !ctx.getSwapDelegationInfo?.(chainId).delegationAddress
  })
  const tradeParams = useMemo(
    () => ({
      account,
      amountSpecified,
      otherCurrency,
      tradeType: isExactIn ? TradeType.EXACT_INPUT : TradeType.EXACT_OUTPUT,
      customSlippageTolerance,
      selectedProtocols,
      sendPortionEnabled,
      isDebouncing,
      generatePermitAsTransaction,
      isV4HookPoolsEnabled,
    }),
    [
      account,
      amountSpecified,
      otherCurrency,
      isExactIn,
      customSlippageTolerance,
      selectedProtocols,
      sendPortionEnabled,
      isDebouncing,
      generatePermitAsTransaction,
      isV4HookPoolsEnabled,
    ],
  )

  const existingPlanTrade = useTradeFromExistingPlan(tradeParams)
  const tradeFromQuote = useTrade({ ...tradeParams, skip: !!existingPlanTrade })
  const trade = existingPlanTrade ?? tradeFromQuote

  const displayableTrade = trade.trade ?? trade.indicativeTrade

  const displayableTradeOutputAmount = displayableTrade?.outputAmount

  // Extract input amount for independent use in USD value hooks
  const inputCurrencyAmount =
    exactCurrencyField === CurrencyField.INPUT ? amountSpecified : displayableTrade?.inputAmount

  // inputCurrencyUSDValue is on the current (source) chain so useUSDCValue resolves.
  const inputCurrencyUSDValue = useUSDCValue(inputCurrencyAmount)

  // For smart pool bridge trades, adjust the displayed output to reflect the solver gas
  // compensation that will be deducted on-chain. Without this the UI shows the Across API
  // output (relay fee deducted only) which is higher than what the user actually receives.
  //
  // We derive the token price from inputCurrencyUSDValue (source chain) rather than the
  // output token's USD value, because useUSDCValue returns undefined for cross-chain tokens.
  // For bridge trades the input and output are the same asset so the price is equivalent.
  const adjustedOutputAmount = useMemo(() => {
    if (!smartPoolAddress || !displayableTrade || !displayableTradeOutputAmount) {
      return displayableTradeOutputAmount
    }
    if (displayableTrade.routing !== TradingApi.Routing.BRIDGE) {
      return displayableTradeOutputAmount
    }

    // Derive token price from input amount (same asset, source chain → USD works)
    const inputTokens = displayableTrade.inputAmount
      ? parseFloat(displayableTrade.inputAmount.toExact())
      : 0
    const inputUSD = inputCurrencyUSDValue
      ? parseFloat(inputCurrencyUSDValue.toExact())
      : 0
    if (inputTokens <= 0 || inputUSD <= 0) {
      return displayableTradeOutputAmount
    }

    const tokenPriceUSD = inputUSD / inputTokens
    const outputCurrency = displayableTradeOutputAmount.currency
    const destChainId = outputCurrency.chainId

    // Estimated solver overhead in USD (matches bridgeCalldata.ts fallbacks)
    let overheadUSD = 0.5 // L2 default
    if (destChainId === 1) {
      overheadUSD = 5.0 // Ethereum mainnet
    } else if (destChainId === 137) {
      overheadUSD = 1.0 // Polygon
    }

    // Cap at on-chain 2% limit (MAX_BRIDGE_FEE_BPS = 200)
    const outputTokens = parseFloat(displayableTradeOutputAmount.toExact())
    const outputUSD = outputTokens * tokenPriceUSD
    const acrossRelayFeeUSD = Math.max(inputUSD - outputUSD, 0)
    const maxFeeUSD = inputUSD * 0.02
    const roomUSD = maxFeeUSD - acrossRelayFeeUSD
    overheadUSD = roomUSD > 0 ? Math.min(overheadUSD, roomUSD * 0.9) : 0

    if (overheadUSD <= 0) {
      return displayableTradeOutputAmount
    }

    // Compute deduction in output token raw units using BigInt to avoid float precision loss.
    // tokenPriceUSD is USD per 1 whole token (decimal-agnostic from .toExact()), so
    // deductionTokens = overheadUSD / tokenPriceUSD gives whole tokens to deduct.
    // We scale by 1e12 first, then multiply by 10^decimals and divide by 1e12 in BigInt
    // to preserve precision for 18-decimal tokens (where 10^18 > Number.MAX_SAFE_INTEGER).
    const PRECISION = 1_000_000_000_000n // 1e12
    const overheadScaled = BigInt(Math.round((overheadUSD / tokenPriceUSD) * 1e12))
    const deductionRaw = (overheadScaled * 10n ** BigInt(outputCurrency.decimals)) / PRECISION
    if (deductionRaw <= 0n) {
      return displayableTradeOutputAmount
    }

    try {
      const deduction = CurrencyAmount.fromRawAmount(outputCurrency, deductionRaw.toString())
      if (displayableTradeOutputAmount.greaterThan(deduction)) {
        return displayableTradeOutputAmount.subtract(deduction)
      }
    } catch {
      // Safety: return original if subtraction fails
    }

    return displayableTradeOutputAmount
  }, [smartPoolAddress, displayableTrade, displayableTradeOutputAmount, inputCurrencyUSDValue])

  const currencyAmounts = useMemo(
    () => ({
      [CurrencyField.INPUT]: inputCurrencyAmount,
      [CurrencyField.OUTPUT]:
        exactCurrencyField === CurrencyField.OUTPUT ? amountSpecified : adjustedOutputAmount,
    }),
    [exactCurrencyField, amountSpecified, inputCurrencyAmount, adjustedOutputAmount],
  )

  const outputCurrencyUSDValue = useUSDCValue(currencyAmounts[CurrencyField.OUTPUT])

  const currencyAmountsUSDValue = useMemo(() => {
    return {
      [CurrencyField.INPUT]: inputCurrencyUSDValue,
      [CurrencyField.OUTPUT]: outputCurrencyUSDValue,
    }
  }, [inputCurrencyUSDValue, outputCurrencyUSDValue])

  const currencyBalances = useMemo(() => {
    return {
      [CurrencyField.INPUT]: tokenInBalance,
      [CurrencyField.OUTPUT]: tokenOutBalance,
    }
  }, [tokenInBalance, tokenOutBalance])

  return useMemo(() => {
    return {
      chainId,
      currencies,
      currencyAmounts,
      currencyAmountsUSDValue,
      currencyBalances,
      trade,
      exactAmountToken,
      exactAmountFiat,
      exactCurrencyField,
      focusOnCurrencyField,
      wrapType,
      selectingCurrencyField,
      txId,
      outputAmountUserWillReceive: displayableTrade?.quoteOutputAmountUserWillReceive,
      smartPoolAddress,
    }
  }, [
    chainId,
    currencies,
    currencyAmounts,
    currencyAmountsUSDValue,
    currencyBalances,
    exactAmountFiat,
    exactAmountToken,
    exactCurrencyField,
    focusOnCurrencyField,
    selectingCurrencyField,
    trade,
    txId,
    wrapType,
    smartPoolAddress,
    displayableTrade,
  ])
}
