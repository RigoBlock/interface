import { UniverseChainId } from '@universe/chains'
import type { ParsedWarnings, Warning, WarningWithStyle } from 'uniswap/src/components/modals/WarningModal/types'
import { WarningAction, WarningLabel, WarningSeverity } from 'uniswap/src/components/modals/WarningModal/types'
import { GasAndWarningRows } from 'uniswap/src/features/transactions/swap/form/SwapFormScreen/SwapFormScreenDetails/SwapFormScreenFooter/GasAndWarningRows/GasAndWarningRows.native'
import type { GasInfo } from 'uniswap/src/features/transactions/swap/form/SwapFormScreen/SwapFormScreenDetails/SwapFormScreenFooter/GasAndWarningRows/types'
import { render } from 'uniswap/src/test/test-utils'

const mockUseParsedSwapWarnings = vi.hoisted(() => vi.fn())
const mockUseDebouncedGasInfo = vi.hoisted(() => vi.fn())
const mockUseCanonicalBridgeChainId = vi.hoisted(() => vi.fn())
const mockTradeInfoRowProps = vi.hoisted(() => vi.fn())

vi.mock('@universe/compliance', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@universe/compliance')>()
  return {
    ...actual,
    useIsBlockedAddress: (): { isBlocked: boolean; isBlockedLoading: boolean } => ({
      isBlocked: false,
      isBlockedLoading: false,
    }),
  }
})

vi.mock('uniswap/src/features/accounts/store/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('uniswap/src/features/accounts/store/hooks')>()
  return {
    ...actual,
    useActiveAddress: (): string => '0x0000000000000000000000000000000000000001',
  }
})

vi.mock('uniswap/src/features/transactions/swap/hooks/useSwapWarnings/useSwapWarnings', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('uniswap/src/features/transactions/swap/hooks/useSwapWarnings/useSwapWarnings')
    >()
  return {
    ...actual,
    useParsedSwapWarnings: mockUseParsedSwapWarnings,
  }
})

vi.mock(
  'uniswap/src/features/transactions/swap/form/SwapFormScreen/SwapFormScreenDetails/SwapFormScreenFooter/GasAndWarningRows/useResetGasCta',
  () => ({
    useResetGasCta: (): { showResetGas: boolean; onResetGas: () => void } => ({
      showResetGas: false,
      onResetGas: vi.fn(),
    }),
  }),
)

vi.mock(
  'uniswap/src/features/transactions/swap/form/SwapFormScreen/SwapFormScreenDetails/SwapFormScreenFooter/GasAndWarningRows/useDebouncedGasInfo',
  () => ({
    useDebouncedGasInfo: mockUseDebouncedGasInfo,
  }),
)

vi.mock(
  'uniswap/src/features/transactions/components/InsufficientNativeTokenWarning/InsufficientNativeTokenWarning',
  () => ({
    InsufficientNativeTokenWarning: (): null => null,
  }),
)

vi.mock(
  'uniswap/src/features/transactions/components/InsufficientNativeTokenWarning/useInsufficientNativeTokenWarning',
  () => ({
    useInsufficientNativeTokenWarning: (): null => null,
  }),
)

vi.mock(
  'uniswap/src/features/transactions/swap/form/SwapFormScreen/SwapFormScreenDetails/SwapFormScreenFooter/GasAndWarningRows/SwapWarningModal',
  () => ({
    SwapWarningModal: (): null => null,
  }),
)

vi.mock(
  'uniswap/src/features/transactions/swap/form/SwapFormScreen/SwapFormScreenDetails/SwapFormScreenFooter/GasAndWarningRows/TradeInfoRow/TradeInfoRow',
  () => ({
    TradeInfoRow: (props: { bridgeChainId?: UniverseChainId; gasInfo: GasInfo; warning?: Warning }): JSX.Element => {
      mockTradeInfoRowProps(props)
      return <div data-testid="trade-info-row" />
    },
  }),
)

