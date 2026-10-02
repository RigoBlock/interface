import { renderHook } from '@testing-library/react'
import { UniverseChainId } from '@universe/chains'
import type { Warning } from 'uniswap/src/components/modals/WarningModal/types'
import { WarningAction, WarningLabel, WarningSeverity } from 'uniswap/src/components/modals/WarningModal/types'
import { useCanonicalBridgeChainId } from 'uniswap/src/features/transactions/swap/form/SwapFormScreen/SwapFormScreenDetails/SwapFormScreenFooter/GasAndWarningRows/useCanonicalBridgeChainId'

const mockUseSwapFormStoreDerivedSwapInfo = vi.fn()
const mockUseEnabledChains = vi.fn()

vi.mock('uniswap/src/features/transactions/swap/stores/swapFormStore/useSwapFormStore', () => ({
  useSwapFormStoreDerivedSwapInfo: (selector: (s: unknown) => unknown): unknown =>
    selector(mockUseSwapFormStoreDerivedSwapInfo()),
}))

vi.mock('uniswap/src/features/chains/hooks/useEnabledChains', () => ({
  useEnabledChains: (): unknown => mockUseEnabledChains(),
}))

function mockCurrencies(inputChainId?: UniverseChainId, outputChainId?: UniverseChainId): void {
  mockUseSwapFormStoreDerivedSwapInfo.mockReturnValue({
    currencies: {
      input: inputChainId !== undefined ? { currency: { chainId: inputChainId } } : undefined,
      output: outputChainId !== undefined ? { currency: { chainId: outputChainId } } : undefined,
    },
  })
}

const noQuotesFoundWarning: Warning = {
  type: WarningLabel.NoQuotesFound,
  severity: WarningSeverity.Low,
  action: WarningAction.DisableReview,
  title: 'No quotes found',
}

const otherWarning: Warning = {
  type: WarningLabel.SwapRouterError,
  severity: WarningSeverity.Low,
  action: WarningAction.DisableReview,
  title: 'Router error',
}

describe('useCanonicalBridgeChainId', () => {
  beforeEach(() => {
    mockUseEnabledChains.mockReturnValue({ isTestnetModeEnabled: false })
  })

  it('returns undefined in testnet mode', () => {
    mockUseEnabledChains.mockReturnValue({ isTestnetModeEnabled: true })
    mockCurrencies(UniverseChainId.Robinhood, UniverseChainId.Mainnet)

    const { result } = renderHook(() => useCanonicalBridgeChainId(noQuotesFoundWarning))

    expect(result.current).toBeUndefined()
  })

  it('returns undefined when there is no warning', () => {
    mockCurrencies(UniverseChainId.Robinhood, UniverseChainId.Mainnet)

    const { result } = renderHook(() => useCanonicalBridgeChainId(undefined))

    expect(result.current).toBeUndefined()
  })

  it('returns undefined when the warning is not NoQuotesFound', () => {
    mockCurrencies(UniverseChainId.Robinhood, UniverseChainId.Mainnet)

    const { result } = renderHook(() => useCanonicalBridgeChainId(otherWarning))

    expect(result.current).toBeUndefined()
  })

  it('returns undefined when input and output chains match', () => {
    mockCurrencies(UniverseChainId.Robinhood, UniverseChainId.Robinhood)

    const { result } = renderHook(() => useCanonicalBridgeChainId(noQuotesFoundWarning))

    expect(result.current).toBeUndefined()
  })

  it('prefers the output bridge to preserve existing web behavior', () => {
    mockCurrencies(UniverseChainId.Robinhood, UniverseChainId.ArbitrumOne)

    const { result } = renderHook(() => useCanonicalBridgeChainId(noQuotesFoundWarning))

    expect(result.current).toBe(UniverseChainId.ArbitrumOne)
  })

  it('returns the output bridge when bridging into Robinhood Chain', () => {
    mockCurrencies(UniverseChainId.ArbitrumOne, UniverseChainId.Robinhood)

    const { result } = renderHook(() => useCanonicalBridgeChainId(noQuotesFoundWarning))

    expect(result.current).toBe(UniverseChainId.Robinhood)
  })

  it('falls back to the input bridge when the output chain has none', () => {
    mockCurrencies(UniverseChainId.ArbitrumOne, UniverseChainId.Mainnet)

    const { result } = renderHook(() => useCanonicalBridgeChainId(noQuotesFoundWarning))

    expect(result.current).toBe(UniverseChainId.ArbitrumOne)
  })

  it('returns undefined when neither chain has a canonical bridge', () => {
    mockCurrencies(UniverseChainId.Mainnet, UniverseChainId.Sepolia)

    const { result } = renderHook(() => useCanonicalBridgeChainId(noQuotesFoundWarning))

    expect(result.current).toBeUndefined()
  })
})
