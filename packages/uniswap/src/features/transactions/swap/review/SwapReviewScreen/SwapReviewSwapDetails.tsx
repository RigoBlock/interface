import { memo, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Flex, Switch, Text } from 'ui/src'
import { InfoCircleFilled } from 'ui/src/components/icons/InfoCircleFilled'
import { zIndexes } from 'ui/src/theme'
import { WarningInfo } from 'uniswap/src/components/modals/WarningModal/WarningInfo'
import { ModalName } from 'uniswap/src/features/telemetry/constants'
import {
  useTransactionSettingsAutoSlippageToleranceStore,
  useTransactionSettingsStore,
} from 'uniswap/src/features/transactions/components/settings/stores/transactionSettingsStore/useTransactionSettingsStore'
import { SwapDetails } from 'uniswap/src/features/transactions/swap/review/SwapDetails/SwapDetails'
import { useSwapReviewCallbacksStore } from 'uniswap/src/features/transactions/swap/review/stores/swapReviewCallbacksStore/useSwapReviewCallbacksStore'
import { useSwapReviewTransactionStore } from 'uniswap/src/features/transactions/swap/review/stores/swapReviewTransactionStore/useSwapReviewTransactionStore'
import {
  useSwapReviewWarningStateActions,
  useSwapReviewWarningStore,
} from 'uniswap/src/features/transactions/swap/review/stores/swapReviewWarningStore/useSwapReviewWarningStore'
import { setBridgeSyncMode } from 'uniswap/src/features/transactions/swap/utils/bridgeSyncMode'
import { isBridge } from 'uniswap/src/features/transactions/swap/utils/routing'
import { isWebApp } from 'utilities/src/platform'

export const SwapReviewSwapDetails = memo(function SwapReviewSwapDetails(): JSX.Element | null {
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
      derivedSwapInfo={derivedSwapInfo}
      feeOnTransferProps={feeOnTransferProps}
      tokenWarningProps={tokenWarningProps}
      tokenWarningChecked={tokenWarningChecked}
      setTokenWarningChecked={setTokenWarningChecked}
      gasFee={gasFee}
      newTradeRequiresAcceptance={newTradeRequiresAcceptance}
      uniswapXGasBreakdown={uniswapXGasBreakdown}
      warning={reviewScreenWarning?.warning}
      txSimulationErrors={txSimulationErrors}
      includesDelegation={stableIncludesDelegation}
      additionalDetailsContent={bridgeSyncToggle}
      onAcceptTrade={onAcceptTrade}
      onShowWarning={onShowWarning}
    />
  )
})
