import type { GasFeeResult } from '@universe/api'
import { FeatureFlags, useFeatureFlag } from '@universe/gating'
import { memo, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Flex, Switch, Text } from 'ui/src'
import { InfoCircleFilled } from 'ui/src/components/icons/InfoCircleFilled'
import { zIndexes } from 'ui/src/theme'
import { WarningInfo } from 'uniswap/src/components/modals/WarningModal/WarningInfo'
import { QuoteRefreshErrorRow } from 'uniswap/src/features/earn/QuoteRefreshErrorRow'
import { useEnableCustomGasFeeEntry } from 'uniswap/src/features/gas/hooks/useEnableCustomGasFeeEntry'
import { useIsCustomGasFlowAvailable } from 'uniswap/src/features/gas/hooks/useIsCustomGasFlowAvailable'
import { ModalName } from 'uniswap/src/features/telemetry/constants'
import {
  useTransactionSettingsAutoSlippageToleranceStore,
  useTransactionSettingsStore,
} from 'uniswap/src/features/transactions/components/settings/stores/transactionSettingsStore/useTransactionSettingsStore'
import { useSwapReviewCallbacksStore } from 'uniswap/src/features/transactions/swap/review/stores/swapReviewCallbacksStore/useSwapReviewCallbacksStore'
import { useSwapReviewTransactionStore } from 'uniswap/src/features/transactions/swap/review/stores/swapReviewTransactionStore/useSwapReviewTransactionStore'
import {
  useSwapReviewWarningStateActions,
  useSwapReviewWarningStore,
} from 'uniswap/src/features/transactions/swap/review/stores/swapReviewWarningStore/useSwapReviewWarningStore'
import { SwapDetails } from 'uniswap/src/features/transactions/swap/review/SwapDetails/SwapDetails'
import { resolveSponsorshipInfo } from 'uniswap/src/features/transactions/swap/review/SwapReviewScreen/resolveSponsorshipInfo'
import { ReviewNetworkCostRowSlot } from 'uniswap/src/features/transactions/swap/review/SwapReviewScreen/ReviewNetworkCostRowSlot'
import { setBridgeSyncMode } from 'uniswap/src/features/transactions/swap/utils/bridgeSyncMode'
import { getEVMTxRequest, isBridge } from 'uniswap/src/features/transactions/swap/utils/routing'
import { CurrencyField } from 'uniswap/src/types/currency'
import { isWebApp } from 'utilities/src/platform'

const QUOTE_REFRESH_GAS_FEE: GasFeeResult = {
  value: undefined,
  displayValue: undefined,
  isLoading: true,
  error: null,
}

// A settled refresh error has no live quote to price gas against — show the placeholder, not a spinner.
const QUOTE_REFRESH_ERROR_GAS_FEE: GasFeeResult = {
  value: undefined,
  displayValue: undefined,
  isLoading: false,
  error: null,
}

