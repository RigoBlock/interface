import { SearchType as SearchTypeV1 } from '@uniswap/client-data-api/dist/data/v1/searchTypes_pb'
import { SearchResponse, SearchType } from '@uniswap/client-data-api/dist/data/v2/search_pb'
import { UniverseChainId, Platform } from '@universe/chains'
import { filterMultichainResultsToChain, useMultichainSearchTokens } from 'uniswap/src/features/dataApi/searchTokens'
import type { CurrencyInfo, MultichainSearchResult } from 'uniswap/src/features/dataApi/types'
import { createRankedMultichainToken } from 'uniswap/src/test/fixtures/dataApi/rankedMultichainToken'
import { renderHook } from 'uniswap/src/test/test-utils'

const {
  mockUseConnectionStatus,
  mockUseEnabledChains,
  mockUseSearchV1Query,
  mockUseSearchQuery,
  mockUseIsV2EndpointsSearchEnabled,
} = vi.hoisted(() => ({
  mockUseConnectionStatus: vi.fn(),
  mockUseEnabledChains: vi.fn(),
  mockUseSearchV1Query: vi.fn(),
  mockUseSearchQuery: vi.fn(),
  mockUseIsV2EndpointsSearchEnabled: vi.fn(),
}))

vi.mock('uniswap/src/features/accounts/store/hooks', () => ({
  useConnectionStatus: mockUseConnectionStatus,
}))

vi.mock('uniswap/src/features/chains/hooks/useEnabledChains', () => ({
  useEnabledChains: mockUseEnabledChains,
}))

vi.mock('uniswap/src/data/apiClients/dataApiService/search/searchV1', () => ({
  useSearchV1Query: mockUseSearchV1Query,
}))

vi.mock('uniswap/src/data/apiClients/dataApiService/search/search', () => ({
  useSearchQuery: mockUseSearchQuery,
}))

vi.mock('@universe/gating', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@universe/gating')>()),
  useIsV2EndpointsSearchEnabled: mockUseIsV2EndpointsSearchEnabled,
}))

