import { useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Button, Flex, Input, SegmentedControl, Text } from 'ui/src'
import { HL_MIN_ORDER_USD } from 'uniswap/src/features/chains/evm/info/hyperevm'
import { Modal } from 'uniswap/src/components/modals/Modal'
import { ModalName } from 'uniswap/src/features/telemetry/constants'
import { TransactionStatus } from 'uniswap/src/features/transactions/types/transactionDetails'
import { logger } from 'utilities/src/logger/logger'
import { LoadingView, SubmittedView } from '~/components/ModalViews'
import { HyperliquidPosition } from '~/pages/Portfolio/Perps/hyperliquid/hyperliquidApi'
import { useHyperliquidMeta } from '~/pages/Portfolio/Perps/hyperliquid/useHyperliquidAccount'
import {
  HyperliquidOrderAction,
  useHyperliquidOrderCallback,
} from '~/pages/Portfolio/Perps/hyperliquid/useHyperliquidOrderCallback'
import { onNumericInput } from '~/pages/Portfolio/Perps/gmx/gmxOpenPositionUtils'
import { useIsTransactionConfirmed, useTransaction } from '~/state/transactions/hooks'

const MODAL_TRANSITION_DURATION = 200

type OrderType = 'market' | 'limit'

interface HyperliquidOrderModalProps {
  isOpen: boolean
  action?: HyperliquidOrderAction
  position?: HyperliquidPosition
  poolAddress?: string
  onDismiss: () => void
}

function actionLabelKey(action: HyperliquidOrderAction | undefined): string | undefined {
  switch (action) {
    case 'increase':
      return 'perps.actions.increase'
    case 'decrease':
      return 'perps.actions.decrease'
    case 'close':
      return 'perps.actions.close'
    default:
      return undefined
  }
}

