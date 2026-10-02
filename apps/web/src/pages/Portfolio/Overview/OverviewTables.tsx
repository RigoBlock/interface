import { UniverseChainId, Platform } from '@universe/chains'
import { Flex, Text } from '@universe/mycelium'
import { memo } from 'react'
import { ActivityRenderData } from 'uniswap/src/features/activity/hooks/useActivityData'
import { useEnabledChains } from 'uniswap/src/features/chains/hooks/useEnabledChains'
import { useLocalizationContext } from 'uniswap/src/features/language/LocalizationContext'
import { NumberType } from 'utilities/src/format/types'
import { useConnectionStatus } from '~/features/accounts/store/hooks'
import { usePortfolioRoutes } from '~/pages/Portfolio/Header/hooks/usePortfolioRoutes'
import {
  MAX_ACTIVITY_ROWS,
  MAX_POOLS_ROWS,
  MAX_TOKENS_ROWS,
  OVERVIEW_RIGHT_COLUMN_WIDTH,
} from '~/pages/Portfolio/Overview/constants'
import { MiniActivityTable } from '~/pages/Portfolio/Overview/MiniActivityTable'
import { MiniPoolsTable } from '~/pages/Portfolio/Overview/MiniPoolsTable/MiniPoolsTable'
import { MiniTokensTable } from '~/pages/Portfolio/Overview/MiniTokensTable'
import { OpenLimitsTable } from '~/pages/Portfolio/Overview/OpenLimitsTable'
import { PortfolioEarnSection } from '~/pages/Portfolio/Overview/PortfolioEarnSection'
import { usePortfolioStakingContext } from '~/pages/Portfolio/PortfolioStakingContext'

interface PortfolioOverviewTablesProps {
  activityData: ActivityRenderData
  chainId: UniverseChainId | undefined
  portfolioAddresses: {
    evmAddress: Address | undefined
    svmAddress: Address | undefined
  }
}

export const PortfolioOverviewTables = memo(function PortfolioOverviewTables({
  activityData,
  chainId,
  portfolioAddresses,
}: PortfolioOverviewTablesProps) {
  const evmAddress = portfolioAddresses.evmAddress
  const { isConnected: isEvmConnected } = useConnectionStatus(Platform.EVM)
  const { isExternalWallet } = usePortfolioRoutes()
  const { isTestnetModeEnabled } = useEnabledChains()
  const showMiniPoolsTable = !!evmAddress
  const showOpenLimitsTable = !!evmAddress && (!chainId || chainId === UniverseChainId.Mainnet)
  // External and disconnected demo portfolios are visible but never actionable.
  const isEarnSectionReadOnly = isExternalWallet || !isEvmConnected
  const showEarnSection = !isTestnetModeEnabled && showOpenLimitsTable

  const { totalStakeAmount, totalStakeUSD, hasAnyStake } = usePortfolioStakingContext()
  const { convertFiatAmountFormatted, formatCurrencyAmount } = useLocalizationContext()

  return (
    <Flex
      row
      gap="$spacing40"
      width="100%"
      alignItems="flex-start"
      justifyContent="space-between"
      $md={{ padding: '$none' }}
      grow
      $xl={{ flexDirection: 'column-reverse' }}
    >
      <Flex gap="$spacing40" grow shrink $xl={{ width: '100%' }}>
        <MiniTokensTable maxTokens={MAX_TOKENS_ROWS} chainId={chainId} />
        {showMiniPoolsTable && <MiniPoolsTable account={evmAddress} maxPools={MAX_POOLS_ROWS} chainId={chainId} />}
      </Flex>
      <Flex width={OVERVIEW_RIGHT_COLUMN_WIDTH} gap="$spacing48" $xl={{ width: '100%' }}>
        {showEarnSection && <PortfolioEarnSection account={evmAddress} isReadOnly={isEarnSectionReadOnly} />}
        {showOpenLimitsTable && <OpenLimitsTable account={evmAddress} />}
        <MiniActivityTable maxActivities={MAX_ACTIVITY_ROWS} activityData={activityData} />
        {hasAnyStake && (
          <Flex gap="$spacing16" p="$spacing16" borderRadius="$rounded16" backgroundColor="$surface2">
            <Text variant="heading3" color="$neutral1">
              Staking
            </Text>
            <Flex gap="$spacing8">
              {totalStakeUSD && (
                <Flex>
                  <Text variant="body3" color="$neutral3">
                    Total Value
                  </Text>
                  <Text variant="heading3" color="$neutral1">
                    {convertFiatAmountFormatted(parseFloat(totalStakeUSD.toExact()), NumberType.FiatTokenPrice)}
                  </Text>
                </Flex>
              )}
              {totalStakeAmount && (
                <Flex>
                  <Text variant="body3" color="$neutral3">
                    Total GRG Staked
                  </Text>
                  <Text variant="body2" color="$neutral2">
                    {formatCurrencyAmount({
                      value: totalStakeAmount,
                      type: NumberType.TokenNonTx,
                      placeholder: '–',
                    })}
                  </Text>
                </Flex>
              )}
            </Flex>
          </Flex>
        )}
      </Flex>
    </Flex>
  )
})
