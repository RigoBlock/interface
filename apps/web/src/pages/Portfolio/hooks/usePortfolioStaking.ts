import { useEffect, useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { STAKING_PROXY_ADDRESSES } from 'constants/addresses'
import {
  selectChainStakingData,
  selectStakingDataNeedsFetch,
  selectUserStakingData,
  setChainStakingData,
  setStakingError,
} from 'state/portfolio/stakingSlice'
import { useTotalStakeBalances } from 'state/stake/hooks'
import { useEnabledChains } from 'uniswap/src/features/chains/hooks/useEnabledChains'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { isTestnetChain } from 'uniswap/src/features/chains/utils'
import { InterfaceState } from 'state/webReducer'
import { CurrencyAmount, Token } from '@uniswap/sdk-core'
import { GRG } from 'uniswap/src/constants/tokens'
import { useUSDCValue } from 'uniswap/src/features/transactions/hooks/useUSDCPrice'
import { useActiveSmartPool } from 'state/application/hooks'
import JSBI from 'jsbi'

// Serializable interface for Redux store
export interface SerializableStakingData {
  userFreeStake?: string // Raw amount as string
  userDelegatedStake?: string
  smartPoolFreeStake?: string  
  smartPoolDelegatedStake?: string
  chainId: UniverseChainId
  isLoading: boolean
  lastUpdated?: number
  error?: string
}

// Interface for component usage (with reconstructed CurrencyAmount objects)
export interface StakingData {
  userFreeStake?: CurrencyAmount<Token>
  userDelegatedStake?: CurrencyAmount<Token>
  smartPoolFreeStake?: CurrencyAmount<Token>
  smartPoolDelegatedStake?: CurrencyAmount<Token>
  chainId: UniverseChainId
  isLoading: boolean
  error?: string
}

// Utility functions for serialization
function serializeStakingAmount(amount?: CurrencyAmount<Token>): string | undefined {
  return amount?.quotient.toString()
}

function deserializeStakingAmount(amountStr?: string, chainId?: UniverseChainId): CurrencyAmount<Token> | undefined {
  if (!amountStr || !chainId) return undefined
  const token = GRG[chainId]
  if (!token) return undefined
  try {
    return CurrencyAmount.fromRawAmount(token, JSBI.BigInt(amountStr))
  } catch {
    return undefined
  }
}

// Hook to fetch and manage staking data for a single chain with Redux caching
function useChainStakingData({ userAddress, chainId, targetAddress }: {
  userAddress: string
  chainId: UniverseChainId  
  targetAddress?: string // The address we're actually displaying stakes for (could be smart pool)
}) {
  const dispatch = useDispatch()
  const needsFetch = useSelector((state: InterfaceState) =>
    selectStakingDataNeedsFetch(state, { userAddress, chainId }),
  )
  const cachedData = useSelector((state: InterfaceState) =>
    selectChainStakingData(state, { userAddress, chainId }),
  )

  // Call the hooks to get fresh data when needed
  const { userFreeStake, userDelegatedStake, smartPoolFreeStake, smartPoolDelegatedStake } = useTotalStakeBalances({ 
    address: userAddress, 
    smartPoolAddress: targetAddress,
    chainId
  })

  useEffect(() => {
    if (!userAddress) return
    
    // Only set loading state if we need to fetch and aren't already loading
    if (needsFetch && !cachedData?.isLoading) {
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
    }
  }, [dispatch, userAddress, chainId, needsFetch, cachedData?.isLoading])

  useEffect(() => {
    // Process data when we have valid stake information
    if (!userAddress) return
    
    // If we have data from useTotalStakeBalances, serialize and save it to store
    if (userFreeStake !== undefined || userDelegatedStake !== undefined || 
        smartPoolFreeStake !== undefined || smartPoolDelegatedStake !== undefined) {
      try {
        dispatch(
          setChainStakingData({
            userAddress,
            chainId,
            data: {
              // Serialize CurrencyAmount objects to strings for Redux
              userFreeStake: serializeStakingAmount(userFreeStake),
              userDelegatedStake: serializeStakingAmount(userDelegatedStake),
              smartPoolFreeStake: serializeStakingAmount(smartPoolFreeStake),
              smartPoolDelegatedStake: serializeStakingAmount(smartPoolDelegatedStake),
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
  }, [
    dispatch, 
    userAddress, 
    chainId, 
    // Use serialized values to avoid infinite re-renders from CurrencyAmount object references
    userFreeStake?.quotient.toString(),
    userDelegatedStake?.quotient.toString(),
    smartPoolFreeStake?.quotient.toString(),
    smartPoolDelegatedStake?.quotient.toString()
  ])
}

// Main hook for portfolio-level multi-chain staking data with proper target detection
export function usePortfolioStaking({ address }: { address?: string } = {}): {
  stakingChains: UniverseChainId[]
  stakingData: Partial<Record<UniverseChainId, StakingData>>
  totalStakeAmount?: CurrencyAmount<any>
  totalStakeUSD?: CurrencyAmount<any>
  hasAnyStake: boolean
  isLoading: boolean
  targetAddress?: string // The address we're displaying stakes for
  isViewingOwnStakes: boolean // Whether we're viewing user's own stakes vs smart pool stakes
} {
  const { chains: enabledChains, isTestnetModeEnabled } = useEnabledChains()
  const smartPoolAddress = useActiveSmartPool().address
  const [paramAddress] = new URLSearchParams(window.location.search).getAll('address')
  
  // Determine target address and context based on priority rules
  const { targetAddress, isViewingOwnStakes } = useMemo(() => {
    // Priority 1: URL address parameter
    if (paramAddress) {
      const isViewingOwnAddress = Boolean(address && paramAddress.toLowerCase() === address.toLowerCase())
      return {
        targetAddress: isViewingOwnAddress ? undefined : paramAddress, // undefined = user context, string = smart pool context
        isViewingOwnStakes: isViewingOwnAddress
      }
    }
    
    // Priority 2: Active smart pool (if no URL param)
    if (smartPoolAddress) {
      return {
        targetAddress: smartPoolAddress,
        isViewingOwnStakes: false
      }
    }
    
    // Priority 3: Default to user's own stakes
    return {
      targetAddress: undefined,
      isViewingOwnStakes: true
    }
  }, [paramAddress, smartPoolAddress, address])

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
    address ? selectUserStakingData(state, address) : {},
  )
  
  console.log('usePortfolioStaking - address:', address, 'allUserStakingData:', allUserStakingData, 'targetAddress:', targetAddress, 'isViewingOwnStakes:', isViewingOwnStakes)

  // Trigger data fetching for each chain using individual hooks (fixed number to avoid infinite loops)
  const maxChains = 10 // Reasonable limit for hook calls
  const chainsToProcess = stakingChains.slice(0, maxChains)
  
  // Pad the array to ensure we always call the same number of hooks
  const paddedChains: (UniverseChainId)[] = [...chainsToProcess]
  while (paddedChains.length < maxChains) {
    paddedChains.push(UniverseChainId.Mainnet) // Use mainnet as placeholder
  }

  // Call useChainStakingData for each potential chain (hooks must be called unconditionally)
  for (let i = 0; i < maxChains; i++) {
    const chainId = paddedChains[i]
    const isActiveChain = i < chainsToProcess.length
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useChainStakingData({ 
      userAddress: (isActiveChain && address) ? address : '',
      chainId, 
      targetAddress: (isActiveChain && address) ? targetAddress : undefined
    })
  }

  // Deserialize and filter staking data to only include our target chains
  const stakingData = useMemo(() => {
    const data: Partial<Record<UniverseChainId, StakingData>> = {}
    stakingChains.forEach((chainId) => {
      const serializedData = allUserStakingData[chainId]
      if (serializedData) {
        // Deserialize the data from Redux store
        data[chainId] = {
          userFreeStake: deserializeStakingAmount(serializedData.userFreeStake, chainId),
          userDelegatedStake: deserializeStakingAmount(serializedData.userDelegatedStake, chainId),
          smartPoolFreeStake: deserializeStakingAmount(serializedData.smartPoolFreeStake, chainId),
          smartPoolDelegatedStake: deserializeStakingAmount(serializedData.smartPoolDelegatedStake, chainId),
          chainId: serializedData.chainId,
          isLoading: serializedData.isLoading,
          error: serializedData.error,
        }
      }
    })
    return data
  }, [allUserStakingData, stakingChains])

  // Calculate totals based on viewing context
  const { totalStakeAmount, hasAnyStake } = useMemo(() => {
    if (!address || stakingChains.length === 0) {
      return { totalStakeAmount: undefined, hasAnyStake: false }
    }

    let hasStake = false
    let totalRawAmount = JSBI.BigInt(0)
    let primaryToken: Token | undefined
    let hasLoadingChains = false

    // Aggregate stakes across all chains
    for (const chainId of stakingChains) {
      const data = stakingData[chainId]
      
      // Set primary token (use mainnet GRG for USD calculations)
      if (!primaryToken) {
        primaryToken = GRG[UniverseChainId.Mainnet]
      }
      
      // If data is still loading for any chain, don't conclude "no stake" yet
      if (!data || data.isLoading) {
        hasLoadingChains = true
        continue
      }
      
      // Choose which stakes to display based on context
      const freeStake = isViewingOwnStakes ? data.userFreeStake : data.smartPoolFreeStake
      const delegatedStake = isViewingOwnStakes ? data.userDelegatedStake : data.smartPoolDelegatedStake
      
      if (freeStake && !freeStake.equalTo(0)) {
        hasStake = true
        totalRawAmount = JSBI.add(totalRawAmount, freeStake.quotient)
      }
      if (delegatedStake && !delegatedStake.equalTo(0)) {
        hasStake = true
        totalRawAmount = JSBI.add(totalRawAmount, delegatedStake.quotient)
      }
    }

    // If we have loading chains and no stake found yet, consider it as potentially having stake
    const effectiveHasStake = hasStake || (hasLoadingChains && !hasStake)

    return {
      totalStakeAmount: primaryToken && JSBI.greaterThan(totalRawAmount, JSBI.BigInt(0)) 
        ? CurrencyAmount.fromRawAmount(primaryToken, totalRawAmount) 
        : undefined,
      hasAnyStake: effectiveHasStake,
    }
  }, [address, stakingChains, stakingData, isViewingOwnStakes])

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
    targetAddress,
    isViewingOwnStakes,
  }
}
