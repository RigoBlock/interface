import {
  InterfaceElementName,
  InterfaceEventName,
  InterfaceSectionName,
  SwapEventName,
} from '@uniswap/analytics-events'
import { Currency, CurrencyAmount, Token } from '@uniswap/sdk-core'
//import { UNIVERSAL_ROUTER_ADDRESS } from '@uniswap/universal-router-sdk'
import { useAccountDrawer } from 'components/AccountDrawer/MiniPortfolio/hooks'
import { ButtonError, ButtonGray, ButtonLight, ButtonPrimary } from 'components/Button'
import { GrayCard } from 'components/Card'
import Column, { AutoColumn } from 'components/Column'
import { ConfirmSwapModal } from 'components/ConfirmSwapModal'
import SwapCurrencyInputPanel from 'components/CurrencyInputPanel/SwapCurrencyInputPanel'
import ErrorIcon from 'components/Icons/Error'
import Row from 'components/Row'
import { CurrencySearchFilters } from 'components/SearchModal/CurrencySearch'
import CurrencySearchModal from 'components/SearchModal/CurrencySearchModal'
import TokenSafetyModal from 'components/TokenSafety/TokenSafetyModal'
import PriceImpactModal from 'components/swap/PriceImpactModal'
import SwapDetailsDropdown from 'components/swap/SwapDetailsDropdown'
import confirmPriceImpactWithoutFee from 'components/swap/confirmPriceImpactWithoutFee'
import { Field } from 'components/swap/constants'
import { ArrowContainer, ArrowWrapper, OutputSwapSection, SwapSection } from 'components/swap/styled'
import { useIsSupportedChainId, useSupportedChainId } from 'constants/chains'
import { useCurrency, useCurrencyInfo } from 'hooks/Tokens'
import { useAccount } from 'hooks/useAccount'
import { useIsLandingPage } from 'hooks/useIsLandingPage'
import { useIsSwapUnsupported } from 'hooks/useIsSwapUnsupported'
//import { useMaxAmountIn } from 'hooks/useMaxAmountIn'
import { /*usePermit2Allowance,*/ AllowanceState } from 'hooks/usePermit2Allowance'
import usePrevious from 'hooks/usePrevious'
import useSelectChain from 'hooks/useSelectChain'
import { SwapResult, useSwapCallback } from 'hooks/useSwapCallback'
import { useUSDPrice } from 'hooks/useUSDPrice'
import useWrapCallback, { WrapErrorText } from 'hooks/useWrapCallback'
import JSBI from 'jsbi'
import { useTheme } from 'lib/styled-components'
import { formatSwapQuoteReceivedEventProperties } from 'lib/utils/analytics'
import { getIsReviewableQuote } from 'pages/Swap'
import { OutputTaxTooltipBody } from 'pages/Swap/TaxTooltipBody'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown } from 'react-feather'
import { useNavigate } from 'react-router-dom'
import { useActiveSmartPool, useSelectActiveSmartPool } from 'state/application/hooks'
import { useAppSelector } from 'state/hooks'
import { useOperatedPools } from 'state/pool/hooks'
import { InterfaceTrade, RouterPreference, TradeState } from 'state/routing/types'
import { isClassicTrade } from 'state/routing/utils'
import { serializeSwapStateToURLParameters, useSwapActionHandlers } from 'state/swap/hooks'
import { CurrencyState } from 'state/swap/types'
import { useSwapAndLimitContext, useSwapContext } from 'state/swap/useSwapContext'
import { ExternalLink, ThemedText } from 'theme/components'
import { maybeLogFirstSwapAction } from 'tracing/swapFlowLoggers'
import { Text } from 'ui/src'
import { UNIVERSE_CHAIN_INFO } from 'uniswap/src/constants/chains'
import { SafetyLevel } from 'uniswap/src/data/graphql/uniswap-data-api/__generated__/types-and-hooks'
import { CurrencyInfo } from 'uniswap/src/features/dataApi/types'
import Trace from 'uniswap/src/features/telemetry/Trace'
import { sendAnalyticsEvent } from 'uniswap/src/features/telemetry/send'
import { WrapType } from 'uniswap/src/features/transactions/types/wrap'
import { Trans } from 'uniswap/src/i18n'
import { UniverseChainId } from 'uniswap/src/types/chains'
import { CurrencyField } from 'uniswap/src/types/currency'
import { logger } from 'utilities/src/logger/logger'
import { useTrace } from 'utilities/src/telemetry/trace/TraceContext'
import { computeFiatValuePriceImpact } from 'utils/computeFiatValuePriceImpact'
import { NumberType, useFormatter } from 'utils/formatNumbers'
import { maxAmountSpend } from 'utils/maxAmountSpend'
import { largerPercentValue } from 'utils/percent'
import { computeRealizedPriceImpact, warningSeverity } from 'utils/prices'
import { didUserReject } from 'utils/swapErrorToUserReadableMessage'
import { ReactComponent as DropDown } from 'assets/images/dropdown.svg'
import { RowFixed } from 'components/Row'
//import { PoolInitParams, PoolWithAddress } from '../../hooks/useSmartPools'
import styled from 'lib/styled-components'

