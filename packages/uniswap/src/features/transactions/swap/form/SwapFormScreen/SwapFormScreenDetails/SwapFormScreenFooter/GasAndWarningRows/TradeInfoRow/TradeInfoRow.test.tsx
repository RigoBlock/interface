import { UniverseChainId } from '@universe/chains'
import { Text, View } from 'react-native'
import { TradeInfoRow } from 'uniswap/src/features/transactions/swap/form/SwapFormScreen/SwapFormScreenDetails/SwapFormScreenFooter/GasAndWarningRows/TradeInfoRow/TradeInfoRow'
import type { GasInfo } from 'uniswap/src/features/transactions/swap/form/SwapFormScreen/SwapFormScreenDetails/SwapFormScreenFooter/GasAndWarningRows/types'
import { render } from 'uniswap/src/test/test-utils'

const mockUseFeatureFlag = vi.hoisted(() => vi.fn())
const mockUseEnableCustomGasFeeEntry = vi.hoisted(() => vi.fn())

vi.mock('@universe/environment', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@universe/environment')>()
  return {
    ...actual,
    isMobileApp: true,
    isWebApp: false,
  }
})

vi.mock('@universe/gating', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@universe/gating')>()
  return {
    ...actual,
    useFeatureFlag: mockUseFeatureFlag,
  }
})

vi.mock('uniswap/src/features/chains/hooks/useEnabledChains', () => ({
  useEnabledChains: (): { isTestnetModeEnabled: boolean } => ({ isTestnetModeEnabled: false }),
}))

vi.mock('uniswap/src/features/gas/hooks/useEnableCustomGasFeeEntry', () => ({
  useEnableCustomGasFeeEntry: mockUseEnableCustomGasFeeEntry,
}))

vi.mock(
  'uniswap/src/features/transactions/swap/form/SwapFormScreen/SwapFormScreenDetails/SwapFormScreenFooter/GasAndWarningRows/TradeInfoRow/CanonicalBridgeLinkBanner',
  () => ({
    CanonicalBridgeLinkBanner: ({ chainId }: { chainId: UniverseChainId }) => (
      <Text testID="canonical-bridge-banner">{chainId}</Text>
    ),
  }),
)

vi.mock(
  'uniswap/src/features/transactions/swap/form/SwapFormScreen/SwapFormScreenDetails/SwapFormScreenFooter/GasAndWarningRows/TradeInfoRow/GasInfoRow',
  () => ({
    GasInfoRow: () => <View testID="gas-info-row" />,
  }),
)

vi.mock(
  'uniswap/src/features/transactions/swap/form/SwapFormScreen/SwapFormScreenDetails/SwapFormScreenFooter/GasAndWarningRows/TradeInfoRow/GasInfoRowWithCustomGasEnabled',
  () => ({
    GasInfoRowWithCustomGasEnabled: () => <View testID="custom-gas-info-row" />,
  }),
)

vi.mock(
  'uniswap/src/features/transactions/swap/form/SwapFormScreen/SwapFormScreenDetails/SwapFormScreenFooter/GasAndWarningRows/TradeInfoRow/useDebouncedTrade',
  () => ({
    useDebouncedTrade: (): undefined => undefined,
  }),
)

vi.mock('uniswap/src/features/transactions/swap/stores/swapFormStore/useSwapFormStore', () => ({
  useSwapFormStoreDerivedSwapInfo: (selector: (state: object) => unknown): unknown => selector({}),
}))

const gasInfo = {} as GasInfo

describe('TradeInfoRow on mobile', () => {
  beforeEach(() => {
    mockUseFeatureFlag.mockReturnValue(false)
    mockUseEnableCustomGasFeeEntry.mockReturnValue(false)
  })

  it('renders the canonical bridge banner in place of the gas row', () => {
    const { getByTestId, getByText, queryByTestId } = render(
      <TradeInfoRow bridgeChainId={UniverseChainId.Robinhood} gasInfo={gasInfo} />,
    )

    expect(getByTestId('canonical-bridge-banner')).toBeDefined()
    expect(getByText(String(UniverseChainId.Robinhood))).toBeDefined()
    expect(queryByTestId('gas-info-row')).toBeNull()
    expect(queryByTestId('custom-gas-info-row')).toBeNull()
  })

  it('preserves the standard gas row when there is no canonical bridge', () => {
    const { getByTestId, queryByTestId } = render(<TradeInfoRow gasInfo={gasInfo} />)

    expect(getByTestId('gas-info-row')).toBeDefined()
    expect(queryByTestId('canonical-bridge-banner')).toBeNull()
  })

  it('preserves the custom gas row when custom gas entry is enabled', () => {
    mockUseFeatureFlag.mockReturnValue(true)
    mockUseEnableCustomGasFeeEntry.mockReturnValue(true)

    const { getByTestId, queryByTestId } = render(<TradeInfoRow gasInfo={gasInfo} />)

    expect(getByTestId('custom-gas-info-row')).toBeDefined()
    expect(queryByTestId('canonical-bridge-banner')).toBeNull()
  })
})