vi.mock(
  'uniswap/src/features/transactions/swap/form/SwapFormScreen/SwapFormScreenDetails/SwapFormScreenFooter/GasAndWarningRows/useCanonicalBridgeChainId',
  () => ({
    useCanonicalBridgeChainId: mockUseCanonicalBridgeChainId,
  }),
)

const EMPTY_ROW_TEST_ID = 'gas-and-warning-rows-empty-row'

const noQuotesFoundWarning: Warning = {
  type: WarningLabel.NoQuotesFound,
  severity: WarningSeverity.Low,
  action: WarningAction.DisableReview,
  title: 'No quotes found',
}

const noQuotesFormWarning: WarningWithStyle = {
  warning: noQuotesFoundWarning,
  color: { text: '$neutral2', headerText: '$neutral1', background: '$surface2' },
  Icon: null,
  displayedInline: true,
}

function mockParsedWarnings(formScreenWarning?: WarningWithStyle): void {
  mockUseParsedSwapWarnings.mockReturnValue({
    formScreenWarning,
    insufficientGasFundsWarning: undefined,
    warnings: [],
  } satisfies Partial<ParsedWarnings>)
}

/**
 * The footer must always contain exactly two rows of content (visible or empty) so the
 * `DecimalPad` height calculation stays stable — see the WARNING banner in the component.
 */
describe('GasAndWarningRows footer height invariant', () => {
  beforeEach(() => {
    mockUseCanonicalBridgeChainId.mockReturnValue(undefined)
    mockUseDebouncedGasInfo.mockReturnValue({} as GasInfo)
    mockParsedWarnings(undefined)
  })

  it('renders two empty rows when there is no gas estimate and no warning', () => {
    const { queryAllByTestId } = render(<GasAndWarningRows />)

    expect(queryAllByTestId(EMPTY_ROW_TEST_ID)).toHaveLength(2)
    expect(mockTradeInfoRowProps.mock.lastCall?.[0]?.warning).toBeUndefined()
    expect(mockTradeInfoRowProps.mock.lastCall?.[0]?.bridgeChainId).toBeUndefined()
  })

  it('renders one empty row when gas is loaded and there is no warning', () => {
    mockUseDebouncedGasInfo.mockReturnValue({ fiatPriceFormatted: '$1.23' } as GasInfo)

    const { queryAllByTestId } = render(<GasAndWarningRows />)

    expect(queryAllByTestId(EMPTY_ROW_TEST_ID)).toHaveLength(1)
  })

  it('renders one empty row when an inline warning shows without a canonical bridge', () => {
    mockParsedWarnings(noQuotesFormWarning)

    const { queryAllByTestId, getByText } = render(<GasAndWarningRows />)

    expect(getByText('No quotes found')).toBeDefined()
    expect(mockTradeInfoRowProps.mock.lastCall?.[0]?.bridgeChainId).toBeUndefined()
    expect(queryAllByTestId(EMPTY_ROW_TEST_ID)).toHaveLength(1)
  })

  it('renders no empty rows when the canonical bridge banner fills the gas row slot', () => {
    mockParsedWarnings(noQuotesFormWarning)
    mockUseCanonicalBridgeChainId.mockReturnValue(UniverseChainId.Robinhood)

    const { queryAllByTestId, getByText } = render(<GasAndWarningRows />)

    expect(mockUseCanonicalBridgeChainId).toHaveBeenCalledWith(noQuotesFoundWarning)
    expect(mockTradeInfoRowProps.mock.lastCall?.[0]?.bridgeChainId).toBe(UniverseChainId.Robinhood)
    expect(mockTradeInfoRowProps.mock.lastCall?.[0]?.warning).toBeUndefined()
    expect(getByText('No quotes found')).toBeDefined()
    expect(queryAllByTestId(EMPTY_ROW_TEST_ID)).toHaveLength(0)
  })
})
