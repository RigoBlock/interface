import { UniverseChainId } from '@universe/chains'
import { useBackendSupportedChainIds } from '~/hooks/useBackendSupportedChainIds'
import { renderHook } from '~/test-utils/render'

// HyperEvm is enabled app-wide for crosschain bridging but Uniswap's data API rejects it
// (400 "unrecognized chains: 999") — this hook keeps it out of data-api chainIds.
vi.mock('uniswap/src/features/chains/hooks/useEnabledChains', () => ({
  useEnabledChains: () => ({
    chains: [UniverseChainId.Mainnet, UniverseChainId.HyperEvm, UniverseChainId.ArbitrumOne],
  }),
}))

describe('useBackendSupportedChainIds', () => {
  it('drops chains the backend data API cannot serve (HyperEvm) and keeps the rest', () => {
    const { result } = renderHook(() => useBackendSupportedChainIds())

    expect(result.current).toEqual([UniverseChainId.Mainnet, UniverseChainId.ArbitrumOne])
    expect(result.current).not.toContain(UniverseChainId.HyperEvm)
  })
})
