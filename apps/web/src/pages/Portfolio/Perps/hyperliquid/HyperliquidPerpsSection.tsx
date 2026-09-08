import { useCallback, useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Button, Flex, Text } from 'ui/src'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { areAddressesEqual } from 'uniswap/src/utils/addresses'
import Loader from '~/components/Icons/LoadingSpinner'
import { ChainLogo } from '~/components/Logo/ChainLogo'
import { useAccount } from '~/hooks/useAccount'
import { useSmartPoolFromAddress } from '~/hooks/useSmartPools'
import { usePortfolioAddresses } from '~/pages/Portfolio/hooks/usePortfolioAddresses'
import { HyperliquidPosition } from '~/pages/Portfolio/Perps/hyperliquid/hyperliquidApi'
import { HyperliquidBridgeModal } from '~/pages/Portfolio/Perps/hyperliquid/HyperliquidBridgeModal'
import { HyperliquidOpenPositionModal } from '~/pages/Portfolio/Perps/hyperliquid/HyperliquidOpenPositionModal'
import { HyperliquidOrderModal } from '~/pages/Portfolio/Perps/hyperliquid/HyperliquidOrderModal'
import { HyperliquidPositionActionsMenu } from '~/pages/Portfolio/Perps/hyperliquid/HyperliquidPositionActionsMenu'
import { HyperliquidTransferModal } from '~/pages/Portfolio/Perps/hyperliquid/HyperliquidTransferModal'
import { useHyperliquidAccount } from '~/pages/Portfolio/Perps/hyperliquid/useHyperliquidAccount'
import { HyperliquidOrderAction } from '~/pages/Portfolio/Perps/hyperliquid/useHyperliquidOrderCallback'
import {
  CellText,
  COLUMN,
  formatPrice,
  formatSignedUsd,
  formatUsd,
  HeaderCell,
  pnlColor,
  TABLE_MIN_WIDTH,
  TableScrollContainer,
} from '~/pages/Portfolio/Perps/perpsTableShared'

function PositionRow({
  position,
  isOperator,
  onAction,
}: {
  position: HyperliquidPosition
  isOperator: boolean
  onAction: (position: HyperliquidPosition, action: HyperliquidOrderAction) => void
}): JSX.Element {
  const isLong = position.side === 'long'
  return (
    <Flex
      row
      gap="$spacing12"
      alignItems="center"
      paddingVertical="$spacing12"
      borderBottomWidth={1}
      borderBottomColor="$surface3"
      minWidth={TABLE_MIN_WIDTH}
    >
      <Flex {...COLUMN.market} flexShrink={0} minWidth={0}>
        <Text variant="body3" fontWeight="600" numberOfLines={1}>
          {position.coin}
        </Text>
        <Text variant="body4" color="$neutral2" numberOfLines={1}>
          {position.leverage.type === 'cross' ? (
            <Trans i18nKey="perps.hyperliquid.leverage.cross" />
          ) : (
            <Trans i18nKey="perps.hyperliquid.leverage.isolated" />
          )}
        </Text>
      </Flex>
      <Flex {...COLUMN.side} flexShrink={0} alignItems="flex-end">
        <Text variant="body3" fontWeight="600" color={isLong ? '$statusSuccess' : '$statusCritical'}>
          {isLong ? <Trans i18nKey="perps.side.long" /> : <Trans i18nKey="perps.side.short" />}
        </Text>
      </Flex>
      <Flex {...COLUMN.size} flexShrink={0} alignItems="flex-end">
        <CellText>{formatUsd(position.sizeUsd)}</CellText>
      </Flex>
      <Flex {...COLUMN.netValue} flexShrink={0} alignItems="flex-end">
        <CellText>{formatUsd(position.positionValueUsd + position.unrealizedPnlUsd)}</CellText>
      </Flex>
      <Flex {...COLUMN.leverage} flexShrink={0} alignItems="flex-end">
        <CellText>{position.leverage.value.toFixed(1)}x</CellText>
      </Flex>
      <Flex {...COLUMN.entry} flexShrink={0} alignItems="flex-end">
        <CellText>{formatPrice(position.entryPrice)}</CellText>
      </Flex>
      <Flex {...COLUMN.mark} flexShrink={0} alignItems="flex-end">
        <CellText>{formatPrice(position.markPrice)}</CellText>
      </Flex>
      <Flex {...COLUMN.liq} flexShrink={0} alignItems="flex-end">
        <CellText>{formatPrice(position.liquidationPrice)}</CellText>
      </Flex>
      <Flex {...COLUMN.pnl} flexShrink={0} alignItems="flex-end">
        <CellText color={pnlColor(position.unrealizedPnlUsd)}>{formatSignedUsd(position.unrealizedPnlUsd)}</CellText>
      </Flex>
      <Flex {...COLUMN.actions} flexShrink={0} alignItems="center" justifyContent="center">
        {isOperator && <HyperliquidPositionActionsMenu onSelect={(action) => onAction(position, action)} />}
      </Flex>
    </Flex>
  )
}

