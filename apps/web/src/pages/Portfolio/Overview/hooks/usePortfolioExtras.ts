import { ChartPeriod } from '@uniswap/client-data-api/dist/data/v1/api_pb'
import { useMemo } from 'react'
import { useGmxPnlHistory } from '~/pages/Portfolio/hooks/useGmxPnlHistory'
import { useGmxPositions } from '~/pages/Portfolio/hooks/useGmxPositions'
import { useGmxValueHistory } from '~/pages/Portfolio/hooks/useGmxValueHistory'
import { getPerpsExtrasForChain } from '~/pages/Portfolio/Overview/hooks/perpsChainAttribution'
import { useHyperEvmUsdcBalance } from '~/pages/Portfolio/Perps/hyperliquid/useHyperEvmUsdcBalance'
import { useHyperliquidAccount } from '~/pages/Portfolio/Perps/hyperliquid/useHyperliquidAccount'
import { useHyperliquidPortfolioHistory } from '~/pages/Portfolio/Perps/hyperliquid/useHyperliquidPortfolioHistory'
import { usePortfolioStakingContext } from '~/pages/Portfolio/PortfolioStakingContext'

interface PortfolioExtras {
  isCandlePeriod: boolean
  stakingValueStable: number
  portfolioTotalWithStaking: number
  gmxValueForChain: number
  gmxPnlHistory: ReturnType<typeof useGmxPnlHistory>['history']
  gmxValueHistory: ReturnType<typeof useGmxValueHistory>['history']
  gmxHistoryForChain: boolean
  hyperliquidPerpsValueForChain: number
  hyperliquidSpotValueForChain: number
  hyperliquidHistory: ReturnType<typeof useHyperliquidPortfolioHistory>['history']
  hyperliquidHistoryForChain: boolean
  hyperEvmUsdcValueForChain: number
}

interface ChartWindow {
  startSec: number
  endSec: number
}

interface UsePortfolioExtrasParams {
  evmAddress: string | undefined
  chainId: number | undefined
  selectedPeriod: ChartPeriod
  backendBalanceUSD: number | undefined
  chartWindow: ChartWindow | undefined
  fallbackChartWindow: ChartWindow | undefined
}

/**
 * RigoBlock: the value sources the backend portfolio/chart APIs don't cover, attributed to
 * the selected chain: GRG staking totals, GMX perp positions (Arbitrum), the Hyperliquid
 * account (perps + Core spot USDC) and the on-chain HyperEVM (999) USDC balance — each with
 * the history reconstruction the overview chart layers on top of the base series
 * (see useChartDataWithExtras). Extracted from Overview.tsx to keep the component under the
 * complexity/max-lines budgets.
 */
