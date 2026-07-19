import { Trans, useTranslation } from 'react-i18next'
import { Flex, Text } from 'ui/src'
import { InterfacePageName } from 'uniswap/src/features/telemetry/constants'
import Trace from 'uniswap/src/features/telemetry/Trace'
import Loader from '~/components/Icons/LoadingSpinner'
import { ChainLogo } from '~/components/Logo/ChainLogo'
import { GMX_CHAIN_ID, GmxPosition, useGmxPositions } from '~/pages/Portfolio/hooks/useGmxPositions'
import { usePortfolioAddresses } from '~/pages/Portfolio/hooks/usePortfolioAddresses'

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
    minimumFractionDigits: 2,
    maximumFractionDigits: value > 0 && value < 1 ? 4 : 2,
  }).format(value)
}

type PnlColor = '$neutral1' | '$statusSuccess' | '$statusCritical'

function pnlColor(value: number): PnlColor {
  if (value > 0) {
    return '$statusSuccess'
  }
  return value < 0 ? '$statusCritical' : '$neutral1'
}

// Shared column sizing so header and data cells stay aligned
const COLUMN = {
  market: { flex: 2, minWidth: 140 },
  side: { width: 64, minWidth: 64 },
  size: { flex: 1, minWidth: 90 },
  netValue: { flex: 1, minWidth: 90 },
  leverage: { width: 72, minWidth: 72 },
  entry: { flex: 1, minWidth: 90 },
  mark: { flex: 1, minWidth: 90 },
  liq: { flex: 1, minWidth: 90 },
  pnl: { flex: 1.2, minWidth: 120 },
} as const

const TABLE_MIN_WIDTH = 960

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

function PositionRow({ position }: { position: GmxPosition }): JSX.Element {
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
      <Flex {...COLUMN.market} minWidth={0}>
        <Text variant="body3" fontWeight="600" numberOfLines={1}>
          {position.indexName}
        </Text>
        <Text variant="body4" color="$neutral2" numberOfLines={1}>
          {position.poolName}
        </Text>
      </Flex>
      <Flex {...COLUMN.side} alignItems="flex-end">
        <Text variant="body3" fontWeight="600" color={position.isLong ? '$statusSuccess' : '$statusCritical'}>
          {position.isLong ? <Trans>Long</Trans> : <Trans>Short</Trans>}
        </Text>
      </Flex>
      <Flex {...COLUMN.size} alignItems="flex-end">
        <CellText>{formatUsd(position.sizeUsd)}</CellText>
      </Flex>
      <Flex {...COLUMN.netValue} alignItems="flex-end">
        <CellText>{formatUsd(position.netValueUsd)}</CellText>
      </Flex>
      <Flex {...COLUMN.leverage} alignItems="flex-end">
        <CellText>{position.leverage.toFixed(1)}x</CellText>
      </Flex>
      <Flex {...COLUMN.entry} alignItems="flex-end">
        <CellText>{formatPrice(position.entryPrice)}</CellText>
      </Flex>
      <Flex {...COLUMN.mark} alignItems="flex-end">
        <CellText>{formatPrice(position.markPrice)}</CellText>
      </Flex>
      <Flex {...COLUMN.liq} alignItems="flex-end">
        <CellText>{formatPrice(position.liquidationPrice)}</CellText>
      </Flex>
      <Flex {...COLUMN.pnl} alignItems="flex-end">
        <CellText color={pnlColor(position.unrealizedPnlUsd)}>
          {formatSignedUsd(position.unrealizedPnlUsd)} ({position.unrealizedPnlPercent.toFixed(1)}%)
        </CellText>
      </Flex>
    </Flex>
  )
}

export function PortfolioPerps(): JSX.Element {
  const { t } = useTranslation()
  const { evmAddress } = usePortfolioAddresses()
  const { positions, totalNetValueUsd, totalUnrealizedPnlUsd, isLoading, isError } = useGmxPositions(evmAddress)

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
                  <Flex {...COLUMN.market}>
                    <HeaderCell alignLeft label={<Trans>Market</Trans>} />
                  </Flex>
                  <Flex {...COLUMN.side} alignItems="flex-end">
                    <HeaderCell label={<Trans>Side</Trans>} />
                  </Flex>
                  <Flex {...COLUMN.size} alignItems="flex-end">
                    <HeaderCell label={<Trans>Size</Trans>} />
                  </Flex>
                  <Flex {...COLUMN.netValue} alignItems="flex-end">
                    <HeaderCell label={<Trans>Net Value</Trans>} />
                  </Flex>
                  <Flex {...COLUMN.leverage} alignItems="flex-end">
                    <HeaderCell label={<Trans>Leverage</Trans>} />
                  </Flex>
                  <Flex {...COLUMN.entry} alignItems="flex-end">
                    <HeaderCell label={<Trans>Entry Price</Trans>} />
                  </Flex>
                  <Flex {...COLUMN.mark} alignItems="flex-end">
                    <HeaderCell label={<Trans>Mark Price</Trans>} />
                  </Flex>
                  <Flex {...COLUMN.liq} alignItems="flex-end">
                    <HeaderCell label={<Trans>Liq. Price</Trans>} />
                  </Flex>
                  <Flex {...COLUMN.pnl} alignItems="flex-end">
                    <HeaderCell label={<Trans>Unrealized PnL</Trans>} />
                  </Flex>
                </Flex>
                {positions.map((position) => (
                  <PositionRow
                    key={`${position.marketAddress}-${position.collateralTokenAddress}-${position.isLong}`}
                    position={position}
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
