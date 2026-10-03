import '~/test-utils/tokens/mocks'
import { within } from '@testing-library/react'
import { UniverseChainId } from '@universe/chains'
import { TestID } from '@universe/test'
import { DAI, USDC_ARBITRUM } from 'uniswap/src/constants/tokens'
import { PendingPortfolioLogo } from '~/components/AccountDrawer/MiniPortfolio/PendingPortfolioLogo'
import { render, screen } from '~/test-utils/render'

describe('PendingPortfolioLogo', () => {
  it('renders the animated pending ring', () => {
    render(<PendingPortfolioLogo chainId={UniverseChainId.Mainnet} currencies={[DAI]} />)

    const pendingLogo = screen.getByTestId(TestID.ActivityPopupPendingLogo)
    expect(pendingLogo).toBeInTheDocument()
    expect(within(pendingLogo).getByTestId(TestID.ActivityPopupPendingRing)).toBeInTheDocument()
  })

  it('preserves the lower-right network badge inside the pending logo frame', () => {
    // RigoBlock: DAI is not one of the fork's Arbitrum common bases (GRG is featured instead), so
    // its logo doesn't resolve offline; USDC does, exercising the badge path.
    render(<PendingPortfolioLogo chainId={UniverseChainId.ArbitrumOne} currencies={[USDC_ARBITRUM]} />)

    const pendingLogo = screen.getByTestId(TestID.ActivityPopupPendingLogo)
    expect(within(pendingLogo).getByTestId(TestID.ActivityPopupPendingRing)).toBeInTheDocument()
    expect(
      within(pendingLogo).getByTestId(`${TestID.NetworkLogoPrefix}${UniverseChainId.ArbitrumOne}`),
    ).toBeInTheDocument()
  })
})