export function HyperliquidOrderModal({
  isOpen,
  action,
  position,
  poolAddress,
  onDismiss,
}: HyperliquidOrderModalProps): JSX.Element {
  const { t } = useTranslation()
  const [orderType, setOrderType] = useState<OrderType>('market')
  const [sizeUsd, setSizeUsd] = useState('')
  const [limitPrice, setLimitPrice] = useState('')

  const [hash, setHash] = useState<string | undefined>()
  const [attempting, setAttempting] = useState(false)
  const [errorReason, setErrorReason] = useState<string | undefined>()

  const transaction = useTransaction(hash)
  const confirmed = useIsTransactionConfirmed(hash)
  const transactionSuccess = transaction?.status === TransactionStatus.Success

  const { universe, isLoading: isLoadingMeta } = useHyperliquidMeta()
  const { sendHlOrder } = useHyperliquidOrderCallback(poolAddress)

  const isClose = action === 'close'
  const isBuy = position ? (isClose || action === 'decrease' ? position.side === 'short' : position.side === 'long') : false

  const inputErrorKey = useMemo(() => {
    if (!action || !position) {
      return undefined
    }
    if (!isClose) {
      const size = Number(sizeUsd)
      if (!sizeUsd || !Number.isFinite(size) || size <= 0) {
        return 'size'
      }
      if (size < HL_MIN_ORDER_USD) {
        return 'min-size'
      }
      if (action === 'decrease' && size > position.sizeUsd) {
        return 'size-exceeds'
      }
    }
    if (orderType === 'limit' && (!limitPrice || !(Number(limitPrice) > 0))) {
      return 'limit-price'
    }
    return undefined
  }, [action, isClose, limitPrice, orderType, position, sizeUsd])

  const inputErrorLabel = useMemo(() => {
    switch (inputErrorKey) {
      case 'size':
        return t('perps.errors.enterSize')
      case 'size-exceeds':
        return t('perps.errors.sizeExceeds')
      case 'min-size':
        return t('perps.hyperliquid.errors.minSize', { usd: HL_MIN_ORDER_USD })
      case 'limit-price':
        return t('perps.hyperliquid.errors.enterLimitPrice')
      default:
        return undefined
    }
  }, [inputErrorKey, t])

  const canSubmit = !inputErrorKey && !isLoadingMeta && !!position && !!poolAddress

  function wrappedOnDismiss() {
    onDismiss()
    setTimeout(() => {
      setHash(undefined)
      setErrorReason(undefined)
      setAttempting(false)
      setSizeUsd('')
      setLimitPrice('')
      setOrderType('market')
    }, MODAL_TRANSITION_DURATION)
  }

  async function onSubmit() {
    if (!action || !position || !canSubmit) {
      return
    }
    setAttempting(true)
    setErrorReason(undefined)

    const orderPromise = sendHlOrder({
      action,
      coin: position.coin,
      assetIndex: position.assetIndex,
      szDecimals: universe[position.assetIndex]?.szDecimals ?? 6,
      isBuy,
      sizeUsd: isClose ? position.sizeUsd : Number(sizeUsd),
      limitPrice: orderType === 'limit' ? Number(limitPrice) : undefined,
      reduceOnly: isClose || action === 'decrease',
      sizeRaw: isClose ? position.sizeRaw : undefined,
    })

    const txHash = await orderPromise.catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      setErrorReason(message)
      setAttempting(false)
      logger.info('HyperliquidOrderModal', 'onSubmit', message)
    })
    if (txHash) {
      setHash(txHash)
    }
  }

  const actionLabel = actionLabelKey(action)

  return (
    <Modal name={ModalName.DappRequest} isModalOpen={isOpen} isDismissible onClose={wrappedOnDismiss} maxHeight={560}>
      {!attempting && !hash ? (
        <Flex gap="$spacing16" padding="$spacing24">
          <Flex row justifyContent="space-between" alignItems="center">
            <Text variant="subheading1">
              {actionLabel ? t(actionLabel) : ''}
              {position ? ` — ${position.coin}` : ''}
            </Text>
            <Text cursor="pointer" onPress={wrappedOnDismiss} color="$neutral2">
              ✕
            </Text>
          </Flex>

          {position && (
            <Text variant="body3" color="$neutral2">
              {position.side === 'long' ? t('perps.side.long') : t('perps.side.short')} · Size $
              {position.sizeUsd.toFixed(2)} · {t('perps.table.leverage')} {position.leverage.value.toFixed(1)}x
            </Text>
          )}

          {!isClose && (
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

          {!isClose && (
            <Flex gap="$spacing4">
              <Text variant="body3" color="$neutral2">
                {t('perps.hyperliquid.order.orderType')}
              </Text>
              <SegmentedControl
                options={[
                  { value: 'market' as OrderType, display: <Trans i18nKey="perps.hyperliquid.order.market" /> },
                  { value: 'limit' as OrderType, display: <Trans i18nKey="perps.hyperliquid.order.limit" /> },
                ]}
                selectedOption={orderType}
                onSelectOption={setOrderType}
                fullWidth
              />
            </Flex>
          )}

          {orderType === 'limit' && !isClose && (
            <Flex gap="$spacing4">
              <Text variant="body3" color="$neutral2">
                {t('perps.hyperliquid.order.limitPrice')}
              </Text>
              <Input
                value={limitPrice}
                onChangeText={(value) => onNumericInput(value, setLimitPrice)}
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

          <Button
            variant="branded"
            size="medium"
            isDisabled={!canSubmit}
            onPress={() => {
              setErrorReason(undefined)
              onSubmit()
            }}
          >
            {isLoadingMeta ? (
              <Trans i18nKey="perps.modal.loading" />
            ) : (
              (inputErrorLabel ?? (actionLabel ? t(actionLabel) : ''))
            )}
          </Button>
        </Flex>
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
              <Trans i18nKey="perps.hyperliquid.modal.orderSubmitted" />
            </Text>
          )}
        </SubmittedView>
      ) : null}
    </Modal>
  )
}
