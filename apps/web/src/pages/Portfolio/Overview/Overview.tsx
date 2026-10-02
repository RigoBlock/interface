import { useQueryClient } from '@tanstack/react-query'
import { ChartPeriod, WalletBalanceCategory } from '@uniswap/client-data-api/dist/data/v1/api_pb'
import { FeatureFlags, useFeatureFlag } from '@universe/gating'
import { Flex, Separator, useMedia } from '@universe/mycelium'
import { styled } from '@universe/mycelium/styled'
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  getPortfolioHistoricalValueChartQuery,
  useGetPortfolioHistoricalValueChartQuery,
} from 'uniswap/src/data/apiClients/dataApiService/balances/getPortfolioChart'
import {
  getUnavailableCategories,
  useWalletBalancesIncludeCategories,
} from 'uniswap/src/data/apiClients/dataApiService/balances/getWalletBalances/getWalletBalances'
import { useActivityData } from 'uniswap/src/features/activity/hooks/useActivityData'
import { useEnabledChains } from 'uniswap/src/features/chains/hooks/useEnabledChains'
import {
  usePortfolioBalanceBreakdown,
  usePortfolioTotalValue,
} from 'uniswap/src/features/dataApi/balances/balancesRest'
import { useRestPortfolioValueModifier } from 'uniswap/src/features/dataApi/balances/useRestPortfolioValueModifier'
import { usePortfolioChartBalanceMismatch } from 'uniswap/src/features/portfolio/usePortfolioChartBalanceMismatch'
import { ElementName, InterfacePageName, SectionName } from 'uniswap/src/features/telemetry/constants'
import { Trace } from 'uniswap/src/features/telemetry/Trace'
import { EmptyWalletCards } from '~/components/emptyWallet/EmptyWalletCards'
import { usePortfolioRoutes } from '~/pages/Portfolio/Header/hooks/usePortfolioRoutes'
import { useGmxPnlHistory } from '~/pages/Portfolio/hooks/useGmxPnlHistory'
import { useGmxPositions } from '~/pages/Portfolio/hooks/useGmxPositions'
import { useGmxValueHistory } from '~/pages/Portfolio/hooks/useGmxValueHistory'
import { usePortfolioAddresses } from '~/pages/Portfolio/hooks/usePortfolioAddresses'
import { OverviewActionTiles } from '~/pages/Portfolio/Overview/ActionTiles'
import { useIsPortfolioZero } from '~/pages/Portfolio/Overview/hooks/useIsPortfolioZero'
import {
  PortfolioChartCategory,
  usePortfolioChartSeries,
} from '~/pages/Portfolio/Overview/hooks/usePortfolioChartSeries'
import { OverviewStakingSection } from '~/pages/Portfolio/Overview/OverviewStakingSection'
import { PortfolioOverviewTables } from '~/pages/Portfolio/Overview/OverviewTables'
import { PortfolioChart } from '~/pages/Portfolio/Overview/PortfolioChart'
import { PortfolioPerformance } from '~/pages/Portfolio/Overview/PortfolioPerformance'
import { useHyperEvmUsdcBalance } from '~/pages/Portfolio/Perps/hyperliquid/useHyperEvmUsdcBalance'
import { useHyperliquidAccount } from '~/pages/Portfolio/Perps/hyperliquid/useHyperliquidAccount'
import { useHyperliquidPortfolioHistory } from '~/pages/Portfolio/Perps/hyperliquid/useHyperliquidPortfolioHistory'
import { usePortfolioStakingContext } from '~/pages/Portfolio/PortfolioStakingContext'
import { PortfolioTab } from '~/pages/Portfolio/types'
import { buildPortfolioUrl } from '~/pages/Portfolio/utils/portfolioUrls'
import { filterDefinedWalletAddresses } from '~/utils/filterDefinedWalletAddresses'

const ACTIONS_AND_STATS_VARIANTS = {
  fullWidth: {
    true: 'w-[100%]',
    false: 'w-[360px]',
  },
} as const

// 360px = OVERVIEW_RIGHT_COLUMN_WIDTH (keep in sync with the other right-column consumers).
const ActionsAndStatsContainer = styled(Flex, {
  base: 'gap-[16px] w-[360px]',
  variants: ACTIONS_AND_STATS_VARIANTS,
})

// Keep in sync with the rendered PortfolioBalanceHeader height.
const ACTIONS_TOP_OFFSET_WITH_BALANCE_HEADER = 92

