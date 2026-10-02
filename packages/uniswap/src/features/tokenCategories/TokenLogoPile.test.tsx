import { TokenLogoPile } from 'uniswap/src/features/tokenCategories/TokenLogoPile'
import type { TokenCategoryTopToken } from 'uniswap/src/features/tokenCategories/types'
import { render } from 'uniswap/src/test/test-utils'

function makeToken(symbol: string, logoUrl = `https://logos.test/${symbol}.png`): TokenCategoryTopToken {
  return { chainId: 1, address: `0x${symbol}`, symbol, logoUrl }
}

describe('TokenLogoPile', () => {
  it('renders a single logo', () => {
    const { getAllByTestId } = render(<TokenLogoPile size={20} tokens={[makeToken('UNI')]} />)
    expect(getAllByTestId('token-logo')).toHaveLength(1)
  })

  it('renders two logos', () => {
    const { getAllByTestId } = render(<TokenLogoPile size={20} tokens={[makeToken('UNI'), makeToken('ETH')]} />)
    expect(getAllByTestId('token-logo')).toHaveLength(2)
  })

  it('caps rendering at three logos', () => {
    const tokens = [makeToken('UNI'), makeToken('ETH'), makeToken('USDC'), makeToken('WBTC')]
    const { getAllByTestId } = render(<TokenLogoPile size={20} tokens={tokens} />)
    expect(getAllByTestId('token-logo')).toHaveLength(3)
  })

  it('falls back to the symbol letters when a logo url is missing', () => {
    const { queryByText } = render(<TokenLogoPile size={20} tokens={[makeToken('UNI', '')]} />)
    expect(queryByText('UNI')).not.toBeNull()
  })
})