describe(useMultichainSearchTokens, () => {
  beforeEach(() => {
    mockUseConnectionStatus.mockImplementation((platform: Platform) => ({
      isConnected: platform === Platform.SVM,
    }))
    mockUseEnabledChains.mockReturnValue({
      chains: [UniverseChainId.Mainnet, UniverseChainId.Base, UniverseChainId.Robinhood],
    })
    mockUseSearchV1Query.mockReturnValue({
      data: [],
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    })
    mockUseSearchQuery.mockReturnValue({
      data: [],
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    })
    mockUseIsV2EndpointsSearchEnabled.mockReturnValue(false)
  })

  it('passes the provided chainIds when all networks is selected in a constrained selector', () => {
    renderHook(() =>
      useMultichainSearchTokens({
        searchQuery: 'cash',
        chainFilter: null,
        chainIds: [UniverseChainId.Mainnet, UniverseChainId.Base],
        skip: false,
      }),
    )

    expect(mockUseSearchV1Query).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          chainIds: [UniverseChainId.Mainnet, UniverseChainId.Base],
          searchQuery: 'cash',
          searchType: SearchTypeV1.TOKEN,
        }),
      }),
    )
  })

  it('uses the selected chainFilter over the provided chainIds', () => {
    renderHook(() =>
      useMultichainSearchTokens({
        searchQuery: 'cash',
        chainFilter: UniverseChainId.Base,
        chainIds: [UniverseChainId.Mainnet, UniverseChainId.Base],
        skip: false,
      }),
    )

    expect(mockUseSearchV1Query).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          chainIds: [UniverseChainId.Base],
        }),
      }),
    )
  })

  describe('V2EndpointsSearch flag routing', () => {
    function setSearchV2Flag(enabled: boolean): void {
      mockUseIsV2EndpointsSearchEnabled.mockReturnValue(enabled)
    }

    it('disables the v2 query and returns the v1 result when the flag is off', () => {
      setSearchV2Flag(false)
      const v1Data: MultichainSearchResult[] = []
      mockUseSearchV1Query.mockReturnValue({
        data: v1Data,
        error: null,
        isLoading: false,
        refetch: vi.fn(),
      })
      mockUseSearchQuery.mockReturnValue({ data: undefined, error: null, isLoading: true, refetch: vi.fn() })

      const { result } = renderHook(() =>
        useMultichainSearchTokens({ searchQuery: 'cash', chainFilter: null, skip: false }),
      )

      expect(mockUseSearchQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }))
      expect(mockUseSearchV1Query).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }))
      expect(result.current.data).toBe(v1Data)
    })

    it('disables the v1 query and passes the v2 request shape when the flag is on', () => {
      setSearchV2Flag(true)
      const v2Data: MultichainSearchResult[] = []
      mockUseSearchQuery.mockReturnValue({ data: v2Data, error: null, isLoading: false, refetch: vi.fn() })

      const { result } = renderHook(() =>
        useMultichainSearchTokens({ searchQuery: 'cash', chainFilter: null, skip: false }),
      )

      expect(mockUseSearchQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: true,
          input: expect.objectContaining({
            searchQuery: 'cash',
            chainIds: [UniverseChainId.Mainnet, UniverseChainId.Base, UniverseChainId.Robinhood],
            types: [SearchType.TOKEN],
            maxResults: expect.any(Number),
          }),
        }),
      )
      expect(mockUseSearchV1Query).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }))
      expect(result.current.data).toBe(v2Data)
    })

    it('appends suppressed tokens after default tokens in the v2 select', () => {
      setSearchV2Flag(true)

      renderHook(() => useMultichainSearchTokens({ searchQuery: 'cash', chainFilter: null, skip: false }))

      const { select } = mockUseSearchQuery.mock.calls.at(-1)?.[0] as {
        select: (data: SearchResponse) => MultichainSearchResult[]
      }
      const response = new SearchResponse({
        tokens: [createRankedMultichainToken({ multichainId: 'mc:default' })],
        suppressedTokens: [createRankedMultichainToken({ multichainId: 'mc:suppressed' })],
      })

      const results = select(response)
      expect(results.map((r) => r.id)).toEqual(['mc:default', 'mc:suppressed'])
      expect(results.map((r) => r.isSuppressed)).toEqual([false, true])
      expect(results[1]?.tokens[0]?.searchMultichainParent?.isSuppressed).toBe(true)
    })

    it('caps combined default + suppressed tokens at the requested size', () => {
      setSearchV2Flag(true)

      renderHook(() => useMultichainSearchTokens({ searchQuery: 'cash', chainFilter: null, skip: false, size: 2 }))

      const { select } = mockUseSearchQuery.mock.calls.at(-1)?.[0] as {
        select: (data: SearchResponse) => MultichainSearchResult[]
      }
      const response = new SearchResponse({
        tokens: [
          createRankedMultichainToken({ multichainId: 'mc:first' }),
          createRankedMultichainToken({ multichainId: 'mc:second' }),
        ],
        suppressedTokens: [createRankedMultichainToken({ multichainId: 'mc:suppressed' })],
      })

      expect(select(response).map((r) => r.id)).toEqual(['mc:first', 'mc:second'])
    })
  })
})

describe(filterMultichainResultsToChain, () => {
  function createResult(chainIds: UniverseChainId[]): MultichainSearchResult {
    return {
      id: 'mc:sol',
      name: 'Moo Deng',
      symbol: 'MOODENG',
      logoUrl: undefined,
      tokens: chainIds.map((chainId) => ({ currency: { chainId } }) as unknown as CurrencyInfo),
    }
  }

  it('prunes a group to only the tokens on the selected chain', () => {
    const filtered = filterMultichainResultsToChain(
      [createResult([UniverseChainId.Solana, UniverseChainId.Mainnet])],
      UniverseChainId.Mainnet,
    )

    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.tokens.map((token) => token.currency.chainId)).toEqual([UniverseChainId.Mainnet])
  })

  it('drops groups left with no tokens on the selected chain', () => {
    const filtered = filterMultichainResultsToChain(
      [createResult([UniverseChainId.Solana, UniverseChainId.Mainnet])],
      UniverseChainId.Base,
    )

    expect(filtered).toEqual([])
  })

  it('returns results unchanged when no chain is selected', () => {
    const results = [createResult([UniverseChainId.Solana, UniverseChainId.Mainnet])]
    const filtered = filterMultichainResultsToChain(results, null)

    expect(filtered).toBe(results)
  })
})
