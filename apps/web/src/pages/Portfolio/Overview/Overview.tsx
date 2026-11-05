import { ChartPeriod, WalletBalanceCategory } from '@uniswap/client-data-api/dist/data/v1/api_pb'
import { FeatureFlags, useFeatureFlag } from '@universe/gating'
import { Flex, Separator, useMedia } from '@universe/mycelium'
import { styled } from '@universe/mycelium/styled'
import { memo, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useGetPortfolioHistoricalValueChartQuery } from 'uniswap/src/data/apiClients/dataApiService/balances/getPortfolioChart'
import {
  getUnavailableCategories,
  useWalletBalancesIncludeCategories,
} from 'uniswap/src/data/apiClients/dataApiService/balances/getWalletBalances/getWalletBalances'
import { useActivityData } from 'uniswap/src/features/activity/hooks/useActivityData'
import { useEnabledChains } from 'uniswap/src/features/chains/hooks/useEnabledChains'
import { isBackendSupportedChainId } from 'uniswap/src/features/chains/utils'
import {
  usePortfolioBalanceBreakdown,
  usePortfolioTotalValue,
} from 'uniswap/src/features/dataApi/balances/balancesRest'
import { useRestPortfolioValueModifier } from 'uniswap/src/features/dataApi/balances/useRestPortfolioValueModifier'
import { ElementName, InterfacePageName, SectionName } from 'uniswap/src/features/telemetry/constants'
import { Trace } from 'uniswap/src/features/telemetry/Trace'
import { EmptyWalletCards } from '~/components/emptyWallet/EmptyWalletCards'
import { usePortfolioRoutes } from '~/pages/Portfolio/Header/hooks/usePortfolioRoutes'
import { usePortfolioAddresses } from '~/pages/Portfolio/hooks/usePortfolioAddresses'
import { OverviewActionTiles } from '~/pages/Portfolio/Overview/ActionTiles'
import { useChartDataWithExtras } from '~/pages/Portfolio/Overview/hooks/useChartDataWithExtras'
import { ExploreTokensModule } from '~/pages/Portfolio/Overview/ExploreTokensModule/ExploreTokensModule'
import { useIsPortfolioZero } from '~/pages/Portfolio/Overview/hooks/useIsPortfolioZero'
import {
  PortfolioChartCategory,
  usePortfolioChartSeries,
} from '~/pages/Portfolio/Overview/hooks/usePortfolioChartSeries'
import { useHyperEvmChartWindow } from '~/pages/Portfolio/Overview/hooks/useHyperEvmChartWindow'
import { usePortfolioExtras } from '~/pages/Portfolio/Overview/hooks/usePortfolioExtras'
import { getIsChartEmpty, useChartValueMatch, useIsSmartPoolActivity } from '~/pages/Portfolio/Overview/hooks/useChartValueMatch'
import { usePrefetchChartPeriod } from '~/pages/Portfolio/Overview/hooks/usePrefetchChartPeriod'
import { OverviewStakingSection } from '~/pages/Portfolio/Overview/OverviewStakingSection'
import { PortfolioOverviewTables } from '~/pages/Portfolio/Overview/OverviewTables'
import { PortfolioChart } from '~/pages/Portfolio/Overview/PortfolioChart'
import { PortfolioPerformance } from '~/pages/Portfolio/Overview/PortfolioPerformance'
import { UnfundedBalanceCard } from '~/pages/Portfolio/Overview/UnfundedBalanceCard'
import { PortfolioTab } from '~/pages/Portfolio/types'
import { buildPortfolioUrl } from '~/pages/Portfolio/utils/portfolioUrls'
import { useActiveSmartPool } from '~/state/application/hooks'
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

// Stable empty history references for chain-gated chart extras (avoids re-running the
// useChartDataWithExtras memo on every render when a source isn't attributable to the selected chain).
const EMPTY_GMX_HISTORY: never[] = []
const EMPTY_HYPERLIQUID_HISTORY: never[] = []

