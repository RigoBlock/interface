import '~/test-utils/tokens/mocks'
import { UniverseChainId } from '@universe/chains'
import { GRG } from 'uniswap/src/constants/tokens'
import { USDC_ARBITRUM, USDC_MAINNET } from 'uniswap/src/constants/tokens'
import { PortfolioLogo } from '~/components/AccountDrawer/MiniPortfolio/PortfolioLogo'
import { render, screen } from '~/test-utils/render'

describe('PortfolioLogo', () => {
  // The fork swaps DAI for GRG in COMMON_BASES, so GRG is the currency that resolves
  // synchronously in tests (upstream used DAI here).
  it('renders without L2 icon', () => {
    const { container } = render(
      <PortfolioLogo chainId={UniverseChainId.Mainnet} currencies={[GRG[UniverseChainId.Mainnet], USDC_MAINNET]} />,
    )
    expect(container).toMatchSnapshot()
  })

  it('renders with L2 icon', () => {
    const { container } = render(
      <PortfolioLogo
        chainId={UniverseChainId.ArbitrumOne}
        currencies={[GRG[UniverseChainId.ArbitrumOne], USDC_ARBITRUM]}
      />,
    )
    expect(container).toMatchSnapshot()
  })

  // A just-launched token isn't indexed yet, so its activity carries a raw logo URL via `images`
  // rather than a Currency. On testnets this must still render (regression: the testnet branch used
  // to short-circuit to a blank CurrencyLogo(undefined) and drop the image, leaving the launch toast
  // logo-less).
  it('renders an image-based logo on testnets when no currency is available', () => {
    render(
      <PortfolioLogo
        chainId={UniverseChainId.Sepolia}
        images={['https://gateway.pinata.cloud/ipfs/some-cid']}
        fallbackSymbols={['MNT']}
      />,
    )
    expect(screen.getByTestId('token-logo')).toBeInTheDocument()
  })
})
