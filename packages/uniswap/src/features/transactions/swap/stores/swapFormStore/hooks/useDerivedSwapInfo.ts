import { Currency, CurrencyAmount, TradeType } from '@uniswap/sdk-core'
import { TradingApi } from '@universe/api'
import { UniverseChainId, Platform } from '@universe/chains'
import { isValidHexString } from '@universe/encoding'
import { parseUnits } from 'ethers/lib/utils'
import { useMemo } from 'react'
import { NATIVE_TOKEN_PLACEHOLDER } from 'uniswap/src/constants/addresses'
import { useUniswapContextSelector } from 'uniswap/src/contexts/UniswapContext'
import { useAccountsStore } from 'uniswap/src/features/accounts/store/hooks'
import { useEnabledChains } from 'uniswap/src/features/chains/hooks/useEnabledChains'
import { useTradingApiGasOverrides } from 'uniswap/src/features/gas/hooks/useTradingApiGasOverrides'
import { useShouldWaitForPermissionedCheck } from 'uniswap/src/features/permissionedTokens/useShouldWaitForPermissionedCheck'
import { useOnChainCurrencyBalance } from 'uniswap/src/features/portfolio/api'
import { usePortfolioBalances } from 'uniswap/src/features/portfolio/balances/hooks'
import { getCurrencyAmount, ValueType } from 'uniswap/src/features/tokens/getCurrencyAmount'
import { useCurrencyInfo } from 'uniswap/src/features/tokens/useCurrencyInfo'
import { useTransactionSettingsStore } from 'uniswap/src/features/transactions/components/settings/stores/transactionSettingsStore/useTransactionSettingsStore'
import { useUSDCValue } from 'uniswap/src/features/transactions/hooks/useUSDCPrice'
import { useSwapEarnIntent } from 'uniswap/src/features/transactions/swap/hooks/useSwapEarnIntent'
import { useTrade } from 'uniswap/src/features/transactions/swap/hooks/useTrade'
import { useTradeFromExistingPlan } from 'uniswap/src/features/transactions/swap/hooks/useTradeFromExistingPlan'
import { getWalletExecutionContext } from 'uniswap/src/features/transactions/swap/plan/planSagaUtils'
import type { DerivedSwapInfo } from 'uniswap/src/features/transactions/swap/types/derivedSwapInfo'
import { getWrapType } from 'uniswap/src/features/transactions/swap/utils/wrap'
import type { TransactionState } from 'uniswap/src/features/transactions/types/transactionState'
import { useWallet } from 'uniswap/src/features/wallet/hooks/useWallet'
import { CurrencyField } from 'uniswap/src/types/currency'
import { buildCurrencyId, currencyId, normalizeCurrencyIdForMapLookup } from 'uniswap/src/utils/currencyId'

