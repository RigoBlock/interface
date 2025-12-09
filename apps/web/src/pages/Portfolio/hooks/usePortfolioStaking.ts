import { useCallback, useEffect, useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { STAKING_PROXY_ADDRESSES } from 'constants/addresses'
import {
  ChainStakingData,
  selectChainStakingData,
  selectStakingDataNeedsFetch,
  selectUserStakingData,
  setChainStakingData,
  setStakingError,
} from 'state/portfolio/stakingSlice'
import { useTotalStakeBalances, useUnclaimedRewards, useUserStakeBalances } from 'state/stake/hooks'
import { getChainInfo } from 'uniswap/src/features/chains/chainInfo'
import { useEnabledChains } from 'uniswap/src/features/chains/hooks/useEnabledChains'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { isTestnetChain } from 'uniswap/src/features/chains/utils'
import { InterfaceState } from 'state/webReducer'
import { CurrencyAmount } from '@uniswap/sdk-core'
import { GRG } from 'uniswap/src/constants/tokens'
import { useUSDCValue } from 'uniswap/src/features/transactions/hooks/useUSDCPrice'
import { useActiveSmartPool } from 'state/application/hooks'
import { usePortfolioAddresses } from 'pages/Portfolio/hooks/usePortfolioAddresses'
import { useActiveAddresses } from 'features/accounts/store/hooks'

// Hook to fetch and manage staking data for a single chain
function useChainStakingData({ userAddress, chainId, smartPoolAddress }: {
  userAddress: string
  chainId: UniverseChainId
  smartPoolAddress?: string
}) {
  const dispatch = useDispatch()
  const needsFetch = useSelector((state: InterfaceState) =>
    selectStakingDataNeedsFetch(state, userAddress, chainId),
  )
  const cachedData = useSelector((state: InterfaceState) =>
    selectChainStakingData(state, userAddress, chainId),
  )

  // Only call hooks if we need fresh data
  const shouldFetch = needsFetch && !cachedData?.isLoading
  
  const { userFreeStake, userDelegatedStake, smartPoolFreeStake, smartPoolDelegatedStake } = useTotalStakeBalances({ 
    address: shouldFetch ? userAddress : undefined, 
    smartPoolAddress: shouldFetch ? smartPoolAddress : undefined,
    chainId
  })

  useEffect(() => {
    if (!shouldFetch) return

    // Set loading state
    dispatch(
      setChainStakingData({
        userAddress,
        chainId,
        data: {
          isLoading: true,
          error: undefined,
        },
      }),
    )
  }, [dispatch, userAddress, chainId, shouldFetch])

  useEffect(() => {
    if (!shouldFetch) return
    
    // Handle successful data fetch
    if (userFreeStake !== undefined || userDelegatedStake !== undefined || smartPoolFreeStake !== undefined || smartPoolDelegatedStake !== undefined) {
      try {
        dispatch(
          setChainStakingData({
            userAddress,
            chainId,
            data: {
              userFreeStake,
              userDelegatedStake,
              smartPoolFreeStake,
              smartPoolDelegatedStake,
              isLoading: false,
              error: undefined,
            },
          }),
        )
      } catch (error) {
        dispatch(
          setStakingError({
            userAddress,
            chainId,
            error: error instanceof Error ? error.message : 'Failed to fetch staking data',
          }),
        )
      }
    }
  }, [dispatch, userAddress, chainId, userFreeStake, userDelegatedStake, smartPoolFreeStake, smartPoolDelegatedStake, shouldFetch])

  return cachedData
}

// Main hook for portfolio-level multi-chain staking data
export function usePortfolioStaking(overrideAddress?: string, overrideSmartPoolAddress?: string): {
  stakingChains: UniverseChainId[]
  stakingData: Record<UniverseChainId, ChainStakingData>
  totalStakeAmount?: CurrencyAmount<any>
  totalStakeUSD?: CurrencyAmount<any>
  hasAnyStake: boolean
  isLoading: boolean
} {
  const { chains: enabledChains, isTestnetModeEnabled } = useEnabledChains()
  const portfolioAddresses = usePortfolioAddresses()
  const activeSmartPool = useActiveSmartPool()
  const connectedAddresses = useActiveAddresses()

  // Determine the context and addresses to use
  const { userAddress, smartPoolAddress } = useMemo(() => {
    // If explicit addresses are provided (e.g., from calling component), use those
    if (overrideAddress !== undefined) {
      return {
        userAddress: overrideAddress,
        smartPoolAddress: overrideSmartPoolAddress,
      }
    }

    // Default behavior: determine context based on portfolio addresses
    const primaryAddress = portfolioAddresses.evmAddress
    const connectedEvmAddress = connectedAddresses.evmAddress
    
    // Edge case: If URL param equals user's connected address, treat as no pool context
    // This prevents confusion when user clicks on their own address
    const isViewingOwnAddress = primaryAddress && connectedEvmAddress && 
      primaryAddress.toLowerCase() === connectedEvmAddress.toLowerCase()
    
    if (isViewingOwnAddress) {
      // User is viewing their own address - no smart pool context
      return {
        userAddress: primaryAddress,
        smartPoolAddress: undefined,
      }
    }
    
    // For other cases, use the provided smart pool address override
    return {
      userAddress: primaryAddress,
      smartPoolAddress: overrideSmartPoolAddress,
    }
  }, [overrideAddress, overrideSmartPoolAddress, portfolioAddresses, connectedAddresses])

  // Filter to only chains that have staking contracts
  const stakingChains = useMemo(() => {
    return enabledChains.filter((chainId) => {
      const hasStakingContract = STAKING_PROXY_ADDRESSES[chainId]
      const isTestnet = isTestnetChain(chainId)
      return hasStakingContract && isTestnet === isTestnetModeEnabled
    })
  }, [enabledChains, isTestnetModeEnabled])

  // Get cached staking data from Redux store
  const allUserStakingData = useSelector((state: InterfaceState) =>
    userAddress ? selectUserStakingData(state, userAddress) : {},
  )

  // Trigger data fetching for each chain (but hooks will only run if data is stale)
  const chainDataHooks = stakingChains.map((chainId) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useChainStakingData({ userAddress: userAddress || '', chainId, smartPoolAddress }),
  )

  // Filter staking data to only include our target chains
  const stakingData = useMemo(() => {
    const filteredData: Partial<Record<UniverseChainId, ChainStakingData>> = {}
    stakingChains.forEach((chainId) => {
      const data = allUserStakingData[chainId]
      if (data) {
        filteredData[chainId] = data
      }
    })
    return filteredData as Record<UniverseChainId, ChainStakingData>
  }, [allUserStakingData, stakingChains])

  // Calculate totals
  const { totalStakeAmount, hasAnyStake } = useMemo(() => {
    if (!userAddress || stakingChains.length === 0) {
      return { totalStakeAmount: undefined, hasAnyStake: false }
    }

    let hasStake = false
    let primaryStakeAmount: CurrencyAmount<any> | undefined

    // For now, use the first chain with stake data as the primary amount
    // In a full implementation, you'd want to aggregate all amounts
    for (const chainId of stakingChains) {
      const data = stakingData[chainId]
      
      // In smart pool context, show smart pool stakes
      // In user context, show user stakes
      const freeStake = smartPoolAddress ? data?.smartPoolFreeStake : data?.userFreeStake
      const delegatedStake = smartPoolAddress ? data?.smartPoolDelegatedStake : data?.userDelegatedStake
      
      if ((freeStake && !freeStake.equalTo(0)) || (delegatedStake && !delegatedStake.equalTo(0))) {
        hasStake = true
        if (!primaryStakeAmount) {
          // Combine free and delegated stakes
          primaryStakeAmount = freeStake && delegatedStake ? 
            freeStake.add(delegatedStake) : 
            (freeStake || delegatedStake)
          break
        }
      }
    }

    return {
      totalStakeAmount: primaryStakeAmount,
      hasAnyStake: hasStake,
    }
  }, [userAddress, stakingChains, stakingData, smartPoolAddress])

  // Get USD value for primary stake amount
  const totalStakeUSDValue = useUSDCValue(totalStakeAmount)

  // Check if any data is loading
  const isLoading = useMemo(() => {
    return Object.values(stakingData).some((data) => data.isLoading)
  }, [stakingData])

  return {
    stakingChains,
    stakingData,
    totalStakeAmount,
    totalStakeUSD: totalStakeUSDValue || undefined,
    hasAnyStake,
    isLoading,
  }
}

// Hook specifically for smart pool staking
export function useSmartPoolStaking(poolAddress?: string, userAddress?: string) {
  // For smart pool context, explicitly pass the pool address as smart pool address
  return usePortfolioStaking(userAddress, poolAddress)
}