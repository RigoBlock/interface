import { act, renderHook } from '@testing-library/react'
import { Token } from '@uniswap/sdk-core'
import { describe, expect, it, vi } from 'vitest'
import { q96ToPriceString } from '~/features/Toucan/Auction/BidDistributionChart/utils/q96'
import { useBidMaxValuationField } from '~/features/Toucan/Auction/hooks/useBidMaxValuationField'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('uniswap/src/features/transactions/hooks/useUSDCPrice', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useUSDCValue: () => null,
}))
vi.mock('uniswap/src/features/transactions/hooks/useFiatTokenConversion', () => ({
  useFiatTokenConversion: () => ({
    tokenToFiat: () => '',
    fiatToToken: () => null,
    usdPriceOfCurrency: undefined,
  }),
}))

// Sepolia auction 0xA91986C3…: floor 1e-08/token, tick 1e-10/token, ceiling 1e-06/token.
const DECIMALS = 18
const FLOOR = 792281625142643375900n
const TICK = 7922816251426433759n
const CEILING = 79228162514264337593543n
const TOP_TICK = FLOOR + TICK * 9900n

const BID_TOKEN = new Token(1, '0x0000000000000000000000000000000000000001', DECIMALS, 'ETH')

function priceString(q96: bigint): string {
  return q96ToPriceString({ q96Value: q96, bidTokenDecimals: DECIMALS, auctionTokenDecimals: DECIMALS })
}

function renderField() {
  return renderHook(() =>
    useBidMaxValuationField({
      bidCurrency: BID_TOKEN,
      currencyBalance: undefined,
      currencyInfo: undefined,
      bidTokenDecimals: DECIMALS,
      auctionTokenDecimals: DECIMALS,
      bidTokenSymbol: 'ETH',
      clearingPriceQ96: FLOOR,
      floorPriceQ96: FLOOR,
      tickSizeQ96: TICK,
      minMaxPriceQ96: FLOOR + TICK,
      maxBidPriceQ96: CEILING,
      minValidPriceDisplay: priceString(FLOOR + TICK),
      minValidPriceDisplayFormatted: priceString(FLOOR + TICK),
      defaultMaxValuationDisplay: priceString(FLOOR + TICK),
    }),
  )
}

describe('useBidMaxValuationField chart-tick writes', () => {
  it('caps a charted tick above the ceiling before it reaches the field', () => {
    // This path deliberately suppresses the next blur snap, so nothing downstream would
    // correct it: an uncapped write leaves the input showing an FDV that will not be bid.
    const { result } = renderField()

    act(() => result.current.maxValuationField.onTokenValueChange(priceString(TOP_TICK + TICK * 10n)))

    expect(result.current.maxValuationField.tokenValue).toBe(priceString(TOP_TICK))
    expect(result.current.maxValuationField.wasCappedToMax).toBe(true)
  })

  it('leaves a charted tick under the ceiling exactly as clicked', () => {
    const { result } = renderField()
    const clicked = priceString(FLOOR + TICK * 100n)

    act(() => result.current.maxValuationField.onTokenValueChange(clicked))

    expect(result.current.maxValuationField.tokenValue).toBe(clicked)
    expect(result.current.maxValuationField.wasCappedToMax).toBe(false)
  })

  it('keeps the cap and the hint across the blur that follows typing', () => {
    // Typed input reaches this same handler (BidMaxValuationInputV2.handleFdvChange ->
    // onTokenValueChange), and it suppresses the next blur snap — so blur early-returns and
    // cannot be what applies the cap or raises the hint. Both must survive it.
    const { result } = renderField()

    act(() => result.current.maxValuationField.onTokenValueChange(priceString(TOP_TICK + TICK * 10n)))
    act(() => result.current.maxValuationField.onBlur())

    expect(result.current.maxValuationField.tokenValue).toBe(priceString(TOP_TICK))
    expect(result.current.maxValuationField.wasCappedToMax).toBe(true)
  })

  it('leaves the highest legal tick alone rather than reporting it capped', () => {
    const { result } = renderField()

    act(() => result.current.maxValuationField.onTokenValueChange(priceString(TOP_TICK)))

    expect(result.current.maxValuationField.tokenValue).toBe(priceString(TOP_TICK))
    expect(result.current.maxValuationField.wasCappedToMax).toBe(false)
  })
})
