// TODO: check use type
/* eslint-disable max-params */

import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { BigNumber } from '@ethersproject/bignumber'
import { CurrencyAmount, Token } from '@uniswap/sdk-core'
import { UniverseChainId } from 'uniswap/src/features/chains/types'

export interface ChainStakingData {
  chainId: UniverseChainId
  userFreeStake?: CurrencyAmount<Token>
  userDelegatedStake?: CurrencyAmount<Token>
  smartPoolFreeStake?: CurrencyAmount<Token>
  smartPoolDelegatedStake?: CurrencyAmount<Token>
  isLoading: boolean
  lastUpdated?: number
  error?: string
}

export interface PortfolioStakingState {
  // Multi-chain staking data by address
  stakingDataByAddress: Record<Address, Partial<Record<UniverseChainId, ChainStakingData>>>
  
  // Smart pool specific staking data by pool address
  smartPoolStakingByAddress: Record<Address, Record<Address, ChainStakingData>> // pool address -> user address -> data
  
  // Global loading state
  isInitializing: boolean
}

export const initialPortfolioStakingState: PortfolioStakingState = {
  stakingDataByAddress: {},
  smartPoolStakingByAddress: {},
  isInitializing: false,
}

const STAKING_DATA_MAX_AGE = 5 * 60 * 1000 // 5 minutes

const slice = createSlice({
  name: 'portfolioStaking',
  initialState: initialPortfolioStakingState,
  reducers: {
    setInitializing: (state, action: PayloadAction<boolean>) => {
      state.isInitializing = action.payload
    },

    setChainStakingData: (
      state,
      action: PayloadAction<{
        userAddress: Address
        chainId: UniverseChainId
        data: Omit<ChainStakingData, 'chainId' | 'lastUpdated'> & { lastUpdated?: number }
      }>,
    ) => {
      const { userAddress, chainId, data } = action.payload
      
      if (!state.stakingDataByAddress[userAddress]) {
        state.stakingDataByAddress[userAddress] = {}
      }
      
      state.stakingDataByAddress[userAddress][chainId] = {
        ...data,
        chainId,
        lastUpdated: Date.now(),
      }
    },

    setSmartPoolStakingData: (
      state,
      action: PayloadAction<{
        poolAddress: Address
        userAddress: Address
        chainId: UniverseChainId
        data: Omit<ChainStakingData, 'chainId' | 'lastUpdated'> & { lastUpdated?: number }
      }>,
    ) => {
      const { poolAddress, userAddress, chainId, data } = action.payload
      
      if (!state.smartPoolStakingByAddress[poolAddress]) {
        state.smartPoolStakingByAddress[poolAddress] = {}
      }
      
      if (!state.smartPoolStakingByAddress[poolAddress][userAddress]) {
        state.smartPoolStakingByAddress[poolAddress][userAddress] = {} as ChainStakingData
      }
      
      state.smartPoolStakingByAddress[poolAddress][userAddress] = {
        ...data,
        chainId,
        lastUpdated: Date.now(),
      }
    },

    setStakingError: (
      state,
      action: PayloadAction<{
        userAddress: Address
        chainId: UniverseChainId
        error: string
      }>,
    ) => {
      const { userAddress, chainId, error } = action.payload
      
      if (!state.stakingDataByAddress[userAddress]) {
        state.stakingDataByAddress[userAddress] = {}
      }
      
      if (!state.stakingDataByAddress[userAddress][chainId]) {
        state.stakingDataByAddress[userAddress][chainId] = {
          chainId,
          isLoading: false,
          error,
          lastUpdated: Date.now(),
        }
      } else {
        state.stakingDataByAddress[userAddress][chainId].error = error
        state.stakingDataByAddress[userAddress][chainId].isLoading = false
      }
    },

    clearStakingData: (
      state,
      action: PayloadAction<{
        userAddress?: Address
        chainId?: UniverseChainId
      }>,
    ) => {
      const { userAddress, chainId } = action.payload
      
      if (userAddress && chainId) {
        // Clear specific chain for specific user
        if (state.stakingDataByAddress[userAddress]) {
          delete state.stakingDataByAddress[userAddress][chainId]
        }
      } else if (userAddress) {
        // Clear all data for specific user
        delete state.stakingDataByAddress[userAddress]
      } else {
        // Clear all data
        state.stakingDataByAddress = {}
        state.smartPoolStakingByAddress = {}
      }
    },

    // Clean up old data
    cleanupExpiredStakingData: (state) => {
      const now = Date.now()
      
      Object.keys(state.stakingDataByAddress).forEach((userAddress) => {
        Object.keys(state.stakingDataByAddress[userAddress]).forEach((chainId) => {
          const data = state.stakingDataByAddress[userAddress][Number(chainId) as UniverseChainId]
          if (data?.lastUpdated && now - data.lastUpdated > STAKING_DATA_MAX_AGE) {
            delete state.stakingDataByAddress[userAddress][Number(chainId) as UniverseChainId]
          }
        })
        
        // Remove empty user objects
        if (Object.keys(state.stakingDataByAddress[userAddress]).length === 0) {
          delete state.stakingDataByAddress[userAddress]
        }
      })
    },
  },
})

export const {
  setInitializing,
  setChainStakingData,
  setSmartPoolStakingData,
  setStakingError,
  clearStakingData,
  cleanupExpiredStakingData,
} = slice.actions

export const portfolioStakingReducer = slice.reducer

// Selectors
export const selectPortfolioStaking = (state: { portfolioStaking: PortfolioStakingState }) => state.portfolioStaking

export const selectUserStakingData = (state: { portfolioStaking: PortfolioStakingState }, userAddress: Address) =>
  state.portfolioStaking.stakingDataByAddress[userAddress] || {}

export const selectChainStakingData = (
  state: { portfolioStaking: PortfolioStakingState },
  userAddress: Address,
  chainId: UniverseChainId,
) => state.portfolioStaking.stakingDataByAddress[userAddress]?.[chainId]

export const selectSmartPoolStakingData = (
  state: { portfolioStaking: PortfolioStakingState },
  poolAddress: Address,
  userAddress: Address,
) => state.portfolioStaking.smartPoolStakingByAddress[poolAddress]?.[userAddress]

export const selectStakingDataNeedsFetch = (
  state: { portfolioStaking: PortfolioStakingState },
  userAddress: Address,
  chainId: UniverseChainId,
) => {
  const data = selectChainStakingData(state, userAddress, chainId)
  if (!data) return true
  if (data.isLoading) return false
  if (data.error) return true
  if (!data.lastUpdated) return true
  return Date.now() - data.lastUpdated > STAKING_DATA_MAX_AGE
}