const SWAP_FORM_CURRENCY_SEARCH_FILTERS = {
  showCommonBases: true,
}

const PoolSelect = styled(ButtonGray)<{
  visible: boolean
  selected: boolean
  hideInput?: boolean
  disabled?: boolean
}>`
  align-items: center;
  background-color: ${({ selected, theme }) => (selected ? theme.surface1 : theme.accent1)};
  opacity: ${({ disabled }) => (!disabled ? 1 : 0.4)};
  box-shadow: ${({ selected }) => (selected ? 'none' : '0px 6px 10px rgba(0, 0, 0, 0.075)')};
  box-shadow: 0px 6px 10px rgba(0, 0, 0, 0.075);
  color: ${({ selected, theme }) => (selected ? theme.neutral1 : theme.white)};
  cursor: pointer;
  border-radius: 16px;
  outline: none;
  user-select: none;
  border: none;
  font-size: 24px;
  font-weight: 500;
  height: ${({ hideInput }) => (hideInput ? '2.8rem' : '2.4rem')};
  width: ${({ hideInput }) => (hideInput ? '100%' : 'initial')};
  padding: 0 8px;
  justify-content: space-between;
  margin-bottom: 16px;
  margin-left: ${({ hideInput }) => (hideInput ? '0' : '12px')};
  :focus,
  :hover {
    background-color: ${({ selected, theme }) => (selected ? theme.surface2 : theme.accent1)};
  }
  visibility: ${({ visible }) => (visible ? 'visible' : 'hidden')};
`

const StyledDropDown = styled(DropDown)<{ selected: boolean }>`
  margin: 0 0.25rem 0 0.35rem;
  height: 35%;

  path {
    stroke: ${({ selected, theme }) => (selected ? theme.neutral1 : theme.white)};
    stroke-width: 1.5px;
  }
`

const StyledTokenName = styled.span<{ active?: boolean }>`
  ${({ active }) => (active ? '  margin: 0 0.25rem 0 0.25rem;' : '  margin: 0 0.25rem 0 0.25rem;')}
  font-size: 20px;
`

const Aligner = styled.span`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
`

interface SwapFormProps {
  disableTokenInputs?: boolean
  initialCurrencyLoading?: boolean
  onCurrencyChange?: (selected: CurrencyState) => void
}