export const SwapReviewSwapDetails = memo(function SwapReviewSwapDetails({
  isQuoteRefreshLoading = false,
  hasQuoteRefreshError = false,
}: {
  isQuoteRefreshLoading?: boolean
  hasQuoteRefreshError?: boolean
}): JSX.Element | null {
  const { t } = useTranslation()
  const {
    acceptedDerivedSwapInfo,
    derivedSwapInfo,
    feeOnTransferProps,
    tokenWarningProps,
    gasFee,
    newTradeRequiresAcceptance,
    uniswapXGasBreakdown,
    reviewScreenWarning,
    txSimulationErrors,
    swapTxContext,
    onAcceptTrade,
  } = useSwapReviewTransactionStore((s) => ({
    acceptedDerivedSwapInfo: s.acceptedDerivedSwapInfo,
    derivedSwapInfo: s.derivedSwapInfo,
    feeOnTransferProps: s.feeOnTransferProps,
    tokenWarningProps: s.tokenWarningProps,
    gasFee: s.gasFee,
    newTradeRequiresAcceptance: s.newTradeRequiresAcceptance,
    uniswapXGasBreakdown: s.uniswapXGasBreakdown,
    reviewScreenWarning: s.reviewScreenWarning,
    txSimulationErrors: s.txSimulationErrors,
    swapTxContext: s.swapTxContext,
    onAcceptTrade: s.onAcceptTrade,
  }))
  const tokenWarningChecked = useSwapReviewWarningStore((s) => s.tokenWarningChecked)
  const { setTokenWarningChecked } = useSwapReviewWarningStateActions()
  const onShowWarning = useSwapReviewCallbacksStore((s) => s.onShowWarning)
  const customSlippageTolerance = useTransactionSettingsStore((s) => s.customSlippageTolerance)
  const autoSlippageTolerance = useTransactionSettingsAutoSlippageToleranceStore((s) => s.autoSlippageTolerance)

  const [stableIncludesDelegation, setStableIncludesDelegation] = useState<boolean | undefined>(
    swapTxContext.includesDelegation,
  )

  useEffect(() => {
    if (swapTxContext.includesDelegation !== undefined) {
      setStableIncludesDelegation(swapTxContext.includesDelegation)
    }
  }, [swapTxContext.includesDelegation])

  const isGasFeeOverridesEnabled = useFeatureFlag(FeatureFlags.GasFeeOverrides)
  const enableCustomGasFeeEntry = useEnableCustomGasFeeEntry()
  const isCustomGasFlowAvailable = useIsCustomGasFlowAvailable()

  // Bridge sync mode toggle state (web-only, for RigoBlock smart pools)
  const [bridgeSyncEnabled, setBridgeSyncEnabled] = useState(false)

  // Check if this is a bridge transaction for a smart pool (RigoBlock)
  const isBridgeTrade = derivedSwapInfo.trade.trade && isBridge(derivedSwapInfo.trade.trade)
  const smartPoolAddress = derivedSwapInfo.smartPoolAddress
  const showBridgeSyncToggle = isWebApp && isBridgeTrade && smartPoolAddress

  // Update module-level state when toggle changes
  const handleBridgeSyncToggle = useCallback((enabled: boolean) => {
    setBridgeSyncEnabled(enabled)
    setBridgeSyncMode(enabled)
  }, [])

  // Reset sync mode when component unmounts or trade changes
  useEffect(() => {
    return () => {
      setBridgeSyncMode(false)
    }
  }, [])

  if (!acceptedDerivedSwapInfo) {
    return null
  }

  const inputChainId = acceptedDerivedSwapInfo.currencyAmounts[CurrencyField.INPUT]?.currency.chainId
  const displayGasFee = isQuoteRefreshLoading
    ? QUOTE_REFRESH_GAS_FEE
    : hasQuoteRefreshError
      ? QUOTE_REFRESH_ERROR_GAS_FEE
      : gasFee
  const displayDerivedSwapInfo =
    isQuoteRefreshLoading || hasQuoteRefreshError ? acceptedDerivedSwapInfo : derivedSwapInfo

  // Pull the primary EVM tx from the swapTxContext for the warning-state
  // derivation. Returns undefined for UniswapX / Jupiter, which is what we
  // want — those routings have no editable EVM gas.
  const txRequest = getEVMTxRequest(swapTxContext)
  const sponsorshipInfo = resolveSponsorshipInfo(swapTxContext)
  const sponsorMetadata = sponsorshipInfo?.sponsorMetadata

  const NetworkCostRowSlot =
    !sponsorMetadata &&
    isGasFeeOverridesEnabled &&
    isCustomGasFlowAvailable &&
    enableCustomGasFeeEntry &&
    inputChainId !== undefined ? (
      <ReviewNetworkCostRowSlot
        chainId={inputChainId}
        gasFee={displayGasFee}
        tx={txRequest}
        includesDelegation={stableIncludesDelegation}
      />
    ) : undefined

  // Bridge sync toggle component for RigoBlock smart pools
  const bridgeSyncToggle = showBridgeSyncToggle ? (
    <Flex row alignItems="center" justifyContent="space-between">
      <Flex row alignItems="center" gap="$spacing4">
        <Text color="$neutral2" variant="body3">
          {t('swap.bridge.syncMode')}
        </Text>
        <WarningInfo
          tooltipProps={{
            text: t('swap.bridge.syncMode.tooltip'),
            placement: 'top',
            maxWidth: 280,
          }}
          trigger={<InfoCircleFilled color="$neutral3" size="$icon.16" />}
          modalProps={{
            modalName: ModalName.SwapReview,
            zIndex: zIndexes.popover,
          }}
          analyticsTitle="Bridge Sync Mode"
        />
      </Flex>
      <Switch checked={bridgeSyncEnabled} variant="branded" onCheckedChange={handleBridgeSyncToggle} />
    </Flex>
  ) : null

  return (
    <SwapDetails
      acceptedDerivedSwapInfo={acceptedDerivedSwapInfo}
      autoSlippageTolerance={autoSlippageTolerance}
      customSlippageTolerance={customSlippageTolerance}
      derivedSwapInfo={displayDerivedSwapInfo}
      feeOnTransferProps={feeOnTransferProps}
      tokenWarningProps={tokenWarningProps}
      tokenWarningChecked={tokenWarningChecked}
      setTokenWarningChecked={setTokenWarningChecked}
      gasFee={displayGasFee}
      newTradeRequiresAcceptance={newTradeRequiresAcceptance}
      uniswapXGasBreakdown={uniswapXGasBreakdown}
      warning={reviewScreenWarning?.warning}
      txSimulationErrors={txSimulationErrors}
      includesDelegation={stableIncludesDelegation}
      additionalDetailsContent={bridgeSyncToggle}
      BannerSlot={hasQuoteRefreshError ? <QuoteRefreshErrorRow /> : undefined}
      NetworkCostRowSlot={NetworkCostRowSlot}
      sponsorshipInfo={sponsorshipInfo}
      onAcceptTrade={onAcceptTrade}
      onShowWarning={onShowWarning}
    />
  )
})
