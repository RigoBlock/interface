import { useMemo, useState } from 'react'
import { Trans } from 'react-i18next'
import { Button, Flex, Input, Text } from 'ui/src'
import { Modal } from 'uniswap/src/components/modals/Modal'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { ModalName } from 'uniswap/src/features/telemetry/constants'
import { TransactionStatus } from 'uniswap/src/features/transactions/types/transactionDetails'
import { logger } from 'utilities/src/logger/logger'
import { LoadingView, SubmittedView } from '~/components/ModalViews'
import { useCurrency } from '~/hooks/Tokens'
import { GmxPosition } from '~/pages/Portfolio/hooks/useGmxPositions'
import { gmxOrderActionLabel } from '~/pages/Portfolio/Perps/gmx/GmxPositionActionsMenu'
import { GmxOrderAction, useGmxOrderCallback } from '~/pages/Portfolio/Perps/gmx/useGmxOrderCallback'
import { useGmxTokenDecimals } from '~/pages/Portfolio/Perps/gmx/useGmxTokenDecimals'
import { useIsTransactionConfirmed, useTransaction } from '~/state/transactions/hooks'

const MODAL_TRANSITION_DURATION = 200

interface GmxOrderModalProps {
  isOpen: boolean
  action?: GmxOrderAction
  position?: GmxPosition
  poolAddress?: string
  indexToken?: string
  onDismiss: () => void
}

export function GmxOrderModal({
  isOpen,
  action,
  position,
  poolAddress,
  indexToken,
  onDismiss,
}: GmxOrderModalProps): JSX.Element {
  const collateralCurrency = useCurrency({
    address: position?.collateralTokenAddress,
    chainId: UniverseChainId.ArbitrumOne,
  })
  const collateralSymbol = collateralCurrency?.symbol

  const [sizeUsd, setSizeUsd] = useState('')
  const [collateralAmount, setCollateralAmount] = useState('')
  const [hash, setHash] = useState<string | undefined>()
  const [attempting, setAttempting] = useState(false)
  const [errorReason, setErrorReason] = useState<string | undefined>()

  const transaction = useTransaction(hash)
  const confirmed = useIsTransactionConfirmed(hash)
  const transactionSuccess = transaction?.status === TransactionStatus.Success

  const {
    indexDecimals,
    collateralDecimals,
    isLoading: isLoadingDecimals,
  } = useGmxTokenDecimals({
    indexToken,
    collateralToken: position?.collateralTokenAddress,
    enabled: isOpen && !!position && !!indexToken,
  })

  const { sendGmxOrder } = useGmxOrderCallback(poolAddress)

  const needsSize = action === GmxOrderAction.IncreasePosition || action === GmxOrderAction.DecreasePosition
  // Collateral edits always need an amount; position size edits may leave collateral untouched (0)
  const isCollateralOnlyAction =
    action === GmxOrderAction.IncreaseCollateral || action === GmxOrderAction.DecreaseCollateral
  const needsCollateral =
    isCollateralOnlyAction || action === GmxOrderAction.IncreasePosition || action === GmxOrderAction.DecreasePosition

  const inputErrorKey = useMemo((): 'size' | 'collateral' | 'size-exceeds' | undefined => {
    if (!action || !position) {
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
    if (needsSize && Number(sizeUsd) > position.sizeUsd && action === GmxOrderAction.DecreasePosition) {
      return 'size-exceeds'
    }
    return undefined
  }, [action, position, needsSize, isCollateralOnlyAction, sizeUsd, collateralAmount])

  const inputErrorLabel = useMemo((): JSX.Element | undefined => {
    switch (inputErrorKey) {
      case 'size':
        return <Trans>Enter a size in USD</Trans>
      case 'collateral':
        return <Trans>Enter a collateral amount</Trans>
      case 'size-exceeds':
        return <Trans>Size exceeds the current position size</Trans>
      default:
        return undefined
    }
  }, [inputErrorKey])

  // Accept only digits and a single dot in amount inputs
  const onNumericInput = (value: string, setter: (value: string) => void) => {
    if (/^\d*\.?\d*$/.test(value)) {
      setter(value)
    }
  }

  // Current collateral formatted in collateral token units (for collateral edit actions)
  const currentCollateralString = useMemo(() => {
    if (!position?.collateralAmountRaw || collateralDecimals === undefined) {
      return undefined
    }
    try {
      const amount = Number(position.collateralAmountRaw) / 10 ** collateralDecimals
      return `${amount.toLocaleString('en-US', { maximumFractionDigits: 6 })}${collateralSymbol ? ` ${collateralSymbol}` : ''}`
    } catch {
      return undefined
    }
  }, [position?.collateralAmountRaw, collateralDecimals, collateralSymbol])

  // wrapper to reset state on modal close
  function wrappedOnDismiss() {
    onDismiss()
    setTimeout(() => {
      setHash(undefined)
      setErrorReason(undefined)
      setAttempting(false)
      setSizeUsd('')
      setCollateralAmount('')
    }, MODAL_TRANSITION_DURATION)
  }

  async function onSubmit() {
    if (!action || !position || indexDecimals === undefined || collateralDecimals === undefined) {
      return
    }
    setAttempting(true)
    const txHash = await sendGmxOrder({
      action,
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
        <Flex gap="$spacing16" padding="$spacing24">
          <Flex row justifyContent="space-between" alignItems="center">
            <Text variant="subheading1">
              {actionLabel}
              {position ? ` — ${position.indexName}` : ''}
            </Text>
            <Text cursor="pointer" onPress={wrappedOnDismiss} color="$neutral2">
              ✕
            </Text>
          </Flex>

          {position && (
            <Flex gap="$spacing4">
              <Text variant="body3" color="$neutral2">
                {position.isLong ? 'Long' : 'Short'} · Size ${position.sizeUsd.toFixed(2)} · Leverage{' '}
                {position.leverage.toFixed(1)}x
              </Text>
              {isCollateralOnlyAction && currentCollateralString && (
                <Text variant="body3" color="$neutral2">
                  <Trans>Current collateral</Trans>: {currentCollateralString}
                </Text>
              )}
            </Flex>
          )}

          {needsSize && (
            <Flex gap="$spacing4">
              <Text variant="body3" color="$neutral2">
                <Trans>Size (USD)</Trans>
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
                <Trans>Collateral amount</Trans>
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

          <Button variant="branded" size="medium" isDisabled={!!inputErrorKey || isLoadingDecimals} onPress={onSubmit}>
            {isLoadingDecimals ? <Trans>Loading…</Trans> : (inputErrorLabel ?? actionLabel)}
          </Button>
        </Flex>
      ) : attempting && !hash ? (
        <LoadingView onDismiss={wrappedOnDismiss}>
          <Text variant="body2" color="$neutral2" textAlign="center">
            <Trans>Confirm this transaction in your wallet</Trans>
          </Text>
        </LoadingView>
      ) : hash ? (
        <SubmittedView onDismiss={wrappedOnDismiss} hash={hash} transactionSuccess={transactionSuccess}>
          {confirmed && transactionSuccess && (
            <Text variant="body2" color="$neutral2" textAlign="center">
              <Trans>Order submitted. GMX keepers will execute it at the next oracle update.</Trans>
            </Text>
          )}
        </SubmittedView>
      ) : null}
    </Modal>
  )
}