export function HyperliquidPerpsSection(): JSX.Element {
  const { t } = useTranslation()
  const account = useAccount()
  const { evmAddress } = usePortfolioAddresses()
  const {
    perpsAccountValueUsd,
    spotUsdcBalanceUsd,
    withdrawableUsd,
    positions,
    isLoading,
    isError,
  } = useHyperliquidAccount(evmAddress)

  // Order actions are only available to the pool operator (the adapter rejects anyone else)
  const poolStorage = useSmartPoolFromAddress(evmAddress, UniverseChainId.HyperEvm)
  const poolOwner = poolStorage?.poolInitParams.owner
  const isOperator =
    !!account.address &&
    !!poolOwner &&
    areAddressesEqual({
      addressInput1: { address: account.address, chainId: UniverseChainId.HyperEvm },
      addressInput2: { address: poolOwner, chainId: UniverseChainId.HyperEvm },
    })

  const [orderPosition, setOrderPosition] = useState<HyperliquidPosition | undefined>()
  const [orderAction, setOrderAction] = useState<HyperliquidOrderAction | undefined>()
  const [isOpenPositionModalOpen, setIsOpenPositionModalOpen] = useState(false)
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false)
  const [isBridgeModalOpen, setIsBridgeModalOpen] = useState(false)

  const totalUnrealizedPnlUsd = useMemo(
    () => positions.reduce((acc, position) => acc + position.unrealizedPnlUsd, 0),
    [positions],
  )

  const onAction = useCallback((position: HyperliquidPosition, action: HyperliquidOrderAction) => {
    setOrderPosition(position)
    setOrderAction(action)
  }, [])
  const onDismissOrderModal = () => {
    setOrderPosition(undefined)
    setOrderAction(undefined)
  }

  return (
    <Flex gap="$spacing16">
      <Flex row alignItems="center" justifyContent="space-between" gap="$spacing8">
        <Flex row alignItems="center" gap="$spacing8">
          <Text variant="heading3">{t('perps.hyperliquid.title')}</Text>
          <ChainLogo chainId={UniverseChainId.HyperEvm} size={20} />
        </Flex>
        <Flex row gap="$spacing8">
          <Button variant="branded" size="small" fill={false} onPress={() => setIsBridgeModalOpen(true)}>
            <Trans i18nKey="perps.hyperliquid.bridge.button" />
          </Button>
          {isOperator && (
            <>
              <Button variant="branded" size="small" fill={false} onPress={() => setIsTransferModalOpen(true)}>
                <Trans i18nKey="perps.hyperliquid.actions.transfer" />
              </Button>
              <Button variant="branded" size="small" fill={false} onPress={() => setIsOpenPositionModalOpen(true)}>
                <Trans i18nKey="perps.open.button" />
              </Button>
            </>
          )}
        </Flex>
      </Flex>

      <HyperliquidOrderModal
        isOpen={!!orderPosition && !!orderAction}
        action={orderAction}
        position={orderPosition}
        poolAddress={evmAddress}
        onDismiss={onDismissOrderModal}
      />

      <HyperliquidOpenPositionModal
        isOpen={isOpenPositionModalOpen}
        poolAddress={evmAddress}
        perpsAccountValueUsd={perpsAccountValueUsd}
        onDismiss={() => setIsOpenPositionModalOpen(false)}
      />

      <HyperliquidTransferModal
        isOpen={isTransferModalOpen}
        poolAddress={evmAddress}
        perpsAccountValueUsd={perpsAccountValueUsd}
        spotUsdcBalanceUsd={spotUsdcBalanceUsd}
        withdrawableUsd={withdrawableUsd}
        onDismiss={() => setIsTransferModalOpen(false)}
      />

      <HyperliquidBridgeModal isOpen={isBridgeModalOpen} poolAddress={evmAddress} onDismiss={() => setIsBridgeModalOpen(false)} />

      {isLoading ? (
        <Flex centered padding="$spacing24">
          <Loader />
        </Flex>
      ) : isError ? (
        <Flex
          padding="$spacing24"
          centered
          gap="$gap8"
          borderRadius="$rounded12"
          borderColor="$surface3"
          borderWidth="$spacing1"
        >
          <Text variant="subheading2">
            <Trans i18nKey="perps.hyperliquid.error.title" />
          </Text>
          <Text variant="body3" color="$neutral2">
            <Trans i18nKey="perps.hyperliquid.error.subtitle" />
          </Text>
        </Flex>
      ) : positions.length === 0 ? (
        <Flex
          padding="$spacing24"
          centered
          gap="$gap8"
          borderRadius="$rounded12"
          borderColor="$surface3"
          borderWidth="$spacing1"
        >
          <Text variant="subheading2">
            <Trans i18nKey="perps.hyperliquid.empty.title" />
          </Text>
          <Text variant="body3" color="$neutral2">
            <Trans i18nKey="perps.hyperliquid.empty.subtitle" />
          </Text>
        </Flex>
      ) : (
        <>
          <Flex row gap="$spacing24" flexWrap="wrap">
            <Flex gap="$spacing4">
              <Text variant="body4" color="$neutral2">
                <Trans i18nKey="perps.hyperliquid.totals.accountValue" />
              </Text>
              <Text variant="subheading1">{formatUsd(perpsAccountValueUsd)}</Text>
            </Flex>
            <Flex gap="$spacing4">
              <Text variant="body4" color="$neutral2">
                <Trans i18nKey="perps.table.unrealizedPnl" />
              </Text>
              <Text variant="subheading1" color={pnlColor(totalUnrealizedPnlUsd)}>
                {formatSignedUsd(totalUnrealizedPnlUsd)}
              </Text>
            </Flex>
            <Flex gap="$spacing4">
              <Text variant="body4" color="$neutral2">
                <Trans i18nKey="perps.hyperliquid.totals.inTransit" />
              </Text>
              <Text variant="subheading1">{formatUsd(spotUsdcBalanceUsd)}</Text>
            </Flex>
          </Flex>

          <TableScrollContainer>
            <Flex minWidth={TABLE_MIN_WIDTH} width="100%">
              <Flex
                row
                gap="$spacing12"
                alignItems="center"
                paddingBottom="$spacing8"
                borderBottomWidth={1}
                borderBottomColor="$surface3"
              >
                <Flex {...COLUMN.market} flexShrink={0}>
                  <HeaderCell alignLeft label={<Trans i18nKey="perps.table.market" />} />
                </Flex>
                <Flex {...COLUMN.side} flexShrink={0} alignItems="flex-end">
                  <HeaderCell label={<Trans i18nKey="perps.table.side" />} />
                </Flex>
                <Flex {...COLUMN.size} flexShrink={0} alignItems="flex-end">
                  <HeaderCell label={<Trans i18nKey="perps.table.size" />} />
                </Flex>
                <Flex {...COLUMN.netValue} flexShrink={0} alignItems="flex-end">
                  <HeaderCell label={<Trans i18nKey="perps.table.netValue" />} />
                </Flex>
                <Flex {...COLUMN.leverage} flexShrink={0} alignItems="flex-end">
                  <HeaderCell label={<Trans i18nKey="perps.table.leverage" />} />
                </Flex>
                <Flex {...COLUMN.entry} flexShrink={0} alignItems="flex-end">
                  <HeaderCell label={<Trans i18nKey="perps.table.entryPrice" />} />
                </Flex>
                <Flex {...COLUMN.mark} flexShrink={0} alignItems="flex-end">
                  <HeaderCell label={<Trans i18nKey="perps.table.markPrice" />} />
                </Flex>
                <Flex {...COLUMN.liq} flexShrink={0} alignItems="flex-end">
                  <HeaderCell label={<Trans i18nKey="perps.table.liqPrice" />} />
                </Flex>
                <Flex {...COLUMN.pnl} flexShrink={0} alignItems="flex-end">
                  <HeaderCell label={<Trans i18nKey="perps.table.unrealizedPnl" />} />
                </Flex>
                <Flex {...COLUMN.actions} flexShrink={0} />
              </Flex>
              {positions.map((position) => (
                <PositionRow
                  key={`${position.coin}-${position.side}`}
                  position={position}
                  isOperator={isOperator}
                  onAction={onAction}
                />
              ))}
            </Flex>
          </TableScrollContainer>
        </>
      )}
    </Flex>
  )
}
