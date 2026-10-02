import { SearchType as SearchTypeV1 } from '@uniswap/client-data-api/dist/data/v1/searchTypes_pb'
import { SearchType } from '@uniswap/client-data-api/dist/data/v2/search_pb'
import { UniverseChainId } from '@universe/chains'
import { useSearchPools } from 'uniswap/src/features/dataApi/searchPools'
import type { PoolSearchHistoryResult } from 'uniswap/src/features/search/SearchHistoryResult'
import { renderHook } from 'uniswap/src/test/test-utils'

const { mockUseEnabledChains, mockUseSearchV1Query, mockUseSearchQuery, mockUseIsV2EndpointsSearchEnabled } =
  vi.hoisted(() => ({
    mockUseEnabledChains: vi.fn(),
    mockUseSearchV1Query: vi.fn(),
    mockUseSearchQuery: vi.fn(),
    mockUseIsV2EndpointsSearchEnabled: vi.fn(),
  }))

vi.mock('uniswap/src/features/chains/hooks/useEnabledChains', () => ({
  useEnabledChains: mockUseEnabledChains,
}))

vi.mock('uniswap/src/data/apiClients/dataApiService/search/searchV1', () => ({
  searchPoolToPoolSearchResult: vi.fn(),
  useSearchV1Query: mockUseSearchV1Query,
}))

vi.mock('uniswap/src/data/apiClients/dataApiService/search/search', () => ({
  rankedPoolToPoolSearchResult: vi.fn(),
  useSearchQuery: mockUseSearchQuery,
}))

vi.mock('@universe/gating', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@universe/gating')>()),
  useIsV2EndpointsSearchEnabled: mockUseIsV2EndpointsSearchEnabled,
}))

describe(useSearchPools, () => {
  beforeEach(() => {
    mockUseEnabledChains.mockReturnValue({
      chains: [UniverseChainId.Mainnet, UniverseChainId.Base],
    })
    mockUseSearchV1Query.mockReturnValue({ data: [], error: null, isLoading: false, refetch: vi.fn() })
    mockUseSearchQuery.mockReturnValue({ data: [], error: null, isLoading: false, refetch: vi.fn() })
    mockUseIsV2EndpointsSearchEnabled.mockReturnValue(false)
  })

  function setSearchV2Flag(enabled: boolean): void {
    mockUseIsV2EndpointsSearchEnabled.mockReturnValue(enabled)
  }

  it('uses the v1 pool search when V2EndpointsSearch is off', () => {
    setSearchV2Flag(false)
    const v1Data: PoolSearchHistoryResult[] = []
    mockUseSearchV1Query.mockReturnValue({ data: v1Data, error: null, isLoading: false, refetch: vi.fn() })
    mockUseSearchQuery.mockReturnValue({ data: undefined, error: null, isLoading: true, refetch: vi.fn() })

    const { result } = renderHook(() => useSearchPools({ searchQuery: 'usdc', chainFilter: null, skip: false }))

    expect(mockUseSearchV1Query).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        input: expect.objectContaining({ searchQuery: 'usdc', searchType: SearchTypeV1.POOL }),
      }),
    )
    expect(mockUseSearchQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }))
    expect(result.current.data).toBe(v1Data)
  })

  it('uses the v2 search endpoint when V2EndpointsSearch is on', () => {
    setSearchV2Flag(true)
    const v2Data: PoolSearchHistoryResult[] = []
    mockUseSearchQuery.mockReturnValue({ data: v2Data, error: null, isLoading: false, refetch: vi.fn() })

    const { result } = renderHook(() =>
      useSearchPools({ searchQuery: 'usdc', chainFilter: UniverseChainId.Base, skip: false }),
    )

    expect(mockUseSearchQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        input: expect.objectContaining({
          searchQuery: 'usdc',
          chainIds: [UniverseChainId.Base],
          types: [SearchType.POOL],
          maxResults: expect.any(Number),
        }),
      }),
    )
    expect(mockUseSearchV1Query).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }))
    expect(result.current.data).toBe(v2Data)
  })
})
