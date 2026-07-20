import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Flex, Text } from 'ui/src'
import { InterfacePageName } from 'uniswap/src/features/telemetry/constants'
import Trace from 'uniswap/src/features/telemetry/Trace'
import { areAddressesEqual } from 'uniswap/src/utils/addresses'
import Loader from '~/components/Icons/LoadingSpinner'
import { ChainLogo } from '~/components/Logo/ChainLogo'
import { useAccount } from '~/hooks/useAccount'
import { useSmartPoolFromAddress } from '~/hooks/useSmartPools'
import { GMX_CHAIN_ID, GmxPosition, useGmxPositions } from '~/pages/Portfolio/hooks/useGmxPositions'
import { usePortfolioAddresses } from '~/pages/Portfolio/hooks/usePortfolioAddresses'
import { GmxOrderModal } from '~/pages/Portfolio/Perps/gmx/GmxOrderModal'
import { GmxPositionActionsMenu } from '~/pages/Portfolio/Perps/gmx/GmxPositionActionsMenu'
import { useGmxMarkets } from '~/pages/Portfolio/Perps/gmx/useGmxMarkets'
import { GmxOrderAction } from '~/pages/Portfolio/Perps/gmx/useGmxOrderCallback'

const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

function formatUsd(value: number): string {
  return usdFormatter.format(value)
}

function formatSignedUsd(value: number): string {
  const formatted = formatUsd(Math.abs(value))
  if (value > 0) {
    return `+${formatted}`
  }
  return value < 0 ? `-${formatted}` : formatted
}

function formatPrice(value?: number): string {
  if (value === undefined) {
    return '—'
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(value)
}

type PnlColor = '$neutral1' | '$statusSuccess' | '$statusCritical'

function pnlColor(value: number): PnlColor {
  if (value > 0) {
    return '$statusSuccess'
  }
  return value < 0 ? '$statusCritical' : '$neutral1'
}

// Shared fixed column widths so header and data cells always stay aligned
const COLUMN = {
  market: { width: 180 },
  side: { width: 64 },
  size: { width: 100 },
  netValue: { width: 100 },
  leverage: { width: 72 },
  entry: { width: 100 },
  mark: { width: 100 },
  liq: { width: 100 },
  pnl: { width: 140 },
  actions: { width: 48 },
} as const

const TABLE_MIN_WIDTH = 1100

function HeaderCell({ label, alignLeft }: { label: React.ReactNode; alignLeft?: boolean }): JSX.Element {
  return (
    <Text variant="body4" color="$neutral2" textAlign={alignLeft ? 'left' : 'right'} numberOfLines={1}>
      {label}
    </Text>
  )
}

function CellText({ children, color = '$neutral1' }: { children: React.ReactNode; color?: PnlColor }): JSX.Element {
  return (
    <Text variant="body3" color={color} textAlign="right" numberOfLines={1}>
      {children}
    </Text>
  )
}

function PositionRow({
  position,
  isOperator,
  onAction,
}: {
  position: GmxPosition
  isOperator: boolean
  onAction: (position: GmxPosition, action: GmxOrderAction) => void
}): JSX.Element {
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
          {position.indexName}
        </Text>
        <Text variant="body4" color="$neutral2" numberOfLines={1}>
          {position.poolName}
        </Text>
      </Flex>
      <Flex {...COLUMN.side} flexShrink={0} alignItems="flex-end">
        <Text variant="body3" fontWeight="600" color={position.isLong ? '$statusSuccess' : '$statusCritical'}>
          {position.isLong ? <Trans>Long</Trans> : <Trans>Short</Trans>}
        </Text>
      </Flex>
      <Flex {...COLUMN.size} flexShrink={0} alignItems="flex-end">
        <CellText>{formatUsd(position.sizeUsd)}</CellText>
      </Flex>
      <Flex {...COLUMN.netValue} flexShrink={0} alignItems="flex-end">
        <CellText>{formatUsd(position.netValueUsd)}</CellText>
      </Flex>
      <Flex {...COLUMN.leverage} flexShrink={0} alignItems="flex-end">
        <CellText>{position.leverage.toFixed(1)}x</CellText>
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
        <CellText color={pnlColor(position.unrealizedPnlUsd)}>
          {formatSignedUsd(position.unrealizedPnlUsd)} ({position.unrealizedPnlPercent.toFixed(1)}%)
        </CellText>
      </Flex>
      <Flex {...COLUMN.actions} flexShrink={0} alignItems="center" justifyContent="center">
        {isOperator && <GmxPositionActionsMenu onSelect={(action) => onAction(position, action)} />}
      </Flex>
    </Flex>
  )
}

