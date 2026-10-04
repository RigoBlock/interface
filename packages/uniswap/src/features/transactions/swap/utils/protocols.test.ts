import { TradingApi } from '@universe/api'
import { FeatureFlags, useFeatureFlag } from '@universe/gating'
import {
  DEFAULT_PROTOCOL_OPTIONS,
  filterProtocols,
  FrontendSupportedProtocol,
  useProtocols,
} from 'uniswap/src/features/transactions/swap/utils/protocols'
import { renderHook } from 'uniswap/src/test/test-utils'
import type { Mock } from 'vitest'

vi.mock('@universe/gating', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@universe/gating')>()
  return {
    ...actual,
    useFeatureFlag: vi.fn(),
  }
})

const mockUseFeatureFlag = useFeatureFlag as Mock

describe('protocols', () => {
  // RigoBlock: UNISWAPX_LATEST may still appear in persisted settings, so filterProtocols must
  // strip it no matter what the upstream `uniswapx` feature flag says.
  const allProtocols: FrontendSupportedProtocol[] = [
    TradingApi.ProtocolItems.UNISWAPX_LATEST,
    TradingApi.ProtocolItems.V4,
    TradingApi.ProtocolItems.V3,
    TradingApi.ProtocolItems.V2,
  ]
  const classicProtocols: FrontendSupportedProtocol[] = [
    TradingApi.ProtocolItems.V4,
    TradingApi.ProtocolItems.V3,
    TradingApi.ProtocolItems.V2,
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('defaults to V4, V3, and V2 (RigoBlock: classic-only)', () => {
    expect(DEFAULT_PROTOCOL_OPTIONS).toEqual(classicProtocols)
  })

  it('filters UniswapX latest even when UniswapX is enabled', () => {
    expect(filterProtocols(allProtocols, true)).toEqual(classicProtocols)
  })

  it('filters only UniswapX latest when UniswapX is disabled', () => {
    expect(filterProtocols(allProtocols, false)).toEqual(classicProtocols)
  })

  it('does not add UniswapX latest when the user toggled it off', () => {
    const selectedProtocols: FrontendSupportedProtocol[] = [
      TradingApi.ProtocolItems.V4,
      TradingApi.ProtocolItems.V3,
      TradingApi.ProtocolItems.V2,
    ]

    expect(filterProtocols(selectedProtocols, true)).toEqual(selectedProtocols)
  })

  it('does not filter V4 when UniswapX is disabled', () => {
    const selectedProtocols: FrontendSupportedProtocol[] = [
      TradingApi.ProtocolItems.UNISWAPX_LATEST,
      TradingApi.ProtocolItems.V4,
    ]

    expect(filterProtocols(selectedProtocols, false)).toEqual([TradingApi.ProtocolItems.V4])
  })

  it('consults the global UniswapX feature flag but still filters UniswapX latest', () => {
    mockUseFeatureFlag.mockImplementation((flag: FeatureFlags) => flag === FeatureFlags.UniswapX)

    const { result } = renderHook(() => useProtocols(allProtocols))

    expect(result.current).toEqual(classicProtocols)
    expect(mockUseFeatureFlag).toHaveBeenCalledWith(FeatureFlags.UniswapX)
  })

  it('filters UniswapX latest in the hook path when the global flag is disabled', () => {
    mockUseFeatureFlag.mockReturnValue(false)

    const { result } = renderHook(() => useProtocols(allProtocols))

    expect(result.current).toEqual(classicProtocols)
  })
})
