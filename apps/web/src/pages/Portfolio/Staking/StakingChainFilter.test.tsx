import { CurrencyAmount } from '@uniswap/sdk-core'
import type { UniverseChainId } from '@universe/chains'
import { GRG } from 'uniswap/src/constants/tokens'
import { PoolStakingInfo } from '~/pages/Portfolio/Staking/PoolStakingInfo'
import { UserStakingRewards } from '~/pages/Portfolio/Staking/UserStakingRewards'
import { render, screen } from '~/test-utils/render'

const mockChainId = vi.hoisted(() => ({ value: undefined as UniverseChainId | undefined }))
const mockPoolIdsByAddressAcrossChains = vi.hoisted(() => ({ value: undefined as { poolId: string; chainId: number }[] | undefined }))
const mockAllPools = vi.hoisted(() => ({ value: undefined as { id: string; chainId?: number }[] | undefined }))
const capturedPoolsArgs: ({ poolId: string; chainId: number }[] | undefined)[] = []

vi.mock('~/pages/Portfolio/Header/hooks/usePortfolioRoutes', () => ({
  usePortfolioRoutes: () => ({ chainId: mockChainId.value }),
}))

vi.mock('~/pages/Portfolio/hooks/usePortfolioAddress', () => ({
  usePortfolioAddress: () => ({ address: '0x0000000000000000000000000000000000000001', chainId: 1 }),
}))

vi.mock('~/hooks/useSmartPools', () => ({
  useSmartPoolFromAddress: () => undefined,
}))

vi.mock('~/state/pool/multichain', () => ({
  usePoolIdsByAddressAcrossChains: () => mockPoolIdsByAddressAcrossChains.value,
  useMultiChainAllPoolsData: () => ({ data: mockAllPools.value }),
}))

vi.mock('~/state/stake/hooks', () => ({
  useUnclaimedRewards: ({ pools }: { pools?: { poolId: string; chainId: number }[] }) => {
    capturedPoolsArgs.push(pools)
    return pools?.map((pool) => ({
      chainId: pool.chainId,
      poolId: pool.poolId,
      yieldAmount: CurrencyAmount.fromRawAmount(GRG[pool.chainId as UniverseChainId], 1000),
    }))
  },
}))

vi.mock('~/components/earn/HarvestYieldModal', () => ({
  default: () => null,
}))

const POOL_ENTRIES = [
  { poolId: '1', chainId: 1 },
  { poolId: '56', chainId: 56 },
]

describe('staking chain filter', () => {
  beforeEach(() => {
    mockChainId.value = undefined
    mockPoolIdsByAddressAcrossChains.value = POOL_ENTRIES
    mockAllPools.value = [
      { id: '1', chainId: 1 },
      { id: '56', chainId: 56 },
    ]
    capturedPoolsArgs.length = 0
  })

  describe('PoolStakingInfo', () => {
    it('queries rewards on all chains when no chain is selected', () => {
      render(<PoolStakingInfo poolAddress="0x0000000000000000000000000000000000000001" stakingPoolExists />)

      expect(capturedPoolsArgs.at(-1)).toEqual(POOL_ENTRIES)
      expect(screen.getByText('Ethereum')).toBeInTheDocument()
      expect(screen.getByText('BNB Chain')).toBeInTheDocument()
    })

    it('queries only the selected chain (BNB) when a chain is selected', () => {
      mockChainId.value = 56

      render(<PoolStakingInfo poolAddress="0x0000000000000000000000000000000000000001" stakingPoolExists />)

      expect(capturedPoolsArgs.at(-1)).toEqual([{ poolId: '56', chainId: 56 }])
      expect(screen.queryByText('Ethereum')).not.toBeInTheDocument()
      expect(screen.getByText('BNB Chain')).toBeInTheDocument()
    })
  })

  describe('UserStakingRewards', () => {
    it('queries rewards on all chains when no chain is selected', () => {
      render(<UserStakingRewards farmer="0x0000000000000000000000000000000000000001" />)

      expect(capturedPoolsArgs.at(-1)).toEqual(POOL_ENTRIES)
      expect(screen.getByText('Ethereum')).toBeInTheDocument()
      expect(screen.getByText('BNB Chain')).toBeInTheDocument()
    })

    it('queries only the selected chain (BNB) when a chain is selected', () => {
      mockChainId.value = 56

      render(<UserStakingRewards farmer="0x0000000000000000000000000000000000000001" />)

      expect(capturedPoolsArgs.at(-1)).toEqual([{ poolId: '56', chainId: 56 }])
      expect(screen.queryByText('Ethereum')).not.toBeInTheDocument()
      expect(screen.getByText('BNB Chain')).toBeInTheDocument()
    })
  })
})
