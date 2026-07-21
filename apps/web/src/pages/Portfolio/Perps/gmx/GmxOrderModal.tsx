import { useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Button, Flex, Input, SegmentedControl, Text } from 'ui/src'
import { Modal } from 'uniswap/src/components/modals/Modal'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { ModalName } from 'uniswap/src/features/telemetry/constants'
import { TransactionStatus } from 'uniswap/src/features/transactions/types/transactionDetails'
import { logger } from 'utilities/src/logger/logger'
import { LoadingView, SubmittedView } from '~/components/ModalViews'
import { useCurrency } from '~/hooks/Tokens'
import { GmxPosition } from '~/pages/Portfolio/hooks/useGmxPositions'
import { gmxOrderActionLabel } from '~/pages/Portfolio/Perps/gmx/GmxPositionActionsMenu'
import {
  GmxOrderAction,
  resolveCollateralDirection,
  useGmxOrderCallback,
} from '~/pages/Portfolio/Perps/gmx/useGmxOrderCallback'
import { useGmxTokenDecimals } from '~/pages/Portfolio/Perps/gmx/useGmxTokenDecimals'
import { useIsTransactionConfirmed, useTransaction } from '~/state/transactions/hooks'

const MODAL_TRANSITION_DURATION = 200

type CollateralDirection = 'increase' | 'decrease'

interface GmxOrderModalProps {
  isOpen: boolean
  action?: GmxOrderAction
  position?: GmxPosition
  poolAddress?: string
  indexToken?: string
  onDismiss: () => void
}

interface GmxOrderFormProps {
  action: GmxOrderAction | undefined
  actionLabel: string | undefined
  effectiveAction: GmxOrderAction | undefined
  collateralDirection: CollateralDirection
  setCollateralDirection: (direction: CollateralDirection) => void
  position: GmxPosition | undefined
  collateralSymbol: string | undefined
  indexToken: string | undefined
  collateralDecimals: number | undefined
  isLoadingDecimals: boolean
  isDecimalsError: boolean
  errorReason: string | undefined
  setErrorReason: (reason: string | undefined) => void
  onSubmit: (input: { sizeUsd: string; collateralAmount: string }) => void
  onDismiss: () => void
}

function formatCollateral({
  raw,
  decimals,
  symbol,
}: {
  raw: string | undefined
  decimals: number | undefined
  symbol: string | undefined
}): string | undefined {
  if (!raw || decimals === undefined) {
    return undefined
  }
  try {
    const amount = Number(raw) / 10 ** decimals
    return `${amount.toLocaleString('en-US', { maximumFractionDigits: 6 })}${symbol ? ` ${symbol}` : ''}`
  } catch {
    return undefined
  }
}

interface OrderInputValidationParams {
  effectiveAction: GmxOrderAction | undefined
  position: GmxPosition | undefined
  needsSize: boolean
  isCollateralOnlyAction: boolean
  sizeUsd: string
  collateralAmount: string
}

function useOrderInputValidation({
  effectiveAction,
  position,
  needsSize,
  isCollateralOnlyAction,
  sizeUsd,
  collateralAmount,
}: OrderInputValidationParams): 'size' | 'collateral' | 'size-exceeds' | undefined {
  return useMemo(() => {
    if (!effectiveAction || !position) {
      return undefined
    }
    if (needsSize && (!sizeUsd || isNaN(Number(sizeUsd)) || Number(sizeUsd) <= 0)) {
      return 'size'
    }
    if (
      isCollateralOnlyAction &&
      (!collateralAmount || isNaN(Number(collateralAmount)) || Number(collateralAmount) <= 0)
    ) {
      return 'collateral'
    }
    if (needsSize && Number(sizeUsd) > position.sizeUsd && effectiveAction === GmxOrderAction.DecreasePosition) {
      return 'size-exceeds'
    }
    return undefined
  }, [effectiveAction, position, needsSize, isCollateralOnlyAction, sizeUsd, collateralAmount])
}

function useOrderInputErrorLabel(inputErrorKey: 'size' | 'collateral' | 'size-exceeds' | undefined): JSX.Element | undefined {
  return useMemo(() => {
    switch (inputErrorKey) {
      case 'size':
        return <Trans i18nKey="perps.errors.enterSize" />
      case 'collateral':
        return <Trans i18nKey="perps.errors.enterCollateral" />
      case 'size-exceeds':
        return <Trans i18nKey="perps.errors.sizeExceeds" />
      default:
        return undefined
    }
  }, [inputErrorKey])
}

function onNumericInput(value: string, setter: (value: string) => void) {
  if (/^\d*\.?\d*$/.test(value)) {
    setter(value)
  }
}

