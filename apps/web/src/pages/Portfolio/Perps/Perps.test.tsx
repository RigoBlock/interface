import type { UniverseChainId } from '@universe/chains'
import { PortfolioPerps } from '~/pages/Portfolio/Perps/Perps'
import { render, screen } from '~/test-utils/render'

const mockChainId = vi.hoisted(() => ({ value: undefined as UniverseChainId | undefined }))

vi.mock('~/pages/Portfolio/Header/hooks/usePortfolioRoutes', () => ({
  usePortfolioRoutes: () => ({ chainId: mockChainId.value }),
}))

vi.mock('~/pages/Portfolio/Perps/gmx/GmxPerpsSection', () => ({
  GmxPerpsSection: () => <div data-testid="gmx-perps-section" />,
}))

vi.mock('~/pages/Portfolio/Perps/hyperliquid/HyperliquidPerpsSection', () => ({
  HyperliquidPerpsSection: () => <div data-testid="hyperliquid-perps-section" />,
}))

describe('PortfolioPerps', () => {
  beforeEach(() => {
    mockChainId.value = undefined
  })

  it('shows both perps sections on All Networks', () => {
    render(<PortfolioPerps />)

    expect(screen.getByTestId('gmx-perps-section')).toBeInTheDocument()
    expect(screen.getByTestId('hyperliquid-perps-section')).toBeInTheDocument()
  })

  it('hides both sections when an unrelated chain (BNB) is selected', () => {
    mockChainId.value = 56

    render(<PortfolioPerps />)

    expect(screen.queryByTestId('gmx-perps-section')).not.toBeInTheDocument()
    expect(screen.queryByTestId('hyperliquid-perps-section')).not.toBeInTheDocument()
  })

  it('shows only the GMX section on Arbitrum', () => {
    mockChainId.value = 42161

    render(<PortfolioPerps />)

    expect(screen.getByTestId('gmx-perps-section')).toBeInTheDocument()
    expect(screen.queryByTestId('hyperliquid-perps-section')).not.toBeInTheDocument()
  })

  it('shows only the Hyperliquid section on HyperEVM (999)', () => {
    mockChainId.value = 999

    render(<PortfolioPerps />)

    expect(screen.queryByTestId('gmx-perps-section')).not.toBeInTheDocument()
    expect(screen.getByTestId('hyperliquid-perps-section')).toBeInTheDocument()
  })
})