/** Returns information derived from the current swap state */
export function useDerivedSwapInfo({
  isDebouncing,
  smartPoolAddress,
  isEarnFlow,
  ...state
}: TransactionState & {
  isDebouncing?: boolean
  smartPoolAddress?: string
  isEarnFlow?: boolean
}): DerivedSwapInfo {
  const {
    [CurrencyField.INPUT]: currencyAssetIn,
    [CurrencyField.OUTPUT]: currencyAssetOut,
    exactAmountFiat,
    exactAmountToken,
    exactCurrencyField,
    focusOnCurrencyField = CurrencyField.INPUT,
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
  )

  const currencyOutInfo = useCurrencyInfo(
    currencyAssetOut ? buildCurrencyId(currencyAssetOut.chainId, currencyAssetOut.address) : undefined,
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
  const { balance: tokenInOnChainBalance } = useOnChainCurrencyBalance(currencyIn, balanceAddress)
  const { balance: tokenOutOnChainBalance } = useOnChainCurrencyBalance(currencyOut, balanceAddress)

  // For smart pools, also pull balances from the portfolio API (the same source used by the
  // token selector and web useTokenBalances). This is more reliable than direct RPC when the
  // wallet is disconnected or not on the pool's chain. Prefer portfolio, fall back to on-chain.
  const { data: smartPoolPortfolioBalances } = usePortfolioBalances({
    evmAddress: smartPoolAddress && isValidHexString(smartPoolAddress) ? smartPoolAddress : undefined,
    fetchPolicy: 'cache-and-network',
  })

  const getSmartPoolPortfolioBalance = (currency: Currency | undefined): CurrencyAmount<Currency> | undefined => {
    if (!currency || !smartPoolPortfolioBalances) {
      return undefined
    }

    const key = normalizeCurrencyIdForMapLookup(currencyId(currency))
    if (!key) {
      return undefined
    }

    let portfolioBalance = smartPoolPortfolioBalances[key]
    // The portfolio API keys native balances by the placeholder address `NATIVE` for some
    // chains, while the swap input currency resolves to the canonical native address.
    // Fallback to the placeholder key when the canonical lookup misses.
    if (!portfolioBalance && currency.isNative) {
      portfolioBalance = smartPoolPortfolioBalances[`${currency.chainId}-${NATIVE_TOKEN_PLACEHOLDER}`]
    }
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

  const tokenInBalance = smartPoolAddress
    ? (getSmartPoolPortfolioBalance(currencyIn) ?? tokenInOnChainBalance)
    : tokenInOnChainBalance
  const tokenOutBalance = smartPoolAddress
    ? (getSmartPoolPortfolioBalance(currencyOut) ?? tokenOutOnChainBalance)
    : tokenOutOnChainBalance

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
  // Earn deposits are exact-input only: the user specifies how much of the input token to
  // swap + deposit. Exact-asset (output-specified) deposits are not supported. When
  // disabled, the Earn hook passes inert query inputs so normal swaps do not fetch Earn data.
  const { earnIntent, quoteOutputOverride } = useSwapEarnIntent({
    currencyIn,
    currencyOut,
    enabled: isEarnFlow === true && exactCurrencyField === CurrencyField.INPUT,
  })

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
  const caip25Info = useAccountsStore((s) => s.getActiveConnector(Platform.EVM)?.session?.caip25Info)
  const walletExecutionContext = useMemo(() => getWalletExecutionContext(caip25Info), [caip25Info])
  // tx is unavailable at quote time (this hook runs before the /swap response
  // resolves); recommended falls back to undefined, which is fine for full overrides.
  const gasOverrides = useTradingApiGasOverrides({ tx: undefined })
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
      walletExecutionContext,
      gasOverrides,
      earnIntent,
      quoteOutputOverride,
      skipIndicativeTrade: earnIntent !== undefined,
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
      walletExecutionContext,
      gasOverrides,
      earnIntent,
      quoteOutputOverride,
    ],
  )

  // Hold the quote until the permissioned-token check for this pair has resolved, so the first
  // quote can't ship the wrong Universal Router version off a cold cache. See the hook for detail.
  const isPermissionedCheckLoading = useShouldWaitForPermissionedCheck({
    inputCurrency: currencyIn,
    outputCurrency: currencyOut,
    walletAddress: account?.address,
  })

  const existingPlanTrade = useTradeFromExistingPlan(tradeParams)
  const tradeFromQuote = useTrade({ ...tradeParams, skip: !!existingPlanTrade || isPermissionedCheckLoading })
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
    if (!('routing' in displayableTrade) || displayableTrade.routing !== TradingApi.Routing.BRIDGE) {
      return displayableTradeOutputAmount
    }

    // Derive token price from input amount (same asset, source chain → USD works)
    const inputTokens = parseFloat(displayableTrade.inputAmount.toExact())
    const inputUSD = inputCurrencyUSDValue ? parseFloat(inputCurrencyUSDValue.toExact()) : 0
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

    // Compute deduction in output token raw units.
    // tokenPriceUSD is USD per 1 whole token (decimal-agnostic via .toExact()), so
    // deductionTokens = overheadUSD / tokenPriceUSD is in human-readable token units.
    // Multiply by 10^decimals to get raw units. This is display-only (not on-chain),
    // so standard float precision is sufficient for sub-dollar deductions.
    const deductionTokens = overheadUSD / tokenPriceUSD
    const deductionRawStr = Math.floor(deductionTokens * 10 ** outputCurrency.decimals).toFixed(0)
    if (deductionRawStr === '0') {
      return displayableTradeOutputAmount
    }

    try {
      const deduction = CurrencyAmount.fromRawAmount(outputCurrency, deductionRawStr)
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
      [CurrencyField.OUTPUT]: exactCurrencyField === CurrencyField.OUTPUT ? amountSpecified : adjustedOutputAmount,
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
    trade,
    txId,
    wrapType,
    smartPoolAddress,
    displayableTrade,
  ])
}
