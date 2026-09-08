import { useEffect, useMemo, useState } from 'react'
import { Trans } from 'react-i18next'
import { Text } from 'ui/src'
import { HL_MIN_ORDER_USD } from 'uniswap/src/features/chains/evm/info/hyperevm'
import { Modal } from 'uniswap/src/components/modals/Modal'
import { ModalName } from 'uniswap/src/features/telemetry/constants'
import { TransactionStatus } from 'uniswap/src/features/transactions/types/transactionDetails'
import { logger } from 'utilities/src/logger/logger'
import { LoadingView, SubmittedView } from '~/components/ModalViews'
import {
  HyperliquidOpenInputError,
  HyperliquidOpenPositionForm,
} from '~/pages/Portfolio/Perps/hyperliquid/HyperliquidOpenPositionForm'
import { useHyperliquidMeta, useHyperliquidMids } from '~/pages/Portfolio/Perps/hyperliquid/useHyperliquidAccount'
import { useHyperliquidOrderCallback } from '~/pages/Portfolio/Perps/hyperliquid/useHyperliquidOrderCallback'
import { PositionSide } from '~/pages/Portfolio/Perps/gmx/gmxOpenPositionUtils'
import { useIsTransactionConfirmed, useTransaction } from '~/state/transactions/hooks'

const MODAL_TRANSITION_DURATION = 200

interface HyperliquidOpenPositionModalProps {
  isOpen: boolean
  poolAddress?: string
  /** Current Core perp account value, for the effective-leverage preview. */
  perpsAccountValueUsd: number
  onDismiss: () => void
}

export function HyperliquidOpenPositionModal({
  isOpen,
  poolAddress,
  perpsAccountValueUsd,
  onDismiss,
}: HyperliquidOpenPositionModalProps): JSX.Element {
  const [selectedCoin, setSelectedCoin] = useState('')
  const [side, setSide] = useState<PositionSide>('long')
  const [sizeUsd, setSizeUsd] = useState('')

  const [hash, setHash] = useState<string | undefined>()
  const [attempting, setAttempting] = useState(false)
  const [errorReason, setErrorReason] = useState<string | undefined>()

  const transaction = useTransaction(hash)
  const confirmed = useIsTransactionConfirmed(hash)
  const transactionSuccess = transaction?.status === TransactionStatus.Success

  const { universe, isLoading: isLoadingMeta } = useHyperliquidMeta()
  const { mids, isLoading: isLoadingMids } = useHyperliquidMids()
  const { sendHlOrder } = useHyperliquidOrderCallback(poolAddress)

  useEffect(() => {
    if (universe.length > 0 && !selectedCoin) {
      const defaultMarket =
        universe.find((asset) => asset.name === 'BTC') ?? universe.find((asset) => asset.name === 'ETH') ?? universe[0]
      setSelectedCoin(defaultMarket.name)
    }
  }, [universe, selectedCoin])

  const selectedAsset = useMemo(
    () => universe.find((asset) => asset.name === selectedCoin),
    [universe, selectedCoin],
  )
  const markPrice = useMemo(() => {
    const mid = Number(mids[selectedCoin])
    return Number.isFinite(mid) && mid > 0 ? mid : undefined
  }, [mids, selectedCoin])

  const inputError: HyperliquidOpenInputError = useMemo(() => {
    if (!selectedAsset) {
      return 'market'
    }
    const size = Number(sizeUsd)
    if (!sizeUsd || !Number.isFinite(size) || size <= 0) {
      return 'size'
    }
    if (size < HL_MIN_ORDER_USD) {
      return 'min-size'
    }
    if (!markPrice) {
      return 'price'
    }
    return undefined
  }, [markPrice, selectedAsset, sizeUsd])

  const canSubmit = !inputError && !isLoadingMeta && !isLoadingMids && !!poolAddress

  function wrappedOnDismiss() {
    onDismiss()
    setTimeout(() => {
      setHash(undefined)
      setErrorReason(undefined)
      setAttempting(false)
      setSizeUsd('')
    }, MODAL_TRANSITION_DURATION)
  }

  async function onSubmit() {
    if (!selectedAsset || !canSubmit) {
      return
    }

    setAttempting(true)
    setErrorReason(undefined)

    const orderPromise = sendHlOrder({
      action: 'open',
      coin: selectedAsset.name,
      assetIndex: universe.indexOf(selectedAsset),
      szDecimals: selectedAsset.szDecimals,
      isBuy: side === 'long',
      sizeUsd: Number(sizeUsd),
    })

    const txHash = await orderPromise.catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      setErrorReason(message)
      setAttempting(false)
      logger.info('HyperliquidOpenPositionModal', 'onSubmit', message)
    })

    if (txHash) {
      setHash(txHash)
    }
  }

  return (
    <Modal name={ModalName.DappRequest} isModalOpen={isOpen} isDismissible onClose={wrappedOnDismiss} maxHeight={640}>
      {!attempting && !hash && (
        <HyperliquidOpenPositionForm
          universe={universe}
          selectedCoin={selectedCoin}
          setSelectedCoin={setSelectedCoin}
          side={side}
          setSide={setSide}
          sizeUsd={sizeUsd}
          setSizeUsd={setSizeUsd}
          markPrice={markPrice}
          perpsAccountValueUsd={perpsAccountValueUsd}
          isLoadingPrices={isLoadingMids}
          errorReason={errorReason}
          inputError={inputError}
          canSubmit={canSubmit}
          onSubmit={onSubmit}
          onDismiss={wrappedOnDismiss}
        />
      )}
      {attempting && !hash && (
        <LoadingView onDismiss={wrappedOnDismiss}>
          <Text variant="body2" color="$neutral2" textAlign="center">
            <Trans i18nKey="perps.modal.confirmInWallet" />
          </Text>
        </LoadingView>
      )}
      {hash && (
        <SubmittedView onDismiss={wrappedOnDismiss} hash={hash} transactionSuccess={transactionSuccess}>
          {confirmed && transactionSuccess && (
            <Text variant="body2" color="$neutral2" textAlign="center">
              <Trans i18nKey="perps.hyperliquid.modal.orderSubmitted" />
            </Text>
          )}
        </SubmittedView>
      )}
    </Modal>
  )
}