export function SwapForm({
  disableTokenInputs = false,
  initialCurrencyLoading = false,
  onCurrencyChange,
}: SwapFormProps) {
  const { isDisconnected, chainId: connectedChainId } = useAccount()

  const trace = useTrace()

  const { initialChainId, chainId, prefilledState, currencyState, multichainUXEnabled } = useSwapAndLimitContext()
  const supportedChainId = useSupportedChainId(chainId)
  const { swapState, setSwapState, derivedSwapInfo } = useSwapContext()
  const { typedValue, independentField } = swapState

  // token warning stuff
  const prefilledInputCurrencyInfo = useCurrencyInfo(prefilledState.inputCurrency)
  const prefilledOutputCurrencyInfo = useCurrencyInfo(prefilledState.outputCurrency)
  const [dismissTokenWarning, setDismissTokenWarning] = useState<boolean>(false)
  const [showPriceImpactModal, setShowPriceImpactModal] = useState<boolean>(false)
  const [modalOpen, setModalOpen] = useState<boolean>(false)

  const handleConfirmTokenWarning = useCallback(() => {
    setDismissTokenWarning(true)
  }, [])

  const handleDismissSearch = useCallback(() => {
    setModalOpen(false)
  }, [setModalOpen])

  // dismiss warning if all imported tokens are in active lists
  const urlTokensNotInDefault = useMemo(
    () =>
      prefilledInputCurrencyInfo || prefilledOutputCurrencyInfo
        ? [prefilledInputCurrencyInfo, prefilledOutputCurrencyInfo]
            .filter(
              (token): token is CurrencyInfo =>
                (token?.currency.isToken && token.safetyLevel !== SafetyLevel.Verified) ?? false,
            )
            .map((token: CurrencyInfo) => token.currency as Token)
        : [],
    [prefilledInputCurrencyInfo, prefilledOutputCurrencyInfo],
  )

  const theme = useTheme()

  // toggle wallet when disconnected
  const accountDrawer = useAccountDrawer()

  const operatedPools = useOperatedPools()

  const { address: smartPoolAddress, name: smartPoolName } = useActiveSmartPool()
  const smartPool = useCurrency(smartPoolAddress ?? undefined)
  const {
    trade: { state: tradeState, trade, swapQuoteLatency },
    allowedSlippage,
    currencyBalances,
    parsedAmount,
    currencies,
    inputError: swapInputError,
    outputFeeFiatValue,
    inputTax,
    outputTax,
  } = derivedSwapInfo

  const [inputTokenHasTax, outputTokenHasTax] = useMemo(
    () => [!inputTax.equalTo(0), !outputTax.equalTo(0)],
    [inputTax, outputTax],
  )

  useEffect(() => {
    // Force exact input if the user switches to an output token with tax
    if (outputTokenHasTax && independentField === Field.OUTPUT) {
      setSwapState((state) => ({
        ...state,
        independentField: Field.INPUT,
        typedValue: '',
      }))
    }
  }, [independentField, outputTokenHasTax, setSwapState, trade?.outputAmount])

  const {
    wrapType,
    execute: onWrap,
    inputError: wrapInputError,
  } = useWrapCallback(currencies[Field.INPUT], currencies[Field.OUTPUT], typedValue)
  const showWrap: boolean = wrapType !== WrapType.NotApplicable

  const parsedAmounts = useMemo(
    () =>
      showWrap
        ? {
            [Field.INPUT]: parsedAmount,
            [Field.OUTPUT]: parsedAmount,
          }
        : {
            [Field.INPUT]: independentField === Field.INPUT ? parsedAmount : trade?.inputAmount,
            [Field.OUTPUT]: independentField === Field.OUTPUT ? parsedAmount : trade?.outputAmount,
          },
    [independentField, parsedAmount, showWrap, trade],
  )

  const showFiatValueInput = Boolean(parsedAmounts[Field.INPUT])
  const showFiatValueOutput = Boolean(parsedAmounts[Field.OUTPUT])
  const getSingleUnitAmount = (currency?: Currency) => {
    if (!currency) {
      return
    }
    return CurrencyAmount.fromRawAmount(currency, JSBI.BigInt(10 ** currency.decimals))
  }

  const fiatValueInput = useUSDPrice(
    parsedAmounts[Field.INPUT] ?? getSingleUnitAmount(currencies[Field.INPUT]),
    currencies[Field.INPUT],
  )
  const fiatValueOutput = useUSDPrice(
    parsedAmounts[Field.OUTPUT] ?? getSingleUnitAmount(currencies[Field.OUTPUT]),
    currencies[Field.OUTPUT],
  )

  const [routeNotFound, routeIsLoading, routeIsSyncing] = useMemo(
    () => [
      tradeState === TradeState.NO_ROUTE_FOUND,
      tradeState === TradeState.LOADING,
      tradeState === TradeState.LOADING && Boolean(trade),
    ],
    [trade, tradeState],
  )

  const fiatValueTradeInput = useUSDPrice(trade?.inputAmount)
  const fiatValueTradeOutput = useUSDPrice(trade?.outputAmount)
  const preTaxFiatValueTradeOutput = useUSDPrice(trade?.outputAmount)
  const [stablecoinPriceImpact, preTaxStablecoinPriceImpact] = useMemo(
    () =>
      routeIsSyncing || !isClassicTrade(trade) || showWrap
        ? [undefined, undefined]
        : [
            computeFiatValuePriceImpact(fiatValueTradeInput.data, fiatValueTradeOutput.data),
            computeFiatValuePriceImpact(fiatValueTradeInput.data, preTaxFiatValueTradeOutput.data),
          ],
    [fiatValueTradeInput, fiatValueTradeOutput, preTaxFiatValueTradeOutput, routeIsSyncing, trade, showWrap],
  )

  const { onSwitchTokens, onCurrencySelection, onUserInput } = useSwapActionHandlers()
  const onPoolSelect = useSelectActiveSmartPool()
  const dependentField: Field = independentField === Field.INPUT ? Field.OUTPUT : Field.INPUT

  const handleTypeInput = useCallback(
    (value: string) => {
      onUserInput(Field.INPUT, value)
      maybeLogFirstSwapAction(trace)
    },
    [onUserInput, trace],
  )
  const handleTypeOutput = useCallback(
    (value: string) => {
      onUserInput(Field.OUTPUT, value)
      maybeLogFirstSwapAction(trace)
    },
    [onUserInput, trace],
  )

  const navigate = useNavigate()
  const swapIsUnsupported = useIsSwapUnsupported(currencies[Field.INPUT], currencies[Field.OUTPUT])
  const isLandingPage = useIsLandingPage()

  const navigateToSwapWithParams = useCallback(() => {
    const serializedSwapState = serializeSwapStateToURLParameters({
      inputCurrency: currencyState.inputCurrency,
      outputCurrency: currencyState.outputCurrency,
      typedValue: swapState.typedValue,
      independentField: swapState.independentField,
      chainId: supportedChainId ?? UniverseChainId.Mainnet,
    })
    navigate('/swap' + serializedSwapState)
  }, [
    currencyState.inputCurrency,
    currencyState.outputCurrency,
    navigate,
    supportedChainId,
    swapState.independentField,
    swapState.typedValue,
  ])

  // reset if they close warning without tokens in params
  const handleDismissTokenWarning = useCallback(() => {
    setDismissTokenWarning(true)
    navigate('/swap')
  }, [navigate])

  // modal and loading
  const [{ showConfirm, tradeToConfirm, swapError, swapResult }, setSwapFormState] = useState<{
    showConfirm: boolean
    tradeToConfirm?: InterfaceTrade
    swapError?: Error
    swapResult?: SwapResult
  }>({
    showConfirm: false,
    tradeToConfirm: undefined,
    swapError: undefined,
    swapResult: undefined,
  })
  const previousConnectedChainId = usePrevious(connectedChainId)
  const previousPrefilledState = usePrevious(prefilledState)
  useEffect(() => {
    if (multichainUXEnabled) {
      return
    }
    const chainChanged = previousConnectedChainId && previousConnectedChainId !== connectedChainId
    const prefilledInputChanged =
      previousPrefilledState?.inputCurrency &&
      !prefilledState.inputCurrency?.equals(previousPrefilledState.inputCurrency)
    const prefilledOutputChanged =
      previousPrefilledState?.outputCurrency &&
      !prefilledState?.outputCurrency?.equals(previousPrefilledState.outputCurrency)

    if (chainChanged || prefilledInputChanged || prefilledOutputChanged) {
      // reset local state
      setSwapFormState({
        tradeToConfirm: undefined,
        swapError: undefined,
        showConfirm: false,
        swapResult: undefined,
      })
    }
  }, [
    connectedChainId,
    multichainUXEnabled,
    prefilledState.inputCurrency,
    prefilledState?.outputCurrency,
    previousConnectedChainId,
    previousPrefilledState,
  ])

  const { formatCurrencyAmount } = useFormatter()
  const formattedAmounts = useMemo(
    () => ({
      [independentField]: typedValue,
      [dependentField]: showWrap
        ? parsedAmounts[independentField]?.toExact() ?? ''
        : formatCurrencyAmount({
            amount: parsedAmounts[dependentField],
            type: NumberType.SwapTradeAmount,
            placeholder: '',
          }),
    }),
    [dependentField, formatCurrencyAmount, independentField, parsedAmounts, showWrap, typedValue],
  )

  const selectChain = useSelectChain()

  const userHasSpecifiedInputOutput = Boolean(
    currencies[Field.INPUT] && currencies[Field.OUTPUT] && parsedAmounts[independentField]?.greaterThan(JSBI.BigInt(0)),
  )

  //const maximumAmountIn = useMaxAmountIn(trade, allowedSlippage)
  // we skip allowance check entirely for pools
  //const isPool = true
  //const allowance = usePermit2Allowance(
  //  maximumAmountIn ??
  //    (parsedAmounts[Field.INPUT]?.currency.isToken
  //      ? (parsedAmounts[Field.INPUT] as CurrencyAmount<Token>)
  //      : undefined),
  //  isSupportedChain(chainId) ? UNIVERSAL_ROUTER_ADDRESS(chainId) : undefined,
  //  trade?.fillType,
  //  isPool
  //)
  const allowance = { state: AllowanceState.ALLOWED, permitSignature: undefined }

  const maxInputAmount: CurrencyAmount<Currency> | undefined = useMemo(
    () => maxAmountSpend(currencyBalances[Field.INPUT]),
    [currencyBalances],
  )
  const showMaxButton = Boolean(maxInputAmount?.greaterThan(0) && !parsedAmounts[Field.INPUT]?.equalTo(maxInputAmount))
  const swapFiatValues = useMemo(() => {
    return { amountIn: fiatValueTradeInput.data, amountOut: fiatValueTradeOutput.data, feeUsd: outputFeeFiatValue }
  }, [fiatValueTradeInput.data, fiatValueTradeOutput.data, outputFeeFiatValue])

  // the callback to execute the swap
  const swapCallback = useSwapCallback(
    trade,
    swapFiatValues,
    allowedSlippage,
    allowance.state === AllowanceState.ALLOWED ? allowance.permitSignature : undefined,
    smartPoolAddress ?? undefined,
  )

  const handleContinueToReview = useCallback(() => {
    setSwapFormState({
      tradeToConfirm: trade,
      swapError: undefined,
      showConfirm: true,
      swapResult: undefined,
    })
  }, [trade])

  const clearSwapState = useCallback(() => {
    setSwapFormState((currentState) => ({
      ...currentState,
      swapError: undefined,
      swapResult: undefined,
    }))
  }, [])

  const handleSwap = useCallback(() => {
    if (!swapCallback) {
      return
    }
    if (preTaxStablecoinPriceImpact && !confirmPriceImpactWithoutFee(preTaxStablecoinPriceImpact)) {
      return
    }
    swapCallback()
      .then((result) => {
        setSwapFormState((currentState) => ({
          ...currentState,
          swapError: undefined,
          swapResult: result,
        }))
      })
      .catch((error) => {
        setSwapFormState((currentState) => ({
          ...currentState,
          swapError: error,
          swapResult: undefined,
        }))
      })
  }, [swapCallback, preTaxStablecoinPriceImpact])

  const handleOnWrap = useCallback(async () => {
    if (!onWrap) {
      return
    }

    try {
      if (supportedChainId && connectedChainId !== chainId) {
        const correctChain = await selectChain(supportedChainId)
        if (!correctChain) {
          return
        }
      }
      const txHash = await onWrap()
      setSwapFormState((currentState) => ({
        ...currentState,
        swapError: undefined,
        txHash,
      }))
      onUserInput(Field.INPUT, '')
    } catch (error) {
      if (!didUserReject(error)) {
        sendAnalyticsEvent(SwapEventName.SWAP_ERROR, {
          wrapType,
          input: currencies[Field.INPUT],
          output: currencies[Field.OUTPUT],
        })
      } else {
        logger.debug('SwapForm', 'handleOnWrap', 'rejected wrap/unwrap')
      }
      setSwapFormState((currentState) => ({
        ...currentState,
        swapError: error,
        txHash: undefined,
      }))
    }
  }, [currencies, onUserInput, onWrap, wrapType, connectedChainId, chainId, supportedChainId, selectChain])

  // warnings on the greater of fiat value price impact and execution price impact
  const { priceImpactSeverity, largerPriceImpact } = useMemo(() => {
    if (!isClassicTrade(trade)) {
      return { priceImpactSeverity: 0, largerPriceImpact: undefined }
    }

    const marketPriceImpact = trade?.priceImpact ? computeRealizedPriceImpact(trade) : undefined
    const largerPriceImpact = largerPercentValue(marketPriceImpact, preTaxStablecoinPriceImpact)
    return {
      priceImpactSeverity: warningSeverity(largerPriceImpact),
      largerPriceImpact: largerPriceImpact?.multiply(-1.0),
    }
  }, [preTaxStablecoinPriceImpact, trade])

  const handleConfirmDismiss = useCallback(() => {
    setSwapFormState((currentState) => ({ ...currentState, showConfirm: false }))
    // If swap had a temporary router preference override, we want to reset it
    setSwapState((state) => ({ ...state, routerPreferenceOverride: undefined }))
    // If there was a swap, we want to clear the input
    if (swapResult) {
      onUserInput(Field.INPUT, '')
    }
  }, [onUserInput, setSwapState, swapResult])

  const handleAcceptChanges = useCallback(() => {
    setSwapFormState((currentState) => ({ ...currentState, tradeToConfirm: trade }))
  }, [trade])

  const handleInputSelect = useCallback(
    (inputCurrency: Currency) => {
      onCurrencySelection(Field.INPUT, inputCurrency)
      onCurrencyChange?.({
        inputCurrency,
        outputCurrency: currencyState.outputCurrency,
      })
      maybeLogFirstSwapAction(trace)
    },
    [onCurrencyChange, onCurrencySelection, currencyState, trace],
  )
  const inputCurrencyNumericalInputRef = useRef<HTMLInputElement>(null)

  const handleMaxInput = useCallback(() => {
    maxInputAmount && onUserInput(Field.INPUT, maxInputAmount.toExact())
    maybeLogFirstSwapAction(trace)
  }, [maxInputAmount, onUserInput, trace])

  const handleOutputSelect = useCallback(
    (outputCurrency: Currency) => {
      onCurrencySelection(Field.OUTPUT, outputCurrency)
      onCurrencyChange?.({
        inputCurrency: currencyState.inputCurrency,
        outputCurrency,
      })
      maybeLogFirstSwapAction(trace)
    },
    [onCurrencyChange, onCurrencySelection, currencyState, trace],
  )

  const showPriceImpactWarning = isClassicTrade(trade) && largerPriceImpact && priceImpactSeverity > 3

  const prevTrade = usePrevious(trade)
  useEffect(() => {
    if (!trade || prevTrade === trade) {
      return
    } // no new swap quote to log

    sendAnalyticsEvent(SwapEventName.SWAP_QUOTE_RECEIVED, {
      ...formatSwapQuoteReceivedEventProperties(trade, allowedSlippage, swapQuoteLatency, outputFeeFiatValue),
      ...trace,
    })
  }, [prevTrade, trade, trace, allowedSlippage, swapQuoteLatency, outputFeeFiatValue])

  const showDetailsDropdown = Boolean(
    !isLandingPage && !showWrap && userHasSpecifiedInputOutput && (trade || routeIsLoading || routeIsSyncing),
  )

  const inputCurrency = currencies[Field.INPUT] ?? undefined

  const switchingChain = useAppSelector((state) => state.wallets.switchingChain)
  const targetChain = switchingChain ? switchingChain : undefined
  const switchingChainIsSupported = useIsSupportedChainId(targetChain)
  // @ts-ignore
  const isUsingBlockedExtension = window.ethereum?.['isPocketUniverseZ']

  const DISPLAY_POOLS_SEARCH_FILTERS: CurrencySearchFilters = {
    onlyDisplaySmartPools: true,
  }

  return (
    <>
      <TokenSafetyModal
        isOpen={urlTokensNotInDefault.length > 0 && !dismissTokenWarning}
        token0={urlTokensNotInDefault[0]}
        token1={urlTokensNotInDefault[1]}
        onContinue={handleConfirmTokenWarning}
        onCancel={handleDismissTokenWarning}
        showCancel={true}
      />
      <PoolSelect
        disabled={false}
        visible={true}
        selected={true}
        hideInput={false}
        className="operated-pool-select-button"
        onClick={() => {
          setModalOpen(true)
        }}
      >
        <Aligner>
          <RowFixed>
            {operatedPools && (
              <StyledTokenName className="pool-name-container" active={true}>
                {smartPoolName && smartPoolName.length > 3 ? smartPoolName : <Trans>Create your pool first</Trans>}
              </StyledTokenName>
            )}
          </RowFixed>
          <StyledDropDown selected={!!smartPoolAddress} />
        </Aligner>
      </PoolSelect>
      {trade && showConfirm && smartPool && (
        <ConfirmSwapModal
          trade={trade}
          priceImpact={largerPriceImpact}
          inputCurrency={inputCurrency}
          originalTrade={tradeToConfirm}
          onAcceptChanges={handleAcceptChanges}
          onCurrencySelection={onCurrencySelection}
          selectedPool={smartPool}
          swapResult={swapResult}
          allowedSlippage={allowedSlippage}
          clearSwapState={clearSwapState}
          onConfirm={handleSwap}
          //allowance={allowance}
          swapError={swapError}
          onDismiss={handleConfirmDismiss}
          onXV2RetryWithClassic={() => {
            // Keep swap parameters but re-quote X trade with classic API
            setSwapState((state) => ({
              ...state,
              routerPreferenceOverride: RouterPreference.API,
            }))
            handleContinueToReview()
          }}
          fiatValueInput={fiatValueTradeInput}
          fiatValueOutput={fiatValueTradeOutput}
        />
      )}
      {operatedPools && smartPoolName && smartPool && (
        <CurrencySearchModal
          isOpen={modalOpen}
          onDismiss={handleDismissSearch}
          onCurrencySelect={onPoolSelect}
          selectedCurrency={smartPool}
          operatedPools={operatedPools}
          showCurrencyAmount={false}
          hideChainSwitch={true}
          currencySearchFilters={DISPLAY_POOLS_SEARCH_FILTERS}
        />
      )}
      {showPriceImpactModal && showPriceImpactWarning && (
        <PriceImpactModal
          priceImpact={largerPriceImpact}
          onDismiss={() => setShowPriceImpactModal(false)}
          onContinue={() => {
            setShowPriceImpactModal(false)
            handleContinueToReview()
          }}
        />
      )}
      <div style={{ display: 'relative' }}>
        <SwapSection>
          <Trace section={InterfaceSectionName.CURRENCY_INPUT_PANEL}>
            <SwapCurrencyInputPanel
              label={<Trans i18nKey="common.sell.label" />}
              disabled={disableTokenInputs}
              value={formattedAmounts[Field.INPUT]}
              showMaxButton={showMaxButton}
              currency={currencies[Field.INPUT] ?? null}
              currencyField={CurrencyField.INPUT}
              onUserInput={handleTypeInput}
              onMax={handleMaxInput}
              fiatValue={showFiatValueInput ? fiatValueInput : undefined}
              onCurrencySelect={handleInputSelect}
              otherCurrency={currencies[Field.OUTPUT]}
              currencySearchFilters={SWAP_FORM_CURRENCY_SEARCH_FILTERS}
              id={InterfaceSectionName.CURRENCY_INPUT_PANEL}
              loading={independentField === Field.OUTPUT && routeIsSyncing}
              initialCurrencyLoading={initialCurrencyLoading}
              ref={inputCurrencyNumericalInputRef}
            />
          </Trace>
        </SwapSection>
        <ArrowWrapper clickable={!!supportedChainId}>
          <Trace
            logPress
            eventOnTrigger={SwapEventName.SWAP_TOKENS_REVERSED}
            element={InterfaceElementName.SWAP_TOKENS_REVERSE_ARROW_BUTTON}
          >
            <ArrowContainer
              data-testid="swap-currency-button"
              onClick={() => {
                if (disableTokenInputs) {
                  return
                }
                onSwitchTokens({
                  newOutputHasTax: inputTokenHasTax,
                  previouslyEstimatedOutput: formattedAmounts[dependentField],
                })
                maybeLogFirstSwapAction(trace)
              }}
              color={theme.neutral1}
            >
              <ArrowDown size="16" color={theme.neutral1} />
            </ArrowContainer>
          </Trace>
        </ArrowWrapper>
      </div>
      <AutoColumn gap="12px">
        <div>
          <OutputSwapSection>
            <Trace section={InterfaceSectionName.CURRENCY_OUTPUT_PANEL}>
              <SwapCurrencyInputPanel
                value={formattedAmounts[Field.OUTPUT]}
                disabled={disableTokenInputs}
                onUserInput={handleTypeOutput}
                label={<Trans i18nKey="common.buy.label" />}
                showMaxButton={false}
                hideBalance={false}
                fiatValue={showFiatValueOutput ? fiatValueOutput : undefined}
                priceImpact={stablecoinPriceImpact}
                currency={currencies[Field.OUTPUT] ?? null}
                currencyField={CurrencyField.OUTPUT}
                onCurrencySelect={handleOutputSelect}
                otherCurrency={currencies[Field.INPUT]}
                currencySearchFilters={SWAP_FORM_CURRENCY_SEARCH_FILTERS}
                id={InterfaceSectionName.CURRENCY_OUTPUT_PANEL}
                loading={independentField === Field.INPUT && routeIsSyncing}
                numericalInputSettings={{
                  // We disable numerical input here if the selected token has tax, since we cannot guarantee exact_outputs for FOT tokens
                  disabled: inputTokenHasTax || outputTokenHasTax,
                  // Focus the input currency panel if the user tries to type into the disabled output currency panel
                  onDisabledClick: () => inputCurrencyNumericalInputRef.current?.focus(),
                  disabledTooltipBody: (
                    <OutputTaxTooltipBody
                      currencySymbol={currencies[inputTokenHasTax ? Field.INPUT : Field.OUTPUT]?.symbol}
                    />
                  ),
                }}
              />
            </Trace>
          </OutputSwapSection>
        </div>

        <div>
          {isLandingPage ? (
            <ButtonPrimary
              $borderRadius="16px"
              onClick={() => navigateToSwapWithParams()}
              fontWeight={535}
              data-testid="wrap-button"
            >
              <Text variant="buttonLabel1" color="neutralContrast">
                <Trans i18nKey="common.getStarted" />
              </Text>
            </ButtonPrimary>
          ) : swapIsUnsupported ? (
            <ButtonPrimary $borderRadius="16px" disabled={true}>
              <ThemedText.DeprecatedMain mb="4px">
                <Trans i18nKey="common.unsupportedAsset_one" />
              </ThemedText.DeprecatedMain>
            </ButtonPrimary>
          ) : !multichainUXEnabled && switchingChain ? (
            <ButtonPrimary $borderRadius="16px" disabled={true}>
              <Trans
                i18nKey="common.connectingToChain"
                values={{
                  chainName: switchingChainIsSupported ? UNIVERSE_CHAIN_INFO[targetChain]?.label : '',
                }}
              />
            </ButtonPrimary>
          ) : isDisconnected ? (
            <Trace
              logPress
              eventOnTrigger={InterfaceEventName.CONNECT_WALLET_BUTTON_CLICKED}
              properties={{ received_swap_quote: getIsReviewableQuote(trade, tradeState, swapInputError) }}
              element={InterfaceElementName.CONNECT_WALLET_BUTTON}
            >
              <ButtonLight onClick={accountDrawer.open} fontWeight={535} $borderRadius="16px">
                <Trans i18nKey="common.connectWallet.button" />
              </ButtonLight>
            </Trace>
          ) : !multichainUXEnabled && initialChainId && initialChainId !== connectedChainId ? (
            <ButtonPrimary $borderRadius="16px" onClick={async () => await selectChain(initialChainId)}>
              <Trans
                i18nKey="common.connectToChain.button"
                values={{ chainName: initialChainId ? UNIVERSE_CHAIN_INFO[initialChainId].label : '' }}
              />
            </ButtonPrimary>
          ) : showWrap ? (
            <ButtonPrimary
              $borderRadius="16px"
              disabled={Boolean(wrapInputError)}
              onClick={handleOnWrap}
              fontWeight={535}
              data-testid="wrap-button"
            >
              {wrapInputError ? (
                <WrapErrorText wrapInputError={wrapInputError} />
              ) : wrapType === WrapType.Wrap ? (
                <Trans i18nKey="common.wrap.button" />
              ) : wrapType === WrapType.Unwrap ? (
                <Trans i18nKey="common.unwrap.button" />
              ) : null}
            </ButtonPrimary>
          ) : routeNotFound && userHasSpecifiedInputOutput && !routeIsLoading && !routeIsSyncing ? (
            <GrayCard style={{ textAlign: 'center' }}>
              <ThemedText.DeprecatedMain mb="4px">
                <Trans i18nKey="swap.form.insufficientLiquidity" />
              </ThemedText.DeprecatedMain>
            </GrayCard>
          ) : (
            <Trace logPress element={InterfaceElementName.SWAP_BUTTON}>
              <ButtonError
                onClick={() => {
                  showPriceImpactWarning ? setShowPriceImpactModal(true) : handleContinueToReview()
                }}
                id="swap-button"
                data-testid="swap-button"
                disabled={isUsingBlockedExtension || !getIsReviewableQuote(trade, tradeState, swapInputError)}
              >
                <Text fontSize={20} color="neutralContrast">
                  {swapInputError ?? <Trans i18nKey="common.swap" />}
                </Text>
              </ButtonError>
            </Trace>
          )}
          {showDetailsDropdown && (
            <SwapDetailsDropdown
              trade={trade}
              syncing={routeIsSyncing}
              loading={routeIsLoading}
              allowedSlippage={allowedSlippage}
              priceImpact={largerPriceImpact}
            />
          )}
          {isUsingBlockedExtension && <SwapNotice />}
        </div>
      </AutoColumn>
    </>
  )
}

function SwapNotice() {
  const theme = useTheme()
  return (
    <Row
      align="flex-start"
      gap="md"
      backgroundColor={theme.surface2}
      marginTop="12px"
      borderRadius="12px"
      padding="16px"
    >
      <Row width="auto" borderRadius="16px" backgroundColor={theme.critical2} padding="8px">
        <ErrorIcon />
      </Row>

      <Column flex="10" gap="sm">
        <ThemedText.SubHeader>Blocked Extension</ThemedText.SubHeader>
        <ThemedText.BodySecondary lineHeight="22px">
          <Trans
            i18nKey="swap.form.pocketUniverseExtension.warning"
            components={{
              termsLink: (
                <ExternalLink href="https://uniswap.org/terms-of-service">
                  <Trans i18nKey="common.termsOfService" />
                </ExternalLink>
              ),
            }}
          />
        </ThemedText.BodySecondary>
      </Column>
    </Row>
  )
}
