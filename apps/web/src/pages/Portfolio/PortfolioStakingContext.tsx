import { CurrencyAmount } from '@uniswap/sdk-core'
import { createContext, useContext } from 'react'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { usePortfolioStaking, StakingData } from '~/pages/Portfolio/hooks/usePortfolioStaking'

export interface PortfolioStakingContextValue {
  stakingChains: UniverseChainId[]
  stakingData: Partial<Record<UniverseChainId, StakingData>>
  totalStakeAmount?: CurrencyAmount<any>
  totalStakeUSD?: CurrencyAmount<any>
  grgPriceUSD?: number
  hasAnyStake: boolean
  isLoading: boolean
  targetAddress?: string
  isViewingOwnStakes: boolean
}

const PortfolioStakingContext = createContext<PortfolioStakingContextValue | undefined>(undefined)

interface PortfolioStakingProviderProps {
  address?: string
  chainId?: UniverseChainId
  children: React.ReactNode
}

export function PortfolioStakingProvider({ address, chainId, children }: PortfolioStakingProviderProps): JSX.Element {
  const value = usePortfolioStaking({ address, chainId })
  return <PortfolioStakingContext.Provider value={value}>{children}</PortfolioStakingContext.Provider>
}

export function usePortfolioStakingContext(): PortfolioStakingContextValue {
  const context = useContext(PortfolioStakingContext)
  if (!context) {
    throw new Error('usePortfolioStakingContext must be used within a PortfolioStakingProvider')
  }
  return context
}

export function useOptionalPortfolioStakingContext(): PortfolioStakingContextValue | undefined {
  return useContext(PortfolioStakingContext)
}
