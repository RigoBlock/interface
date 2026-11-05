import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ChartPeriod } from '@uniswap/client-data-api/dist/data/v1/api_pb'
import { getPortfolioHistoricalValueChartQuery } from 'uniswap/src/data/apiClients/dataApiService/balances/getPortfolioChart'

interface UsePrefetchChartPeriodParams {
  isSelectedChainBackendSupported: boolean
  evmAddress: string | undefined
  svmAddress: string | undefined
  selectedPeriod: ChartPeriod
  chartInput: Record<string, unknown>
}

/**
 * Prefetches a timeframe's chart data on hover so it's ready when the user clicks. Extracted
 * from Overview.tsx to keep the component under the complexity budget.
 */
export function usePrefetchChartPeriod({
  isSelectedChainBackendSupported,
  evmAddress,
  svmAddress,
  selectedPeriod,
  chartInput,
}: UsePrefetchChartPeriodParams): (period: ChartPeriod) => void {
  const queryClient = useQueryClient()

  return useCallback(
    (period: ChartPeriod) => {
      if (!isSelectedChainBackendSupported) {
        return
      }
      if (!evmAddress && !svmAddress) {
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
    [queryClient, evmAddress, svmAddress, selectedPeriod, chartInput, isSelectedChainBackendSupported],
  )
}