function GmxOrderForm({
  action,
  actionLabel,
  effectiveAction,
  collateralDirection,
  setCollateralDirection,
  position,
  collateralSymbol,
  indexToken,
  collateralDecimals,
  isLoadingDecimals,
  isDecimalsError,
  errorReason,
  setErrorReason,
  onSubmit,
  onDismiss,
}: GmxOrderFormProps): JSX.Element {
  const { t } = useTranslation()
  const [sizeUsd, setSizeUsd] = useState('')
  const [collateralAmount, setCollateralAmount] = useState('')

  const resolvedAction = action === GmxOrderAction.DeltaCollateral ? effectiveAction : action

  const needsSize =
    resolvedAction === GmxOrderAction.IncreasePosition || resolvedAction === GmxOrderAction.DecreasePosition
  const isCollateralOnlyAction =
    resolvedAction === GmxOrderAction.IncreaseCollateral || resolvedAction === GmxOrderAction.DecreaseCollateral
  const needsCollateral =
    isCollateralOnlyAction ||
    resolvedAction === GmxOrderAction.IncreasePosition ||
    resolvedAction === GmxOrderAction.DecreasePosition

  const inputErrorKey = useOrderInputValidation({
    effectiveAction: resolvedAction,
    position,
    needsSize,
    isCollateralOnlyAction,
    sizeUsd,
    collateralAmount,
  })
  const inputErrorLabel = useOrderInputErrorLabel(inputErrorKey)
  const currentCollateralString = useMemo(
    () =>
      formatCollateral({
        raw: position?.collateralAmountRaw,
        decimals: collateralDecimals,
        symbol: collateralSymbol,
      }),
    [position?.collateralAmountRaw, collateralDecimals, collateralSymbol],
  )

  const canSubmit = !inputErrorKey && !isLoadingDecimals && !!indexToken

  return (
    <Flex gap="$spacing16" padding="$spacing24">
      <Flex row justifyContent="space-between" alignItems="center">
        <Text variant="subheading1">
          {actionLabel}
          {position ? ` — ${position.indexName}` : ''}
        </Text>
        <Text cursor="pointer" onPress={onDismiss} color="$neutral2">
          ✕
        </Text>
      </Flex>

      {position && (
        <Flex gap="$spacing4">
          <Text variant="body3" color="$neutral2">
            {position.isLong ? t('perps.side.long') : t('perps.side.short')} · Size ${position.sizeUsd.toFixed(2)} ·
            Leverage {position.leverage.toFixed(1)}x
          </Text>
          {isCollateralOnlyAction && currentCollateralString && (
            <Text variant="body3" color="$neutral2">
              {t('perps.modal.currentCollateral')}: {currentCollateralString}
            </Text>
          )}
        </Flex>
      )}

      {action === GmxOrderAction.DeltaCollateral && (
        <SegmentedControl
          options={[
            { value: 'increase' as CollateralDirection, display: <Trans i18nKey="perps.actions.increase" /> },
            { value: 'decrease' as CollateralDirection, display: <Trans i18nKey="perps.actions.decrease" /> },
          ]}
          selectedOption={collateralDirection}
          onSelectOption={setCollateralDirection}
          fullWidth
        />
      )}

      {needsSize && (
        <Flex gap="$spacing4">
          <Text variant="body3" color="$neutral2">
            {t('perps.modal.sizeUsd')}
          </Text>
          <Input
            value={sizeUsd}
            onChangeText={(value) => onNumericInput(value, setSizeUsd)}
            placeholder="0.0"
            inputMode="decimal"
            height={44}
            backgroundColor="$surface2"
            borderColor="$surface3"
          />
        </Flex>
      )}
      {needsCollateral && (
        <Flex gap="$spacing4">
          <Text variant="body3" color="$neutral2">
            {t('perps.modal.collateralAmount')}
            {collateralSymbol ? ` (${collateralSymbol})` : ''}
          </Text>
          <Input
            value={collateralAmount}
            onChangeText={(value) => onNumericInput(value, setCollateralAmount)}
            placeholder="0.0"
            inputMode="decimal"
            height={44}
            backgroundColor="$surface2"
            borderColor="$surface3"
          />
        </Flex>
      )}

      {errorReason && (
        <Text variant="body3" color="$statusCritical">
          {errorReason}
        </Text>
      )}
      {isDecimalsError && (
        <Text variant="body3" color="$statusCritical">
          {t('perps.errors.decimalsUnavailable')}
        </Text>
      )}

      <Button
        variant="branded"
        size="medium"
        isDisabled={!canSubmit}
        onPress={() => {
          setErrorReason(undefined)
          onSubmit({ sizeUsd, collateralAmount })
        }}
      >
        {isLoadingDecimals ? (
          <Trans i18nKey="perps.modal.loading" />
        ) : !indexToken ? (
          <Trans i18nKey="perps.errors.marketMetadataUnavailable" />
        ) : (
          (inputErrorLabel ?? actionLabel)
        )}
      </Button>
    </Flex>
  )
}

