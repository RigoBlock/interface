import { FeatureFlags, useFeatureFlag } from '@universe/gating'
import { ElementName } from 'uniswap/src/features/telemetry/constants'
import { useTabsContent } from '~/components/NavBar/Tabs/TabsContent'
import { usePortfolioRoutes } from '~/pages/Portfolio/Header/hooks/usePortfolioRoutes'
import { PortfolioTab } from '~/pages/Portfolio/types'
import { useOperatedPoolAddresses } from '~/state/pool/hooks'
import { mocked } from '~/test-utils/mocked'
import { renderHook } from '~/test-utils/render'

vi.mock('@universe/gating', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@universe/gating')>()),
  useFeatureFlag: vi.fn(),
}))

vi.mock('~/pages/Portfolio/Header/hooks/usePortfolioRoutes', () => ({
  usePortfolioRoutes: vi.fn(),
}))

vi.mock('~/state/pool/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/state/pool/hooks')>()),
  useOperatedPoolAddresses: vi.fn(),
}))

function getTabState(elementName: ElementName): boolean | undefined {
  const { result } = renderHook(() => useTabsContent())
  return result.current.find((tab) => tab.elementName === elementName)?.isActive
}

describe('useTabsContent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.pushState({}, '', '/')
    mocked(useFeatureFlag).mockImplementation((flag) => flag === FeatureFlags.PortfolioPoolsBalances)
    mocked(usePortfolioRoutes).mockReturnValue({
      tab: PortfolioTab.Overview,
      chainId: undefined,
      externalAddress: undefined,
      isExternalWallet: false,
      hasExplicitUrlAddress: false,
    })
    // Most tab tests exercise the Pool tab's active state, which requires an operator wallet.
    mocked(useOperatedPoolAddresses).mockReturnValue(new Set(['0xOperatedPool']))
  })

  it('should keep Pool active on create-position pages without a Portfolio entry point', () => {
    window.history.pushState({}, '', '/positions/add/new')

    expect(getTabState(ElementName.NavbarPoolTab)).toBe(true)
    expect(getTabState(ElementName.NavbarPortfolioTab)).toBe(false)
  })

  it('should make Portfolio active on create-position pages with a Portfolio Pools entry point', () => {
    window.history.pushState(
      {},
      '',
      `/positions/add/new?${new URLSearchParams({ entryPoint: '/portfolio/pools' }).toString()}`,
    )

    expect(getTabState(ElementName.NavbarPoolTab)).toBe(false)
    expect(getTabState(ElementName.NavbarPortfolioTab)).toBe(true)
  })

  it('should make Portfolio active from a location state Portfolio Pools entry point', () => {
    window.history.pushState({ usr: { entryPoint: '/portfolio/pools' } }, '', '/positions/add/new')

    expect(getTabState(ElementName.NavbarPoolTab)).toBe(false)
    expect(getTabState(ElementName.NavbarPortfolioTab)).toBe(true)
  })

  it('should keep Pool active when the Portfolio Pools entry point is malformed', () => {
    window.history.pushState(
      {},
      '',
      `/positions/add/new?${new URLSearchParams({ entryPoint: '//evil.com/portfolio/pools' }).toString()}`,
    )

    expect(getTabState(ElementName.NavbarPoolTab)).toBe(true)
    expect(getTabState(ElementName.NavbarPortfolioTab)).toBe(false)
  })

  it('should keep Pool active when the Portfolio Pools entry point has an invalid address segment', () => {
    window.history.pushState(
      {},
      '',
      `/positions/add/new?${new URLSearchParams({ entryPoint: '/portfolio/not-an-address/pools' }).toString()}`,
    )

    expect(getTabState(ElementName.NavbarPoolTab)).toBe(true)
    expect(getTabState(ElementName.NavbarPortfolioTab)).toBe(false)
  })

  it('should hide the Pool tab when the wallet operates no pools', () => {
    mocked(useOperatedPoolAddresses).mockReturnValue(new Set())
    const { result } = renderHook(() => useTabsContent())

    expect(result.current.some((tab) => tab.elementName === ElementName.NavbarPoolTab)).toBe(false)
  })
})