export const PortfolioOverview = memo(function PortfolioOverview() {
  const media = useMedia()
  const navigate = useNavigate()
  const isFullWidth = media.xl
  const portfolioPoolsBalancesEnabled = useFeatureFlag(FeatureFlags.PortfolioPoolsBalances)
  const { chainId, externalAddress, isExternalWallet } = usePortfolioRoutes()
  const portfolioAddresses = usePortfolioAddresses()
  const activeSmartPool = useActiveSmartPool()
  const isSmartPoolActivity = useIsSmartPoolActivity(portfolioAddresses.evmAddress, activeSmartPool.address)

  const [selectedPeriod, setSelectedPeriod] = useState<ChartPeriod>(ChartPeriod.DAY)
  const [selectedCategory, setSelectedCategory] = useState<PortfolioChartCategory>(PortfolioChartCategory.Total)

  const { chains: allChainIds } = useEnabledChains()
  const filterChainIds = useMemo(() => (chainId ? [chainId] : allChainIds), [chainId, allChainIds])
  // The backend portfolio/chart APIs don't recognize non-backend-supported chains (e.g.
  // HyperEVM 999): they either error or return the full multichain set. Their totals and
  // breakdowns are therefore not attributable to such a chain and must not be shown for it —
  // the chain's only value comes from the on-chain extras below.
  const isSelectedChainBackendSupported = chainId === undefined || isBackendSupportedChainId(chainId)

  const isPortfolioZero = useIsPortfolioZero()
  const isNewUserUxEnabled = useFeatureFlag(FeatureFlags.NewUserUx)
  const showUnfundedHome = isNewUserUxEnabled && isPortfolioZero

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

  const { data: portfolioData, isPending: isBalancePending } = usePortfolioTotalValue({
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

  // Backend aggregates are only trustworthy when the selected chain is backend-supported.
  const backendBalanceUSD = isSelectedChainBackendSupported ? portfolioData?.balanceUSD : undefined
  const breakdownForSelectedChain = isSelectedChainBackendSupported ? portfolioBreakdown : undefined

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
    enabled:
      !showUnfundedHome && isSelectedChainBackendSupported && !!(portfolioAddresses.evmAddress || portfolioAddresses.svmAddress),
  })

  // For a non-backend-supported chain there is no attributable backend history: skip the backend
  // series entirely. The overview chart still draws for such a chain — a zero-valued base is
  // synthesized from the Hyperliquid history (or a flat period window) by
  // useChartDataWithExtras, and the on-chain extras are layered on top of it.
  const chartDataForSelectedChain = isSelectedChainBackendSupported ? portfolioChartData : undefined

  // Base chart window + the HyperEVM fallback window (selected period ending at first render)
  // that unblocks the Hyperliquid candle reconstruction when there is no base chart.
  const { chartWindow, fallbackChartWindow } = useHyperEvmChartWindow({
    chartDataForSelectedChain,
    isSelectedChainBackendSupported,
    selectedPeriod,
  })

  // RigoBlock: on-chain extras the backend doesn't cover (staking, GMX, Hyperliquid,
  // HyperEVM USDC) — see usePortfolioExtras.
  const {
    isCandlePeriod,
    stakingValueStable,
    portfolioTotalWithStaking,
    gmxValueForChain,
    gmxPnlHistory,
    gmxValueHistory,
    gmxHistoryForChain,
    hyperliquidPerpsValueForChain,
    hyperliquidSpotValueForChain,
    hyperliquidHistory,
    hyperliquidHistoryForChain,
    hyperEvmUsdcValueForChain,
  } = usePortfolioExtras({
    evmAddress: portfolioAddresses.evmAddress,
    chainId,
    selectedPeriod,
    backendBalanceUSD,
    chartWindow,
    fallbackChartWindow,
  })

  const handleNavigateToStaking = (): void => {
    void navigate(
      buildPortfolioUrl({
        tab: PortfolioTab.Staking,
        chainId,
        externalAddress: externalAddress?.address,
      }),
    )
  }


  // The historical chart data only covers token balances; staking, GMX perps, Hyperliquid
  // perps + Core spot USDC, and the HyperEVM USDC balance are reconstructed or bootstrapped
  // on top of the base series (see useChartDataWithExtras). A non-backend-supported chain
  // (HyperEVM) has no base series at all — useChartDataWithExtras synthesizes one from the
  // Hyperliquid history (or a flat period window when there is no history) so the extras can
  // draw the line.
  const chartDataWithExtras = useChartDataWithExtras({
    portfolioChartData: chartDataForSelectedChain,
    isSelectedChainBackendSupported,
    fallbackChartWindow,
    stakingValueStable,
    gmxTotalNetValueUsd: gmxValueForChain,
    gmxPnlHistory: gmxHistoryForChain ? gmxPnlHistory : EMPTY_GMX_HISTORY,
    gmxValueHistory: gmxHistoryForChain ? gmxValueHistory : EMPTY_GMX_HISTORY,
    isCandlePeriod,
    hyperliquidPerpsValue: hyperliquidPerpsValueForChain,
    hyperliquidHistory: hyperliquidHistoryForChain ? hyperliquidHistory : EMPTY_HYPERLIQUID_HISTORY,
    hyperliquidSpotValue: hyperliquidSpotValueForChain,
    hyperEvmUsdcValue: hyperEvmUsdcValueForChain,
  })

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
  const isChartLoading =
    isSelectedChainBackendSupported && (isChartPending || (isChartPlaceholderData && !series.length))
  const chartErrorWithoutData = portfolioChartData ? null : chartError
  const isChartEmpty = useMemo(() => getIsChartEmpty(series), [series])

  const { unavailableChartCategories, isTotalValueMatch } = useChartValueMatch({
    portfolioChartData,
    includeCategories,
    series,
    selectedCategory,
    backendBalanceUSD,
    breakdownForSelectedChain,
  })

  const handleHoverPeriod = usePrefetchChartPeriod({
    isSelectedChainBackendSupported,
    evmAddress: portfolioAddresses.evmAddress,
    svmAddress: portfolioAddresses.svmAddress,
    selectedPeriod,
    chartInput,
  })

  // Fetch activity data once at the top level to share across the overview tables
  const activityData = useActivityData({
    evmOwner: portfolioAddresses.evmAddress,
    svmOwner: portfolioAddresses.svmAddress,
    ownerAddresses: filterDefinedWalletAddresses([portfolioAddresses.evmAddress, portfolioAddresses.svmAddress]),
    fiatOnRampParams: undefined,
    chainIds: chainId ? [chainId] : undefined,
    // Zerion cannot track smart pool contracts — skip rather than surface a permanent error state.
    skip: isPortfolioZero || isSmartPoolActivity,
  })

  if (showUnfundedHome) {
    return (
      <Trace logImpression page={InterfacePageName.PortfolioOverviewPage} properties={{ isExternal: isExternalWallet }}>
        <Trace section={SectionName.PortfolioOverviewTab}>
          <Flex gap="$spacing16" mb="$spacing40">
            <UnfundedBalanceCard />
            <ExploreTokensModule />
          </Flex>
        </Trace>
      </Trace>
    )
  }

  return (
    <Trace logImpression page={InterfacePageName.PortfolioOverviewPage} properties={{ isExternal: isExternalWallet }}>
      <Flex gap="$spacing40" mb="$spacing40">
        <Flex row gap="$spacing40" $xl={{ flexDirection: 'column' }}>
          <Trace section={SectionName.PortfolioOverviewTab} element={ElementName.PortfolioChart}>
            <PortfolioChart
              portfolioTotalBalanceUSD={portfolioTotalWithStaking} // Shows current total with staking + perps in header
              tokensValue={breakdownForSelectedChain?.tokens}
              poolsValue={portfolioPoolsBalancesEnabled ? breakdownForSelectedChain?.pools : undefined}
              earnValue={breakdownForSelectedChain?.earn}
              unavailableCategories={unavailableCategories}
              unavailableChartCategories={unavailableChartCategories}
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
              isBalanceLoading={isBalancePending}
              isChartEmpty={isChartEmpty}
              error={chartErrorWithoutData}
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