export function GmxOrderModal({
  isOpen,
  action,
  position,
  poolAddress,
  indexToken,
  onDismiss,
}: GmxOrderModalProps): JSX.Element {
  const { t } = useTranslation()
  const collateralCurrency = useCurrency({
    address: position?.collateralTokenAddress,
    chainId: UniverseChainId.ArbitrumOne,
  })
  const collateralSymbol = collateralCurrency?.symbol

  const [collateralDirection, setCollateralDirection] = useState<CollateralDirection>('increase')
  const [hash, setHash] = useState<string | undefined>()
  const [attempting, setAttempting] = useState(false)
  const [errorReason, setErrorReason] = useState<string | undefined>()

  const transaction = useTransaction(hash)
  const confirmed = useIsTransactionConfirmed(hash)
  const transactionSuccess = transaction?.status === TransactionStatus.Success

  const effectiveAction = action ? resolveCollateralDirection(action, collateralDirection) : undefined

  const {
    indexDecimals,
    collateralDecimals,
    isLoading: isLoadingDecimals,
    isError: isDecimalsError,
  } = useGmxTokenDecimals({
    indexToken,
    collateralToken: position?.collateralTokenAddress,
    enabled: isOpen && !!position && !!indexToken,
  })

  const { sendGmxOrder } = useGmxOrderCallback(poolAddress)

  function wrappedOnDismiss() {
    onDismiss()
    setTimeout(() => {
      setHash(undefined)
      setErrorReason(undefined)
      setAttempting(false)
      setCollateralDirection('increase')
    }, MODAL_TRANSITION_DURATION)
  }

  async function onSubmit({ sizeUsd, collateralAmount }: { sizeUsd: string; collateralAmount: string }) {
    if (!effectiveAction || !position) {
      return
    }
    if (!indexToken) {
      setErrorReason(t('perps.errors.marketMetadataUnavailable'))
      setAttempting(false)
      return
    }
    if (indexDecimals === undefined || collateralDecimals === undefined) {
      setErrorReason(t('perps.errors.decimalsLoading'))
      setAttempting(false)
      return
    }
    setAttempting(true)
    const txHash = await sendGmxOrder({
      action: effectiveAction,
      position,
      input: { sizeUsd, collateralAmount },
      indexDecimals,
      collateralDecimals,
    })?.catch((error: unknown) => {
      setErrorReason(error instanceof Error ? error.message : String(error))
      setAttempting(false)
      logger.info('GmxOrderModal', 'onSubmit', error instanceof Error ? error.message : String(error))
    })
    if (txHash) {
      setHash(txHash)
    }
  }

  const actionLabel = action ? gmxOrderActionLabel(action) : undefined

  return (
    <Modal name={ModalName.DappRequest} isModalOpen={isOpen} isDismissible onClose={wrappedOnDismiss} maxHeight={480}>
      {!attempting && !hash ? (
        <GmxOrderForm
          action={action}
          actionLabel={actionLabel}
          effectiveAction={effectiveAction}
          collateralDirection={collateralDirection}
          setCollateralDirection={setCollateralDirection}
          position={position}
          collateralSymbol={collateralSymbol}
          indexToken={indexToken}
          collateralDecimals={collateralDecimals}
          isLoadingDecimals={isLoadingDecimals}
          isDecimalsError={isDecimalsError}
          errorReason={errorReason}
          setErrorReason={setErrorReason}
          onSubmit={onSubmit}
          onDismiss={wrappedOnDismiss}
        />
      ) : attempting && !hash ? (
        <LoadingView onDismiss={wrappedOnDismiss}>
          <Text variant="body2" color="$neutral2" textAlign="center">
            <Trans i18nKey="perps.modal.confirmInWallet" />
          </Text>
        </LoadingView>
      ) : hash ? (
        <SubmittedView onDismiss={wrappedOnDismiss} hash={hash} transactionSuccess={transactionSuccess}>
          {confirmed && transactionSuccess && (
            <Text variant="body2" color="$neutral2" textAlign="center">
              <Trans i18nKey="perps.modal.orderSubmitted" />
            </Text>
          )}
        </SubmittedView>
      ) : null}
    </Modal>
  )
}
