import { useEffect, useMemo, useState } from 'react'
import { Trans } from 'react-i18next'
import { Text } from 'ui/src'
import { Modal } from 'uniswap/src/components/modals/Modal'
import { ModalName } from 'uniswap/src/features/telemetry/constants'
import { TransactionStatus } from 'uniswap/src/features/transactions/types/transactionDetails'
import { logger } from 'utilities/src/logger/logger'
import { normalizeTokenAddressForCache } from 'uniswap/src/data/cache'
import { LoadingView, SubmittedView } from '~/components/ModalViews'
import { GmxPosition } from '~/pages/Portfolio/hooks/useGmxPositions'
import { GmxMarketInfo } from '~/pages/Portfolio/Perps/gmx/useGmxMarkets'
import { useGmxOpenPositionMarketData } from '~/pages/Portfolio/Perps/gmx/useGmxOpenPositionMarketData'
import { GmxOpenPositionForm } from '~/pages/Portfolio/Perps/gmx/GmxOpenPositionForm'
import { useGmxOrderCallback } from '~/pages/Portfolio/Perps/gmx/useGmxOrderCallback'
import {
  computeGmxHumanPrice,
  computeGmxMarkPriceRaw,
  findExistingPosition,
  findMarketByCollateral,
  getGmxCollateralOptionsForMarkets,
  getGmxMarketsByIndexName,
  PositionSide,
  validateOpenPositionInputs,
} from '~/pages/Portfolio/Perps/gmx/gmxOpenPositionUtils'
import { useIsTransactionConfirmed, useTransaction } from '~/state/transactions/hooks'

const MODAL_TRANSITION_DURATION = 200
const DEFAULT_INDEX_MARKET = 'ETH/USD'

interface GmxOpenPositionModalProps {
  isOpen: boolean
  poolAddress?: string
  markets: GmxMarketInfo[]
  positions: GmxPosition[]
  onDismiss: () => void
}