export function usePortfolioExtras({
  evmAddress,
  chainId,
  selectedPeriod,
  backendBalanceUSD,
  chartWindow,
  fallbackChartWindow,
}: UsePortfolioExtrasParams): PortfolioExtras {
  // Staking totals are fetched once by PortfolioPageInner and shared across tabs so the value
  // doesn't reset when the animated tab content remounts.
  const { totalStakeUSD } = usePortfolioStakingContext()

  // GMX perp positions (Arbitrum): position equity (collateral + unrealized PnL) counts towards the total value
  const { positions: gmxPositions, totalNetValueUsd: gmxTotalNetValueUsd } = useGmxPositions(evmAddress)

  // HOUR/DAY/WEEK/MONTH use candle-based reconstruction at the chart's own interval
  // granularity; YEAR/MAX keep the daily GMX cumulative-PnL indexer and the
  // Hyperliquid `portfolio` endpoint bucket history.
  const isCandlePeriod = selectedPeriod !== ChartPeriod.YEAR && selectedPeriod !== ChartPeriod.MAX

  // GMX daily cumulative PnL history (Subsquid indexer) — used to reconstruct historical account value
  const { history: gmxPnlHistory } = useGmxPnlHistory(evmAddress, !isCandlePeriod)

  // GMX positions value history at the chart period's candle granularity (HOUR–MONTH),
  // pinned to the base chart window
  const { history: gmxValueHistory } = useGmxValueHistory({
    address: evmAddress,
    period: selectedPeriod,
    positions: gmxPositions,
    totalNetValueUsd: gmxTotalNetValueUsd,
    chartWindow,
  })

  // Hyperliquid perp account value + Core spot USDC (temporary, in-transit balance) on HyperCore
  const hyperliquidAccount = useHyperliquidAccount(evmAddress)
  const { perpsAccountValueUsd: hyperliquidPerpsValue, spotUsdcBalanceUsd: hyperliquidSpotValue } = hyperliquidAccount

  // Hyperliquid historical total account value (Core spot + perps): candle-based
  // reconstruction at the chart period's interval granularity for HOUR–MONTH (anchored
  // at fetch time, pinned to the base chart window), `portfolio` info endpoint buckets
  // for YEAR/MAX
  const { history: hyperliquidHistory } = useHyperliquidPortfolioHistory(
    evmAddress,
    selectedPeriod,
    hyperliquidAccount,
    chartWindow ?? fallbackChartWindow,
  )

  // The vault's HyperEVM USDC balance (chain 999 is not indexed by the Uniswap data API)
  const { balanceUsd: hyperEvmUsdcValue } = useHyperEvmUsdcBalance(evmAddress)

  // Chain attribution for the value sources the backend doesn't cover: GMX perps count on
  // Arbitrum, the Hyperliquid account (presented as HyperEVM positions) counts on HyperEVM
  // (999) and All Networks, and the HyperEVM USDC balance on HyperEVM (999) — so a
  // single-chain selection doesn't leak other chains' perps value into the total or chart.
  const {
    gmxTotalNetValueUsd: gmxValueForChain,
    hyperliquidPerpsValueUsd: hyperliquidPerpsValueForChain,
    hyperliquidSpotValueUsd: hyperliquidSpotValueForChain,
    hyperEvmUsdcValueUsd: hyperEvmUsdcValueForChain,
    gmxHistoryForChain,
    hyperliquidHistoryForChain,
  } = getPerpsExtrasForChain({
    chainId,
    extras: {
      gmxTotalNetValueUsd,
      hyperliquidPerpsValueUsd: hyperliquidPerpsValue,
      hyperliquidSpotValueUsd: hyperliquidSpotValue,
      hyperEvmUsdcValueUsd: hyperEvmUsdcValue,
    },
  })

  // Calculate total portfolio value including staking - memoize with stable dependencies
  const stakingValueStable = useMemo(() => {
    return totalStakeUSD ? parseFloat(totalStakeUSD.toExact()) : 0
  }, [totalStakeUSD])

  const portfolioTotalWithStaking = useMemo(() => {
    const baseValue = backendBalanceUSD || 0

    // Ensure both values are valid numbers to prevent BigNumber errors
    const safeBaseValue = isNaN(baseValue) ? 0 : baseValue
    const safeStakingValue = isNaN(stakingValueStable) ? 0 : stakingValueStable
    const safeGmxValue = isNaN(gmxValueForChain) ? 0 : gmxValueForChain
    const safeHyperliquidPerpsValue = isNaN(hyperliquidPerpsValueForChain) ? 0 : hyperliquidPerpsValueForChain
    const safeHyperliquidSpotValue = isNaN(hyperliquidSpotValueForChain) ? 0 : hyperliquidSpotValueForChain
    const safeHyperEvmUsdcValue = isNaN(hyperEvmUsdcValueForChain) ? 0 : hyperEvmUsdcValueForChain

    return (
      safeBaseValue +
      safeStakingValue +
      safeGmxValue +
      safeHyperliquidPerpsValue +
      safeHyperliquidSpotValue +
      safeHyperEvmUsdcValue
    )
  }, [
    backendBalanceUSD,
    stakingValueStable,
    gmxValueForChain,
    hyperliquidPerpsValueForChain,
    hyperliquidSpotValueForChain,
    hyperEvmUsdcValueForChain,
  ])

  return {
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
  }
}
