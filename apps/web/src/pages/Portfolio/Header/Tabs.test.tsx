import { TestID } from '@universe/test'
import { usePortfolioRoutes } from '~/pages/Portfolio/Header/hooks/usePortfolioRoutes'
import { PortfolioTabs } from '~/pages/Portfolio/Header/Tabs'
import { PortfolioTab } from '~/pages/Portfolio/types'
import { mocked } from '~/test-utils/mocked'
import { render, screen } from '~/test-utils/render'

vi.mock('~/pages/Portfolio/Header/hooks/usePortfolioRoutes', () => ({
  usePortfolioRoutes: vi.fn(),
}))

describe('PortfolioTabs', () => {
  beforeEach(() => {
    mocked(usePortfolioRoutes).mockReturnValue({
      tab: PortfolioTab.Overview,
      chainId: undefined,
      externalAddress: undefined,
      isExternalWallet: false,
      hasExplicitUrlAddress: false,
    })
  })

  // Header.test.tsx mocks PortfolioTabs away, so this unmocked render is the
  // one place the tabs' style pools hit the real compat emission layer —
  // which throws under NODE_ENV=test on any class outside the generated
  // safelist (the INFRA-3654 gap: borderBottomColor in hoverStyle).
  // RigoBlock: the Activity tab is intentionally hidden (Activity API doesn't support smart
  // pools), so assert the fork-specific Staking tab alongside Overview.
  it('renders the real tabs through the compat emission layer', () => {
    render(<PortfolioTabs />)
    expect(screen.getByTestId(TestID.PortfolioTabOverview)).toBeInTheDocument()
    expect(screen.getByTestId(TestID.PortfolioTabStaking)).toBeInTheDocument()
  })
})