export function GmxOpenPositionModal({
  isOpen,
  poolAddress,
  markets,
  positions,
  onDismiss,
}: GmxOpenPositionModalProps): JSX.Element {
  const [selectedMarketIndexName, setSelectedMarketIndexName] = useState<string>('')
  const [isLong, setIsLong] = useState<PositionSide>('long')
  const [selectedCollateralToken, setSelectedCollateralToken] = useState<string>('')
  const [sizeUsd, setSizeUsd] = useState('')
  const [margin, setMargin] = useState('')

  const [hash, setHash] = useState<string | undefined>()
  const [attempting, setAttempting] = useState(false)
  const [errorReason, setErrorReason] = useState<string | undefined>()

  const transaction = useTransaction(hash)
  const confirmed = useIsTransactionConfirmed(hash)
  const transactionSuccess = transaction?.status === TransactionStatus.Success

  const { sendGmxOpenPosition } = useGmxOrderCallback(poolAddress)
  const { marketInfoByAddress, pricesByTokenAddress, tokensByAddress, isLoading, isError } =
    useGmxOpenPositionMarketData({ enabled: isOpen })

  const marketsByIndexName = useMemo(
    () => getGmxMarketsByIndexName(markets, tokensByAddress),
    [markets, tokensByAddress],
  )
  const marketIndexNames = useMemo(
    () => Array.from(marketsByIndexName.keys()),
    [marketsByIndexName],
  )

  useEffect(() => {
    if (marketIndexNames.length > 0 && !selectedMarketIndexName) {
      const defaultMarket =
        marketIndexNames.find((name) => name === DEFAULT_INDEX_MARKET) ?? marketIndexNames[0]
      setSelectedMarketIndexName(defaultMarket)
    }
  }, [marketIndexNames, selectedMarketIndexName])

  const marketsForSelectedIndex = useMemo(
    () => marketsByIndexName.get(selectedMarketIndexName) ?? [],
    [marketsByIndexName, selectedMarketIndexName],
  )
  const selectedMarket = useMemo(
    () => findMarketByCollateral(marketsForSelectedIndex, selectedCollateralToken),
    [marketsForSelectedIndex, selectedCollateralToken],
  )

  const collateralOptions = useMemo(
    () => getGmxCollateralOptionsForMarkets(marketsForSelectedIndex),
    [marketsForSelectedIndex],
  )

  useEffect(() => {
    if (collateralOptions.length === 0) {
      return
    }
    if (selectedCollateralToken && collateralOptions.includes(selectedCollateralToken)) {
      return
    }
    const first = collateralOptions[0] ?? ''
    const second = collateralOptions[1] ?? ''
    setSelectedCollateralToken(isLong === 'long' ? first : second || first)
  }, [collateralOptions, isLong, selectedCollateralToken])

  const indexToken = selectedMarket?.indexToken
  const indexTokenInfo = indexToken
    ? tokensByAddress.get(normalizeTokenAddressForCache(indexToken))
    : undefined
  const collateralTokenInfo = selectedCollateralToken
    ? tokensByAddress.get(normalizeTokenAddressForCache(selectedCollateralToken))
    : undefined

  const priceTicker = indexToken
    ? pricesByTokenAddress.get(normalizeTokenAddressForCache(indexToken))
    : undefined
  const markPriceRaw = useMemo(
    () => computeGmxMarkPriceRaw(priceTicker, indexTokenInfo),
    [priceTicker, indexTokenInfo],
  )

  const humanPrice = useMemo(
    () => computeGmxHumanPrice(priceTicker, indexTokenInfo),
    [priceTicker, indexTokenInfo],
  )

  const marketInfo = selectedMarket
    ? marketInfoByAddress.get(normalizeTokenAddressForCache(selectedMarket.marketToken))
    : undefined

  const existingPosition = useMemo(
    () => findExistingPosition({ isLong, market: selectedMarket, selectedCollateralToken, positions }),
    [isLong, selectedMarket, positions, selectedCollateralToken],
  )

  const fundingRate =
    isLong === 'long' ? marketInfo?.fundingRateLong : marketInfo?.fundingRateShort
  const borrowingRate =
    isLong === 'long' ? marketInfo?.borrowingRateLong : marketInfo?.borrowingRateShort

  const inputError = useMemo(
    () =>
      validateOpenPositionInputs({
        market: selectedMarket,
        selectedCollateralToken,
        sizeUsd,
        margin,
        markPriceRaw,
        indexTokenInfo,
        collateralTokenInfo,
      }),
    [
      collateralTokenInfo,
      indexTokenInfo,
      margin,
      markPriceRaw,
      selectedCollateralToken,
      selectedMarket,
      sizeUsd,
    ],
  )

  const canSubmit = !inputError && !isLoading && !isError && !!sendGmxOpenPosition

  function wrappedOnDismiss() {
    onDismiss()
    setTimeout(() => {
      setHash(undefined)
      setErrorReason(undefined)
      setAttempting(false)
      setSizeUsd('')
      setMargin('')
      setSelectedCollateralToken('')
    }, MODAL_TRANSITION_DURATION)
  }

  async function onSubmit() {
    if (!selectedMarket || !selectedCollateralToken || !markPriceRaw || !indexTokenInfo || !collateralTokenInfo) {
      return
    }

    setAttempting(true)
    setErrorReason(undefined)

    const orderPromise = sendGmxOpenPosition({
      marketAddress: selectedMarket.marketToken,
      collateralTokenAddress: selectedCollateralToken,
      isLong: isLong === 'long',
      sizeUsd,
      collateralAmount: margin,
      markPriceRaw,
      indexDecimals: indexTokenInfo.decimals,
      collateralDecimals: collateralTokenInfo.decimals,
    })
    if (!orderPromise) {
      setAttempting(false)
      return
    }

    const txHash = await orderPromise.catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      setErrorReason(message)
      setAttempting(false)
      logger.info('GmxOpenPositionModal', 'onSubmit', message)
    })

    if (txHash) {
      setHash(txHash)
    }
  }

  return (
    <Modal name={ModalName.DappRequest} isModalOpen={isOpen} isDismissible onClose={wrappedOnDismiss} maxHeight={640}>
      {!attempting && !hash && (
        <GmxOpenPositionForm
          marketIndexNames={marketIndexNames}
          selectedMarketIndexName={selectedMarketIndexName}
          setSelectedMarketIndexName={setSelectedMarketIndexName}
          collateralOptions={collateralOptions}
          isLong={isLong}
          setIsLong={setIsLong}
          selectedCollateralToken={selectedCollateralToken}
          setSelectedCollateralToken={setSelectedCollateralToken}
          sizeUsd={sizeUsd}
          setSizeUsd={setSizeUsd}
          margin={margin}
          setMargin={setMargin}
          tokensByAddress={tokensByAddress}
          humanPrice={humanPrice}
          isLoading={isLoading}
          fundingRate={fundingRate}
          borrowingRate={borrowingRate}
          existingPosition={existingPosition}
          collateralTokenInfo={collateralTokenInfo}
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
              <Trans i18nKey="perps.modal.orderSubmitted" />
            </Text>
          )}
        </SubmittedView>
      )}
    </Modal>
  )
}
