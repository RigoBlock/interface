import { useQueryClient } from '@tanstack/react-query'
import { ChartPeriod } from '@uniswap/client-data-api/dist/data/v1/api_pb'
import { GetPortfolioChartResponse } from '@uniswap/client-data-api/dist/data/v1/api_pb'
import { FeatureFlags, useFeatureFlag } from '@universe/gating'
import { memo, useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Flex, Separator, styled, useMedia } from 'ui/src'
import {
  getPortfolioHistoricalValueChartQuery,
  useGetPortfolioHistoricalValueChartQuery,
} from 'uniswap/src/data/rest/getPortfolioChart'
import { useActivityData } from 'uniswap/src/features/activity/hooks/useActivityData'
import { useEnabledChains } from 'uniswap/src/features/chains/hooks/useEnabledChains'
import { usePortfolioTotalValue } from 'uniswap/src/features/dataApi/balances/balancesRest'
import { usePortfolioChartBalanceMismatch } from 'uniswap/src/features/portfolio/usePortfolioChartBalanceMismatch'
import { ElementName, InterfacePageName, SectionName } from 'uniswap/src/features/telemetry/constants'
import { Trace } from 'uniswap/src/features/telemetry/Trace'
import { EmptyWalletCards } from '~/components/emptyWallet/EmptyWalletCards'
import { usePortfolioRoutes } from '~/pages/Portfolio/Header/hooks/usePortfolioRoutes'
import { useGmxPnlHistory } from '~/pages/Portfolio/hooks/useGmxPnlHistory'
import { useGmxPositions } from '~/pages/Portfolio/hooks/useGmxPositions'
import { usePortfolioAddresses } from '~/pages/Portfolio/hooks/usePortfolioAddresses'
import { useHyperEvmUsdcBalance } from '~/pages/Portfolio/Perps/hyperliquid/useHyperEvmUsdcBalance'
import { useHyperliquidAccount } from '~/pages/Portfolio/Perps/hyperliquid/useHyperliquidAccount'
import { useHyperliquidPortfolioHistory } from '~/pages/Portfolio/Perps/hyperliquid/useHyperliquidPortfolioHistory'
import { usePortfolioStakingContext } from '~/pages/Portfolio/PortfolioStakingContext'
import { OverviewActionTiles } from '~/pages/Portfolio/Overview/ActionTiles'
import { OVERVIEW_RIGHT_COLUMN_WIDTH } from '~/pages/Portfolio/Overview/constants'
import { useIsPortfolioZero } from '~/pages/Portfolio/Overview/hooks/useIsPortfolioZero'
import { OverviewStakingSection } from '~/pages/Portfolio/Overview/OverviewStakingSection'
import { PortfolioOverviewTables } from '~/pages/Portfolio/Overview/OverviewTables'
import { PortfolioChart } from '~/pages/Portfolio/Overview/PortfolioChart'
import { PortfolioPerformance } from '~/pages/Portfolio/Overview/PortfolioPerformance'
import { OverviewStatsTiles } from '~/pages/Portfolio/Overview/StatsTiles'
import { PortfolioTab } from '~/pages/Portfolio/types'
import { buildPortfolioUrl } from '~/pages/Portfolio/utils/portfolioUrls'
import { filterDefinedWalletAddresses } from '~/utils/filterDefinedWalletAddresses'

const ActionsAndStatsContainer = styled(Flex, {
  width: OVERVIEW_RIGHT_COLUMN_WIDTH,
  gap: '$spacing16',
  variants: {
    fullWidth: {
      true: {
        width: '100%',
      },
      false: {
        width: OVERVIEW_RIGHT_COLUMN_WIDTH,
      },
    },
  } as const,
})

