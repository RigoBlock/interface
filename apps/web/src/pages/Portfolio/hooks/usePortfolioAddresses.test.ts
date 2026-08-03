import { Platform } from 'uniswap/src/features/platforms/types/Platform'
import { SAMPLE_SEED_ADDRESS_1, SAMPLE_SEED_ADDRESS_2, SAMPLE_SEED_ADDRESS_3 } from 'uniswap/src/test/fixtures/gql/assets/constants'
import { useActiveAddresses } from '~/features/accounts/store/hooks'
import { usePortfolioRoutes } from '~/pages/Portfolio/Header/hooks/usePortfolioRoutes'
import { usePortfolioAddresses } from '~/pages/Portfolio/hooks/usePortfolioAddresses'
import { useActiveSmartPool } from '~/state/application/hooks'
import { mocked } from '~/test-utils/mocked'
import { renderHook } from '~/test-utils/render'

vi.mock('~/features/accounts/store/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/features/accounts/store/hooks')>()
  return {
    ...actual,
    useActiveAddresses: vi.fn(),
  }
})

vi.mock('~/pages/Portfolio/Header/hooks/usePortfolioRoutes', () => ({
  usePortfolioRoutes: vi.fn(),
}))

vi.mock('~/state/application/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/state/application/hooks')>()
  return {
    ...actual,
    useActiveSmartPool: vi.fn(),
  }
})

const MOCK_SVM_ADDRESS = '7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV'

describe('usePortfolioAddresses', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked(useActiveSmartPool).mockReturnValue({ address: null, name: null })
  })

  describe('external wallet (highest priority)', () => {
    it('should return external EVM address when viewing external wallet', () => {
      mocked(useActiveAddresses).mockReturnValue({
        evmAddress: SAMPLE_SEED_ADDRESS_1,
        svmAddress: undefined,
      })
      mocked(usePortfolioRoutes).mockReturnValue({
        externalAddress: {
          address: SAMPLE_SEED_ADDRESS_2,
          platform: Platform.EVM,
        },
        isExternalWallet: true,
        hasExplicitUrlAddress: true,
        tab: 'overview' as any,
      })

      const { result } = renderHook(() => usePortfolioAddresses())

      expect(result.current).toEqual({
        evmAddress: SAMPLE_SEED_ADDRESS_2,
        svmAddress: undefined,
        isExternalWallet: true,
      })
    })

    it('should return external SVM address when viewing external SVM wallet', () => {
      mocked(useActiveAddresses).mockReturnValue({
        evmAddress: SAMPLE_SEED_ADDRESS_1,
        svmAddress: undefined,
      })
      mocked(usePortfolioRoutes).mockReturnValue({
        externalAddress: { address: MOCK_SVM_ADDRESS, platform: Platform.SVM },
        isExternalWallet: true,
        hasExplicitUrlAddress: true,
        tab: 'overview' as any,
      })

      const { result } = renderHook(() => usePortfolioAddresses())

      expect(result.current).toEqual({
        evmAddress: undefined,
        svmAddress: MOCK_SVM_ADDRESS,
        isExternalWallet: true,
      })
    })

    it('should prioritize external wallet over connected wallet', () => {
      // User is connected and is viewing someone else's wallet
      mocked(useActiveAddresses).mockReturnValue({
        evmAddress: SAMPLE_SEED_ADDRESS_1,
        svmAddress: MOCK_SVM_ADDRESS,
      })
      mocked(usePortfolioRoutes).mockReturnValue({
        externalAddress: {
          address: SAMPLE_SEED_ADDRESS_2,
          platform: Platform.EVM,
        },
        isExternalWallet: true,
        hasExplicitUrlAddress: true,
        tab: 'overview' as any,
      })

      const { result } = renderHook(() => usePortfolioAddresses())

      expect(result.current).toEqual({
        evmAddress: SAMPLE_SEED_ADDRESS_2,
        svmAddress: undefined,
        isExternalWallet: true,
      })
    })
  })

  describe('active smart pool (second priority)', () => {
    it('should return active smart pool when no URL address is present', () => {
      mocked(useActiveAddresses).mockReturnValue({
        evmAddress: SAMPLE_SEED_ADDRESS_1,
        svmAddress: undefined,
      })
      mocked(useActiveSmartPool).mockReturnValue({
        address: SAMPLE_SEED_ADDRESS_3,
        name: 'Test Pool',
      })
      mocked(usePortfolioRoutes).mockReturnValue({
        externalAddress: undefined,
        isExternalWallet: false,
        hasExplicitUrlAddress: false,
        tab: 'overview' as any,
      })

      const { result } = renderHook(() => usePortfolioAddresses())

      expect(result.current).toEqual({
        evmAddress: SAMPLE_SEED_ADDRESS_3,
        svmAddress: undefined,
        isExternalWallet: true,
      })
    })
  })

  describe('connected wallet (third priority)', () => {
    it('should return connected EVM address when connected', () => {
      mocked(useActiveAddresses).mockReturnValue({
        evmAddress: SAMPLE_SEED_ADDRESS_1,
        svmAddress: undefined,
      })
      mocked(usePortfolioRoutes).mockReturnValue({
        externalAddress: undefined,
        isExternalWallet: false,
        hasExplicitUrlAddress: false,
        tab: 'overview' as any,
      })

      const { result } = renderHook(() => usePortfolioAddresses())

      expect(result.current).toEqual({
        evmAddress: SAMPLE_SEED_ADDRESS_1,
        svmAddress: undefined,
        isExternalWallet: false,
      })
    })

    it('should return connected SVM address when connected', () => {
      mocked(useActiveAddresses).mockReturnValue({
        evmAddress: undefined,
        svmAddress: MOCK_SVM_ADDRESS,
      })
      mocked(usePortfolioRoutes).mockReturnValue({
        externalAddress: undefined,
        isExternalWallet: false,
        hasExplicitUrlAddress: false,
        tab: 'overview' as any,
      })

      const { result } = renderHook(() => usePortfolioAddresses())

      expect(result.current).toEqual({
        evmAddress: undefined,
        svmAddress: MOCK_SVM_ADDRESS,
        isExternalWallet: false,
      })
    })
  })

  describe('disconnected (fallback)', () => {
    it('should return undefined addresses when no wallet is connected and no smart pool is active', () => {
      mocked(useActiveAddresses).mockReturnValue({
        evmAddress: undefined,
        svmAddress: undefined,
      })
      mocked(usePortfolioRoutes).mockReturnValue({
        externalAddress: undefined,
        isExternalWallet: false,
        hasExplicitUrlAddress: false,
        tab: 'overview' as any,
      })

      const { result } = renderHook(() => usePortfolioAddresses())

      expect(result.current).toEqual({
        evmAddress: undefined,
        svmAddress: undefined,
        isExternalWallet: false,
      })
    })
  })
})