export function PortfolioPerps(): JSX.Element {
  const { t } = useTranslation()
  const account = useAccount()
  const { evmAddress } = usePortfolioAddresses()
  const { positions, totalNetValueUsd, totalUnrealizedPnlUsd, isLoading, isError } = useGmxPositions(evmAddress)

  // Order actions are only available to the pool operator (the adapter rejects anyone else)
  const poolStorage = useSmartPoolFromAddress(evmAddress, GMX_CHAIN_ID)
  const poolOwner = poolStorage?.poolInitParams.owner
  const isOperator =
    !!account.address &&
    !!poolOwner &&
    areAddressesEqual({
      addressInput1: { address: account.address, chainId: GMX_CHAIN_ID },
      addressInput2: { address: poolOwner, chainId: GMX_CHAIN_ID },
    })

  const { marketsByAddress } = useGmxMarkets()
  const [orderPosition, setOrderPosition] = useState<GmxPosition | undefined>()
  const [orderAction, setOrderAction] = useState<GmxOrderAction | undefined>()

  const onAction = (position: GmxPosition, action: GmxOrderAction) => {
    setOrderPosition(position)
    setOrderAction(action)
  }
  const onDismissOrderModal = () => {
    setOrderPosition(undefined)
    setOrderAction(undefined)
  }

  const orderMarket = orderPosition ? marketsByAddress.get(orderPosition.marketAddress.toLowerCase()) : undefined

  return (
    <Trace logImpression page={InterfacePageName.PortfolioPerpsPage}>
      <Flex gap="$spacing16">
        <Flex gap="$spacing4">
          <Flex row alignItems="center" gap="$spacing8">
            <Text variant="heading2">{t('portfolio.perps.title')}</Text>
            <ChainLogo chainId={GMX_CHAIN_ID} size={20} />
          </Flex>
          <Text variant="body3" color="$neutral2">
            {t('portfolio.perps.subtitle')}
          </Text>
        </Flex>

        <GmxOrderModal
          isOpen={!!orderPosition && !!orderAction}
          action={orderAction}
          position={orderPosition}
          poolAddress={evmAddress}
          indexToken={orderMarket?.indexToken}
          onDismiss={onDismissOrderModal}
        />

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
              <Trans>Could not load GMX positions</Trans>
            </Text>
            <Text variant="body3" color="$neutral2">
              <Trans>Please try again later.</Trans>
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
              <Trans>No open perp positions</Trans>
            </Text>
            <Text variant="body3" color="$neutral2">
              <Trans>Open GMX positions on Arbitrum will appear here.</Trans>
            </Text>
          </Flex>
        ) : (
          <>
            <Flex row gap="$spacing24" flexWrap="wrap">
              <Flex gap="$spacing4">
                <Text variant="body4" color="$neutral2">
                  <Trans>Total Net Value</Trans>
                </Text>
                <Text variant="subheading1">{formatUsd(totalNetValueUsd)}</Text>
              </Flex>
              <Flex gap="$spacing4">
                <Text variant="body4" color="$neutral2">
                  <Trans>Unrealized PnL</Trans>
                </Text>
                <Text variant="subheading1" color={pnlColor(totalUnrealizedPnlUsd)}>
                  {formatSignedUsd(totalUnrealizedPnlUsd)}
                </Text>
              </Flex>
            </Flex>

            <Flex width="100%" style={{ overflowX: 'auto' }}>
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
                    <HeaderCell alignLeft label={<Trans>Market</Trans>} />
                  </Flex>
                  <Flex {...COLUMN.side} flexShrink={0} alignItems="flex-end">
                    <HeaderCell label={<Trans>Side</Trans>} />
                  </Flex>
                  <Flex {...COLUMN.size} flexShrink={0} alignItems="flex-end">
                    <HeaderCell label={<Trans>Size</Trans>} />
                  </Flex>
                  <Flex {...COLUMN.netValue} flexShrink={0} alignItems="flex-end">
                    <HeaderCell label={<Trans>Net Value</Trans>} />
                  </Flex>
                  <Flex {...COLUMN.leverage} flexShrink={0} alignItems="flex-end">
                    <HeaderCell label={<Trans>Leverage</Trans>} />
                  </Flex>
                  <Flex {...COLUMN.entry} flexShrink={0} alignItems="flex-end">
                    <HeaderCell label={<Trans>Entry Price</Trans>} />
                  </Flex>
                  <Flex {...COLUMN.mark} flexShrink={0} alignItems="flex-end">
                    <HeaderCell label={<Trans>Mark Price</Trans>} />
                  </Flex>
                  <Flex {...COLUMN.liq} flexShrink={0} alignItems="flex-end">
                    <HeaderCell label={<Trans>Liq. Price</Trans>} />
                  </Flex>
                  <Flex {...COLUMN.pnl} flexShrink={0} alignItems="flex-end">
                    <HeaderCell label={<Trans>Unrealized PnL</Trans>} />
                  </Flex>
                  <Flex {...COLUMN.actions} flexShrink={0} />
                </Flex>
                {positions.map((position) => (
                  <PositionRow
                    key={`${position.marketAddress}-${position.collateralTokenAddress}-${position.isLong}`}
                    position={position}
                    isOperator={isOperator}
                    onAction={onAction}
                  />
                ))}
              </Flex>
            </Flex>
          </>
        )}
      </Flex>
    </Trace>
  )
}
