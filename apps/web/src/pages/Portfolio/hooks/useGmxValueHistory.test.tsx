import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChartPeriod } from '@uniswap/client-data-api/dist/data/v1/api_pb'
import { renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import type { GmxPosition } from '~/pages/Portfolio/hooks/useGmxPositions'
import { useGmxValueHistory } from '~/pages/Portfolio/hooks/useGmxValueHistory'

const CHART_WINDOW = { startSec: 1_700_000_000, endSec: 1_700_086_400 }

function makePosition(overrides: Partial<GmxPosition> = {}): GmxPosition {
  return {
    marketAddress: '0x70d95587d40A2caf56bd97485aB0E5ebB7CBe098',
    collateralTokenAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    indexName: 'ETH/USD',
    poolName: 'ETH/USD [WETH-USDC]',
    isLong: true,
    sizeUsd: 10_000,
    netValueUsd: 5_000,
    collateralUsd: 4_900,
    leverage: 2,
    entryPrice: 3_000,
    markPrice: 3_100,
    unrealizedPnlUsd: 100,
    unrealizedPnlPercent: 2.04,
    sizeInUsdRaw: '10000000000000000000000000000',
    collateralAmountRaw: '4900000000',
    markPriceRaw: '3100000000000000000000000000000',
    ...overrides,
  }
}

/** One 1m candle covering the whole window so the reconstruction has a usable symbol. */
function mockGmxCandlesFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candles: [[CHART_WINDOW.startSec, 3_100, 3_100, 3_100, 3_100]],
        }),
        { status: 200 },
      ),
    ),
  )
}

describe('useGmxValueHistory — closed-position masking (double-count regression)', () => {
  function createWrapper() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return function Wrapper({ children }: PropsWithChildren): JSX.Element {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }
  }

  it('returns history while a position is open, then [] once the last position closes', async () => {
    mockGmxCandlesFetch()
    const wrapper = createWrapper()
    const props = {
      address: '0x0000000000000000000000000000000000000001',
      period: ChartPeriod.DAY,
      totalNetValueUsd: 5_000,
      chartWindow: CHART_WINDOW,
    }

    const { result, rerender } = renderHook(
      ({ positions }: { positions: GmxPosition[] }) =>
        useGmxValueHistory({ ...props, positions }),
      { wrapper, initialProps: { positions: [makePosition()] } },
    )

    await waitFor(() => expect(result.current.history.length).toBeGreaterThan(0))

    // Position closed: the query disables (positions gate), but React Query keeps serving the
    // cached series. The hook MUST mask it — otherwise the stale position value would be
    // attributed across the chart window while the returned collateral is also counted in the
    // base series (Zerion does not track GMX positions) — the removal double count.
    rerender({ positions: [] })

    expect(result.current.history).toEqual([])
  })

  it('returns [] when never enabled (no positions, nothing cached)', () => {
    mockGmxCandlesFetch()
    const wrapper = createWrapper()
    const { result } = renderHook(
      () =>
        useGmxValueHistory({
          address: '0x0000000000000000000000000000000000000001',
          period: ChartPeriod.DAY,
          positions: [],
          totalNetValueUsd: 0,
          chartWindow: CHART_WINDOW,
        }),
      { wrapper },
    )
    expect(result.current.history).toEqual([])
  })
})
