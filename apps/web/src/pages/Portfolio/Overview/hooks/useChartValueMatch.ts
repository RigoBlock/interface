import { WalletBalanceCategory } from '@uniswap/client-data-api/dist/data/v1/api_pb'
import type { PlainMessage } from '@bufbuild/protobuf'
import type { ChartPoint, GetPortfolioChartResponse } from '@uniswap/client-data-api/dist/data/v1/api_pb'
import { areAddressesEqual, Platform } from '@universe/chains'
import { useMemo } from 'react'
import type { PortfolioBalanceBreakdown } from 'uniswap/src/data/apiClients/dataApiService/balances/getWalletBalances/getWalletBalances'
import { getUnavailableChartCategories } from 'uniswap/src/features/portfolio/getUnavailableChartCategories'
import { usePortfolioChartBalanceMismatch } from 'uniswap/src/features/portfolio/usePortfolioChartBalanceMismatch'
import type { PriceChartData } from '~/components/Charts/PriceChart/PriceChartModel'
import { PortfolioChartCategory } from '~/pages/Portfolio/Overview/hooks/usePortfolioChartSeries'

interface UseChartValueMatchParams {
  portfolioChartData:
    | Pick<PlainMessage<GetPortfolioChartResponse>, 'earn' | 'pools' | 'tokens' | 'points'>
    | undefined
  includeCategories: WalletBalanceCategory[]
  series: PriceChartData[]
  selectedCategory: PortfolioChartCategory
  // Backend aggregates are only trustworthy for backend-supported chains — a
  // non-backend-supported selection (HyperEVM/999) resolves to undefined.
  backendBalanceUSD: number | undefined
  breakdownForSelectedChain: PortfolioBalanceBreakdown | undefined
}

/**
 * RigoBlock: true when the resolved portfolio address IS the active smart pool — Zerion cannot
 * track vault contracts, so the activity query is skipped rather than surfacing a permanent
 * error state.
 */
export function useIsSmartPoolActivity(
  evmAddress: string | undefined,
  smartPoolAddress: string | null | undefined,
): boolean {
  return Boolean(
    evmAddress &&
      smartPoolAddress &&
      areAddressesEqual({
        addressInput1: { address: evmAddress, platform: Platform.EVM },
        addressInput2: { address: smartPoolAddress, platform: Platform.EVM },
      }),
  )
}

interface ChartValueMatch {
  unavailableChartCategories: WalletBalanceCategory[]
  isTotalValueMatch: boolean
}

/**
 * Spam-token divergence check: compares the selected category's chart leg with that category's
 * backend balance, per category, so a single-category view isn't flagged when another
 * category's leg is missing from the chart. RigoBlock: backend aggregates are only trustworthy
 * for backend-supported chains. Extracted from Overview.tsx to keep the component under the
 * complexity budget.
 */
export function useChartValueMatch({
  portfolioChartData,
  includeCategories,
  series,
  selectedCategory,
  backendBalanceUSD,
  breakdownForSelectedChain,
}: UseChartValueMatchParams): ChartValueMatch {
  const unavailableChartCategories = useMemo(
    () => getUnavailableChartCategories({ chartData: portfolioChartData, requestedCategories: includeCategories }),
    [portfolioChartData, includeCategories],
  )

  // Runtime chart responses may omit `points` entirely (empty response) even though the
  // generated type marks it required.
  const basePoints = portfolioChartData?.points as unknown as ChartPoint[] | undefined
  const lastBaseChartValue = basePoints?.length ? basePoints.at(-1)?.value : undefined

  const { isTotalValueMatch } = usePortfolioChartBalanceMismatch({
    // RigoBlock: the Total series has the on-chain extras (GMX/Hyperliquid/staking) layered
    // on top of the base series, but the backend total has none — comparing the two would
    // flag a mismatch exactly when an extra moves (flipping hideYAxis and killing the
    // hovered-point readout, Nov 2026 regression). The Total comparison must use the BASE
    // chart's last value, as the fork always did; per-category series carry no extras, so
    // they can keep the selected series' last close.
    lastChartValue:
      selectedCategory === PortfolioChartCategory.Total
        ? lastBaseChartValue
        : series.at(-1)?.close,
    portfolioTotalBalanceUSD: {
      [PortfolioChartCategory.Total]: backendBalanceUSD,
      [PortfolioChartCategory.Tokens]: breakdownForSelectedChain?.tokens.balanceUSD,
      [PortfolioChartCategory.Pools]: breakdownForSelectedChain?.pools.balanceUSD,
      [PortfolioChartCategory.Earn]: breakdownForSelectedChain?.earn.balanceUSD,
    }[selectedCategory],
  })

  return { unavailableChartCategories, isTotalValueMatch }
}

/** Empty-series check with the all-zero tail special case (chart drew, wallet is empty). */
export function getIsChartEmpty(series: PriceChartData[]): boolean {
  if (!series.length) {
    return true
  }
  if (series.at(-1)?.close === 0) {
    return series.every((d) => d.close === 0)
  }
  return false
}