export const PortfolioOverview = memo(function PortfolioOverview() {
  const media = useMedia()
  const navigate = useNavigate()
  const isFullWidth = media.xl
  const portfolioPoolsBalancesEnabled = useFeatureFlag(FeatureFlags.PortfolioPoolsBalances)
  const { chainId, externalAddress, isExternalWallet } = usePortfolioRoutes()
  const portfolioAddresses = usePortfolioAddresses()

  // Staking totals are fetched once by PortfolioPageInner and shared across tabs so the value
  // doesn't reset when the animated tab content remounts.
  const { totalStakeUSD } = usePortfolioStakingContext()

  // GMX perp positions (Arbitrum): position equity (collateral + unrealized PnL) counts towards the total value
  const { positions: gmxPositions, totalNetValueUsd: gmxTotalNetValueUsd } = useGmxPositions(
    portfolioAddresses.evmAddress,
  )

  const [selectedPeriod, setSelectedPeriod] = useState<ChartPeriod>(ChartPeriod.DAY)
  const [selectedCategory, setSelectedCategory] = useState<PortfolioChartCategory>(PortfolioChartCategory.Total)

  // HOUR/DAY/WEEK/MONTH use candle-based reconstruction at the chart's own interval
  // granularity; YEAR/MAX keep the daily GMX cumulative-PnL indexer and the
  // Hyperliquid `portfolio` endpoint bucket history.
  const isCandlePeriod = selectedPeriod !== ChartPeriod.YEAR && selectedPeriod !== ChartPeriod.MAX

  const { chains: allChainIds } = useEnabledChains()
  const filterChainIds = useMemo(() => (chainId ? [chainId] : allChainIds), [chainId, allChainIds])

  const isPortfolioZero = useIsPortfolioZero()
  const queryClient = useQueryClient()

  const includeCategories = useWalletBalancesIncludeCategories()
  const portfolioValueModifier = useRestPortfolioValueModifier(portfolioAddresses.evmAddress)

  const chartInput = useMemo(
    () => ({
      evmAddress: portfolioAddresses.evmAddress,
      svmAddress: portfolioAddresses.svmAddress,
      chainIds: filterChainIds,
      includeCategories,
      includeOverrides: portfolioValueModifier?.includeOverrides,
      excludeOverrides: portfolioValueModifier?.excludeOverrides,
      includeSpamTokens: portfolioValueModifier?.includeSpamTokens,
      ...(includeCategories.includes(WalletBalanceCategory.POOLS) && {
        poolIncludeOverrides: portfolioValueModifier?.poolIncludeOverrides,
        poolExcludeOverrides: portfolioValueModifier?.poolExcludeOverrides,
      }),
    }),
    [
      portfolioAddresses.evmAddress,
      portfolioAddresses.svmAddress,
      filterChainIds,
      includeCategories,
      portfolioValueModifier,
    ],
  )

  const { data: portfolioData } = usePortfolioTotalValue({
    evmAddress: portfolioAddresses.evmAddress,
    svmAddress: portfolioAddresses.svmAddress,
    chainIds: filterChainIds,
  })

  // Shares the React Query cache entry with `usePortfolioTotalValue` (same input → same key,
  // different `select`), so this does not trigger an additional network request.
  const { data: portfolioBreakdown, requestedCategories } = usePortfolioBalanceBreakdown({
    evmAddress: portfolioAddresses.evmAddress,
    svmAddress: portfolioAddresses.svmAddress,
    chainIds: filterChainIds,
  })

  // Opt-in categories the backend omitted, making the aggregate total incomplete. The header shows a
  // warning and falls back to the sum of the categories that did resolve.
  const unavailableCategories = useMemo(
    () => getUnavailableCategories({ breakdown: portfolioBreakdown, requestedCategories }),
    [portfolioBreakdown, requestedCategories],
  )

  // Fetch portfolio historical value chart data. The base series covers a fixed
  // request-time window ([beginAt, endAt]) and does not roll while displayed — the
  // perps history reconstructions below are pinned to exactly this window so early
  // chart points never fall outside the history as wall-clock time advances.
  const {
    data: portfolioChartData,
    isPending: isChartPending,
    isPlaceholderData: isChartPlaceholderData,
    error: chartError,
  } = useGetPortfolioHistoricalValueChartQuery({
    input: { ...chartInput, chartPeriod: selectedPeriod },
    enabled: !!(portfolioAddresses.evmAddress || portfolioAddresses.svmAddress),
  })

  const chartWindow = useMemo(() => {
    const beginAt = portfolioChartData?.beginAt
    const endAt = portfolioChartData?.endAt
    if (!beginAt || !endAt) {
      return undefined
    }
    return { startSec: Number(beginAt), endSec: Number(endAt) }
  }, [portfolioChartData?.beginAt, portfolioChartData?.endAt])

  // GMX daily cumulative PnL history (Subsquid indexer) — used to reconstruct historical account value
  const { history: gmxPnlHistory } = useGmxPnlHistory(portfolioAddresses.evmAddress, !isCandlePeriod)

  // GMX positions value history at the chart period's candle granularity (HOUR–MONTH),
  // pinned to the base chart window
  const { history: gmxValueHistory } = useGmxValueHistory({
    address: portfolioAddresses.evmAddress,
    period: selectedPeriod,
    positions: gmxPositions,
    totalNetValueUsd: gmxTotalNetValueUsd,
    chartWindow,
  })

  // Hyperliquid perp account value + Core spot USDC (temporary, in-transit balance) on HyperCore
  const hyperliquidAccount = useHyperliquidAccount(portfolioAddresses.evmAddress)
  const { perpsAccountValueUsd: hyperliquidPerpsValue, spotUsdcBalanceUsd: hyperliquidSpotValue } = hyperliquidAccount

  // Hyperliquid historical total account value (Core spot + perps): candle-based
  // reconstruction at the chart period's interval granularity for HOUR–MONTH (anchored
  // at fetch time, pinned to the base chart window), `portfolio` info endpoint buckets
  // for YEAR/MAX
  const { history: hyperliquidHistory } = useHyperliquidPortfolioHistory(
    portfolioAddresses.evmAddress,
    selectedPeriod,
    hyperliquidAccount,
    chartWindow,
  )

  // The vault's HyperEVM USDC balance (chain 999 is not indexed by the Uniswap data API)
  const { balanceUsd: hyperEvmUsdcValue } = useHyperEvmUsdcBalance(portfolioAddresses.evmAddress)

  const handleNavigateToStaking = () => {
    navigate(
      buildPortfolioUrl({
        tab: PortfolioTab.Staking,
        chainId,
        externalAddress: externalAddress?.address,
      }),
    )
  }

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

  // The historical chart data only covers token balances. Staking and the HyperEVM USDC
  // balance have no history, so they are bootstrapped flatly at the current value. For
  // HOUR/DAY/WEEK/MONTH, GMX and Hyperliquid historical values are reconstructed from
  // per-coin candle closes at the chart's own interval granularity; both are pinned to
  // the base chart's [beginAt, endAt] window and anchored to the live account value at
  // fetch time, so retrieved history stays aligned with the base series and never rolls
  // with wall-clock time. For YEAR/MAX, GMX uses its daily cumulative-PnL history from
  // the Subsquid indexer (currentValue − (cumulativePnlNow − cumulativePnl(t))) and
  // Hyperliquid the absolute account value history from the `portfolio` endpoint. At or
  // after the last history sample the LIVE values are used instead of the frozen
  // forward-fill (both poll every 5s), so the end of the line tracks unrealized PnL in
  // real time while history stays fixed. When a source reports no history at all, its
  // current value is bootstrapped flatly instead.
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
    // Live Hyperliquid tail = live perps value + live Core spot USDC, matching the
    // spot+perp semantics of the history samples.
    const hlLiveTail = hlPerpsExtra + (isNaN(hyperliquidSpotValue) ? 0 : hyperliquidSpotValue)

    // Historical account value at a timestamp, given daily cumulative-PnL points. Before the
    // first point the first bucket's cumulative value applies; with no history (or no current
    // value) the flat current value is used. (YEAR/MAX GMX only.)
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
    // When liveTailValue is given, timestamps at or after the last sample use it instead
    // of the frozen forward-fill so the end of the line moves with the live value.
    const valueFromHistory = ({
      history,
      timestampSec,
      liveTailValue,
    }: {
      history: { timestamp: number; valueUsd: number }[]
      timestampSec: number
      liveTailValue?: number
    }): number => {
      if (history.length > 0 && liveTailValue !== undefined && timestampSec >= history[history.length - 1]!.timestamp) {
        return liveTailValue
      }
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

    const hasExtras = stakingExtra !== 0 || hyperliquidFlatExtra !== 0 || gmxExtra !== 0 || hlPerpsExtra !== 0
    if (!hasExtras) {
      return portfolioChartData
    }
    return {
      ...portfolioChartData,
      points: portfolioChartData.points.map((point) => {
        const timestampSec = Number(point.timestamp)
        const hlExtra =
          hyperliquidHistory.length > 0
            ? valueFromHistory({ history: hyperliquidHistory, timestampSec, liveTailValue: hlLiveTail })
            : // No portfolio history: spot is already in hyperliquidFlatExtra, add perps only.
              hlPerpsExtra
        const gmxValue = isCandlePeriod
          ? gmxValueHistory.length > 0
            ? // Candle-based reconstruction: live GMX total net value after the last sample.
              valueFromHistory({ history: gmxValueHistory, timestampSec, liveTailValue: gmxExtra })
            : // No candle history (no positions / still loading): flat current value.
              gmxExtra
          : // YEAR/MAX: daily cumulative-PnL reconstruction.
            valueFromPnlHistory({ currentValue: gmxExtra, history: gmxPnlHistory, timestampSec })
        return {
          timestamp: point.timestamp,
          value:
            point.value +
            stakingExtra +
            (hyperliquidHistory.length > 0 ? hyperEvmUsdcValue : hyperliquidFlatExtra) +
            gmxValue +
            hlExtra,
        }
      }),
    }
  }, [
    portfolioChartData,
    stakingValueStable,
    gmxTotalNetValueUsd,
    gmxPnlHistory,
    gmxValueHistory,
    isCandlePeriod,
    hyperliquidPerpsValue,
    hyperliquidHistory,
    hyperliquidSpotValue,
    hyperEvmUsdcValue,
  ])

  const {
    series,
    tokensSeries,
    poolsSeries,
    earnSeries,
    chartPercentChange,
    tokensPercentChange,
    poolsPercentChange,
    earnPercentChange,
    availableCategories,
    hasCategoryBreakdown,
  } = usePortfolioChartSeries({
    chartData: chartDataWithExtras,
    selectedPeriod,
    selectedCategory,
    poolsEnabled: portfolioPoolsBalancesEnabled,
  })

  // Reset to total when the selected category is no longer available (selector hidden, or that
  // category's data dropped out), so a stale selection doesn't strand the chart on a hidden series.
  useEffect(() => {
    if (selectedCategory !== PortfolioChartCategory.Total && !availableCategories.includes(selectedCategory)) {
      setSelectedCategory(PortfolioChartCategory.Total)
    }
  }, [availableCategories, selectedCategory])
  const isChartLoading = isChartPending || (isChartPlaceholderData && !series.length)
  const isChartEmpty = useMemo(() => {
    if (!series.length) {
      return true
    }

    if (series[series.length - 1].close === 0) {
      return series.every((d) => d.close === 0)
    }

    return false
  }, [series])

  // Get the latest value from chart endpoint (last point in the array) for comparison
  const lastChartValue = useMemo(() => {
    if (!portfolioChartData?.points || portfolioChartData.points.length === 0) {
      return undefined
    }
    return portfolioChartData.points[portfolioChartData.points.length - 1]?.value
  }, [portfolioChartData])

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
        input: { ...chartInput, chartPeriod: period },
      })
      const existingPeriodQueryState = queryClient.getQueryState(periodQuery.queryKey)
      if (existingPeriodQueryState?.fetchStatus === 'fetching' || existingPeriodQueryState?.status === 'success') {
        return
      }
      queryClient.prefetchQuery(periodQuery).catch(() => undefined)
    },
    [queryClient, portfolioAddresses.evmAddress, portfolioAddresses.svmAddress, selectedPeriod, chartInput],
  )

  // Fetch activity data once at the top level to share across the overview tables
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
              portfolioTotalBalanceUSD={portfolioTotalWithStaking} // Shows current total with staking + perps in header
              tokensValue={portfolioBreakdown?.tokens}
              poolsValue={portfolioPoolsBalancesEnabled ? portfolioBreakdown?.pools : undefined}
              earnValue={portfolioBreakdown?.earn}
              unavailableCategories={unavailableCategories}
              isPortfolioZero={isPortfolioZero}
              series={series} // Historical data with staking bootstrapped at current value; GMX and Hyperliquid reconstructed at the period's candle granularity (daily PnL / portfolio endpoint for YEAR/MAX), live values after the last history sample
              tokensSeries={tokensSeries}
              poolsSeries={poolsSeries}
              earnSeries={earnSeries}
              chartPercentChange={chartPercentChange}
              tokensPercentChange={tokensPercentChange}
              poolsPercentChange={poolsPercentChange}
              earnPercentChange={earnPercentChange}
              isLoading={isChartLoading}
              isChartEmpty={isChartEmpty}
              error={chartError}
              selectedPeriod={selectedPeriod}
              setSelectedPeriod={setSelectedPeriod}
              onHoverPeriod={handleHoverPeriod}
              isTotalValueMatch={isTotalValueMatch}
              selectedCategory={selectedCategory}
              setSelectedCategory={setSelectedCategory}
              availableCategories={availableCategories}
              hasCategoryBreakdown={hasCategoryBreakdown}
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
              <ActionsAndStatsContainer
                fullWidth={isFullWidth}
                pt={!isFullWidth ? ACTIONS_TOP_OFFSET_WITH_BALANCE_HEADER : undefined}
              >
                <OverviewActionTiles />
                <OverviewStakingSection onViewStaking={handleNavigateToStaking} />
                <PortfolioPerformance />
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
