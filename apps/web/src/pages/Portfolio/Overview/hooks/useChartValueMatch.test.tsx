import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PriceChartData } from '~/components/Charts/PriceChart/PriceChartModel'
import { renderHook } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { PortfolioChartCategory } from '~/pages/Portfolio/Overview/hooks/usePortfolioChartSeries'
import { useChartValueMatch } from '~/pages/Portfolio/Overview/hooks/useChartValueMatch'
import { usePortfolioChartBalanceMismatch } from 'uniswap/src/features/portfolio/usePortfolioChartBalanceMismatch'

vi.mock('uniswap/src/features/portfolio/usePortfolioChartBalanceMismatch', () => ({
  usePortfolioChartBalanceMismatch: vi.fn(() => ({ isTotalValueMatch: true })),
}))

const BASE_POINTS = [
  { timestamp: 1n, value: 100 },
  { timestamp: 2n, value: 110 },
]

const SERIES_WITH_EXTRAS = [
  { time: 1, value: 106, open: 106, high: 106, low: 106, close: 106 },
  // The Total series carries the on-chain extras on top of the base — the last base value
  // is 110 but the series close is 210.
  { time: 2, value: 210, open: 210, high: 210, low: 210, close: 210 },
] as unknown as PriceChartData[]

describe('useChartValueMatch — extras must not feed the Total mismatch check', () => {
  function render(category: PortfolioChartCategory): void {
    const queryClient = new QueryClient()
    const wrapper = ({ children }: PropsWithChildren): JSX.Element => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    renderHook(
      () =>
        useChartValueMatch({
          portfolioChartData: { points: BASE_POINTS } as never,
          includeCategories: [],
          series: SERIES_WITH_EXTRAS,
          selectedCategory: category,
          backendBalanceUSD: 110,
          breakdownForSelectedChain: undefined,
        }),
      { wrapper },
    )
  }

  it('compares the BASE chart last value (not the extras-laden series) for the Total category', () => {
    render(PortfolioChartCategory.Total)
    expect(vi.mocked(usePortfolioChartBalanceMismatch).mock.lastCall?.[0]).toMatchObject({
      lastChartValue: 110,
      portfolioTotalBalanceUSD: 110,
    })
  })

  it('uses the selected category series last close for non-Total categories', () => {
    render(PortfolioChartCategory.Tokens)
    expect(vi.mocked(usePortfolioChartBalanceMismatch).mock.lastCall?.[0]).toMatchObject({
      lastChartValue: 210,
    })
  })
})