export const PortfolioOverview = memo(function PortfolioOverview() {
  const media = useMedia()
  const navigate = useNavigate()
  const isFullWidth = media.xl
  const isProfitLossEnabled = useFeatureFlag(FeatureFlags.ProfitLoss)
  const { chainId, externalAddress, isExternalWallet } = usePortfolioRoutes()
  const portfolioAddresses = usePortfolioAddresses()

  // Staking totals are fetched once by PortfolioPageInner and shared across tabs so the value
  // doesn't reset when the animated tab content remounts.
  const { totalStakeUSD } = usePortfolioStakingContext()

  // GMX perp positions (Arbitrum): position equity (collateral + unrealized PnL) counts towards the total value
  const { totalNetValueUsd: gmxTotalNetValueUsd } = useGmxPositions(portfolioAddresses.evmAddress)

  // GMX daily cumulative PnL history (Subsquid indexer) — used to reconstruct historical account value
  const { history: gmxPnlHistory } = useGmxPnlHistory(portfolioAddresses.evmAddress)

  // Hyperliquid perp account value + Core spot USDC (temporary, in-transit balance) on HyperCore
  const { perpsAccountValueUsd: hyperliquidPerpsValue, spotUsdcBalanceUsd: hyperliquidSpotValue } =
    useHyperliquidAccount(portfolioAddresses.evmAddress)

  // Hyperliquid historical account value (HyperCore spot + perps) from the Hyperliquid
  // `portfolio` info endpoint
  const { history: hyperliquidHistory } = useHyperliquidPortfolioHistory(portfolioAddresses.evmAddress)

  // The vault's HyperEVM USDC balance (chain 999 is not indexed by the Uniswap data API)
  const { balanceUsd: hyperEvmUsdcValue } = useHyperEvmUsdcBalance(portfolioAddresses.evmAddress)

  const { chains: allChainIds } = useEnabledChains()

  const isPortfolioZero = useIsPortfolioZero()
  const queryClient = useQueryClient()

  const [selectedPeriod, setSelectedPeriod] = useState<ChartPeriod>(ChartPeriod.DAY)

  const filterChainIds = useMemo(() => (chainId ? [chainId] : allChainIds), [chainId, allChainIds])

  const handleNavigateToStaking = () => {
    navigate(
      buildPortfolioUrl({
        tab: PortfolioTab.Staking,
        chainId,
        externalAddress: externalAddress?.address,
      }),
    )
  }

  const { data: portfolioData } = usePortfolioTotalValue({
    evmAddress: portfolioAddresses.evmAddress,
    svmAddress: portfolioAddresses.svmAddress,
    chainIds: filterChainIds,
  })

  // Calculate total portfolio value including staking - memoize with stable dependencies
  const stakingValueStable = useMemo(() => {
    return totalStakeUSD ? parseFloat(totalStakeUSD.toExact()) : 0
  }, [totalStakeUSD])

  const portfolioTotalWithStaking = useMemo(() => {
    const baseValue = portfolioData?.balanceUSD || 0

    // Ensure both values are valid numbers to prevent BigNumber errors
    const safeBaseValue = isNaN(baseValue) ? 0 : baseValue
    const safeStakingValue = isNaN(stakingValueStable) ? 0 : stakingValueStable
    const safeGmxValue = isNaN(gmxTotalNetValueUsd) ? 0 : gmxTotalNetValueUsd
    const safeHyperliquidPerpsValue = isNaN(hyperliquidPerpsValue) ? 0 : hyperliquidPerpsValue
    const safeHyperliquidSpotValue = isNaN(hyperliquidSpotValue) ? 0 : hyperliquidSpotValue
    const safeHyperEvmUsdcValue = isNaN(hyperEvmUsdcValue) ? 0 : hyperEvmUsdcValue

    return (
      safeBaseValue +
      safeStakingValue +
      safeGmxValue +
      safeHyperliquidPerpsValue +
      safeHyperliquidSpotValue +
      safeHyperEvmUsdcValue
    )
  }, [
    portfolioData?.balanceUSD,
    stakingValueStable,
    gmxTotalNetValueUsd,
    hyperliquidPerpsValue,
    hyperliquidSpotValue,
    hyperEvmUsdcValue,
  ])

  // Fetch portfolio historical value chart data
  const {
    data: portfolioChartData,
    isPending: isChartPending,
    error: chartError,
  } = useGetPortfolioHistoricalValueChartQuery({
    input: {
      evmAddress: portfolioAddresses.evmAddress,
      svmAddress: portfolioAddresses.svmAddress,
      chainIds: filterChainIds,
      chartPeriod: selectedPeriod,
    },
    enabled: !!(portfolioAddresses.evmAddress || portfolioAddresses.svmAddress),
  })

  // Get the latest value from chart endpoint (last point in the array) for comparison
  const lastChartValue = useMemo(() => {
    if (!portfolioChartData?.points || portfolioChartData.points.length === 0) {
      return undefined
    }
    return portfolioChartData.points[portfolioChartData.points.length - 1]?.value
  }, [portfolioChartData])

  // The historical chart data only covers token balances. Staking and the HyperEVM USDC
  // balance have no history, so they are bootstrapped flatly at the current value. GMX has
  // daily cumulative-PnL history from the Subsquid indexer, so its historical account value
  // is derived as currentValue − (cumulativePnlNow − cumulativePnl(t)), forward-filled.
  // Hyperliquid has absolute account value history (spot + perps) from the Hyperliquid
  // `portfolio` endpoint; when that endpoint reports no history (all-zero buckets), the
  // current perps + Core spot value is bootstrapped flatly instead.
  const chartDataWithExtras = useMemo(() => {
    if (!portfolioChartData?.points) {
      return portfolioChartData
    }
    const stakingExtra = isNaN(stakingValueStable) ? 0 : stakingValueStable
    const hyperliquidFlatExtra = [hyperliquidSpotValue, hyperEvmUsdcValue].reduce(
      (acc, value) => acc + (isNaN(value) ? 0 : value),
      0,
    )
    const gmxExtra = isNaN(gmxTotalNetValueUsd) ? 0 : gmxTotalNetValueUsd
    const hlPerpsExtra = isNaN(hyperliquidPerpsValue) ? 0 : hyperliquidPerpsValue

    // Historical account value at a timestamp, given daily cumulative-PnL points. Before the
    // first point the first bucket's cumulative value applies; with no history (or no current
    // value) the flat current value is used.
    const valueFromPnlHistory = ({
      currentValue,
      history,
      timestampSec,
    }: {
      currentValue: number
      history: { timestamp: number; cumulativePnlUsd: number }[]
      timestampSec: number
    }): number => {
      if (history.length === 0 || currentValue === 0) {
        return currentValue
      }
      const cumulativeNow = history[history.length - 1]?.cumulativePnlUsd ?? 0
      let cumulativeAtT = history[0]?.cumulativePnlUsd ?? 0
      for (const point of history) {
        if (point.timestamp <= timestampSec) {
          cumulativeAtT = point.cumulativePnlUsd
        } else {
          break
        }
      }
      return currentValue - (cumulativeNow - cumulativeAtT)
    }

    // Historical account value at a timestamp from absolute portfolio-history points:
    // 0 before the first sample (the account did not exist yet), forward-filled after.
    const valueFromHlHistory = (history: { timestamp: number; valueUsd: number }[], timestampSec: number): number => {
      let value = 0
      for (const point of history) {
        if (point.timestamp <= timestampSec) {
          value = point.valueUsd
        } else {
          break
        }
      }
      return value
    }

    const hasExtras =
      stakingExtra !== 0 || hyperliquidFlatExtra !== 0 || gmxExtra !== 0 || hlPerpsExtra !== 0
    if (!hasExtras) {
      return portfolioChartData
    }
    return new GetPortfolioChartResponse({
      beginAt: portfolioChartData.beginAt,
      endAt: portfolioChartData.endAt,
      points: portfolioChartData.points.map((point) => {
        const timestampSec = Number(point.timestamp)
        const hlExtra =
          hyperliquidHistory.length > 0
            ? valueFromHlHistory(hyperliquidHistory, timestampSec)
            : // No portfolio history: spot is already in hyperliquidFlatExtra, add perps only.
              hlPerpsExtra
        return {
          timestamp: point.timestamp,
          value:
            point.value +
            stakingExtra +
            (hyperliquidHistory.length > 0 ? hyperEvmUsdcValue : hyperliquidFlatExtra) +
            valueFromPnlHistory({ currentValue: gmxExtra, history: gmxPnlHistory, timestampSec }) +
            hlExtra,
        }
      }),
    })
  }, [
    portfolioChartData,
    stakingValueStable,
    gmxTotalNetValueUsd,
    gmxPnlHistory,
    hyperliquidPerpsValue,
    hyperliquidHistory,
    hyperliquidSpotValue,
    hyperEvmUsdcValue,
  ])

  // Compare portfolio balance (EVM + Solana) with chart endpoint balance to detect spam-token divergence
  // Note: Use base portfolio data (without staking) for comparison since chart data doesn't include staking
  const { isTotalValueMatch } = usePortfolioChartBalanceMismatch({
    lastChartValue,
    portfolioTotalBalanceUSD: portfolioData?.balanceUSD,
  })

  // Prefetch chart data for a timeframe on hover so it's ready when the user clicks
  const handleHoverPeriod = useCallback(
    (period: ChartPeriod) => {
      if (!portfolioAddresses.evmAddress && !portfolioAddresses.svmAddress) {
        return
      }
      if (period === selectedPeriod) {
        return
      }
      const periodQuery = getPortfolioHistoricalValueChartQuery({
        input: {
          evmAddress: portfolioAddresses.evmAddress,
          svmAddress: portfolioAddresses.svmAddress,
          chainIds: filterChainIds,
          chartPeriod: period,
        },
      })
      const existingPeriodQueryState = queryClient.getQueryState(periodQuery.queryKey)
      if (existingPeriodQueryState?.fetchStatus === 'fetching' || existingPeriodQueryState?.status === 'success') {
        return
      }
      queryClient.prefetchQuery(periodQuery).catch(() => undefined)
    },
    [queryClient, portfolioAddresses.evmAddress, portfolioAddresses.svmAddress, filterChainIds, selectedPeriod],
  )

  // Fetch activity data once at the top level to share between useSwapsThisWeek and MiniActivityTable
  const activityData = useActivityData({
    evmOwner: portfolioAddresses.evmAddress,
    svmOwner: portfolioAddresses.svmAddress,
    ownerAddresses: filterDefinedWalletAddresses([portfolioAddresses.evmAddress, portfolioAddresses.svmAddress]),
    fiatOnRampParams: undefined,
    chainIds: chainId ? [chainId] : undefined,
    skip: isPortfolioZero,
  })

  return (
    <Trace logImpression page={InterfacePageName.PortfolioOverviewPage} properties={{ isExternal: isExternalWallet }}>
      <Flex gap="$spacing40" mb="$spacing40">
        <Flex row gap="$spacing40" $xl={{ flexDirection: 'column' }}>
          <Trace section={SectionName.PortfolioOverviewTab} element={ElementName.PortfolioChart}>
            <PortfolioChart
              portfolioTotalBalanceUSD={portfolioTotalWithStaking} // Shows current total with staking in header
              isPortfolioZero={isPortfolioZero}
              chartData={chartDataWithExtras} // Historical data with staking bootstrapped at current value; GMX reconstructed from indexed daily PnL; Hyperliquid from the portfolio API account value history (flat fallback)
              isPending={isChartPending}
              error={chartError}
              selectedPeriod={selectedPeriod}
              setSelectedPeriod={setSelectedPeriod}
              onHoverPeriod={handleHoverPeriod}
              isTotalValueMatch={isTotalValueMatch}
            />
          </Trace>
          {isPortfolioZero ? (
            <ActionsAndStatsContainer minHeight={120} fullWidth={isFullWidth}>
              <EmptyWalletCards
                buyElementName={ElementName.EmptyStateBuy}
                receiveElementName={ElementName.EmptyStateReceive}
                cexTransferElementName={ElementName.EmptyStateCEXTransfer}
                horizontalLayout={isFullWidth && !media.sm}
                growFullWidth={isFullWidth && !media.sm}
              />
            </ActionsAndStatsContainer>
          ) : (
            <Trace section={SectionName.PortfolioOverviewTab} element={ElementName.PortfolioActionTiles}>
              <ActionsAndStatsContainer fullWidth={isFullWidth}>
                <OverviewActionTiles />
                <OverviewStakingSection onViewStaking={handleNavigateToStaking} />
                {isProfitLossEnabled ? <PortfolioPerformance /> : <OverviewStatsTiles activityData={activityData} />}
              </ActionsAndStatsContainer>
            </Trace>
          )}
        </Flex>

        <Separator />

        {/* Mini tables section */}
        {!isPortfolioZero && (
          <Trace section={SectionName.PortfolioOverviewTab} element={ElementName.PortfolioOverviewTables}>
            <PortfolioOverviewTables
              activityData={activityData}
              chainId={chainId}
              portfolioAddresses={portfolioAddresses}
            />
          </Trace>
        )}
      </Flex>
    </Trace>
  )
})
