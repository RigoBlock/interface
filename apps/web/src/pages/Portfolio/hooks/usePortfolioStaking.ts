import { CurrencyAmount, Token } from '@uniswap/sdk-core'
import JSBI from 'jsbi'
import { useEffect, useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { GRG, USDC_MAINNET } from 'uniswap/src/constants/tokens'
import { usePortfolioDataMultichain } from 'uniswap/src/features/dataApi/balances/balancesRest'
import { PortfolioMultichainBalance } from 'uniswap/src/features/dataApi/types'
import { useEnabledChains } from 'uniswap/src/features/chains/hooks/useEnabledChains'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { isTestnetChain } from 'uniswap/src/features/chains/utils'
import { STAKING_PROXY_ADDRESSES } from '~/constants/addresses'
import { useActiveAddresses } from '~/features/accounts/store/hooks'
import {
  selectChainStakingData,
  selectStakingDataNeedsFetch,
  selectUserStakingData,
  setChainStakingData,
  setStakingError,
} from '~/state/portfolio/stakingSlice'
import { useTotalStakeBalances } from '~/state/stake/hooks'
import { InterfaceState } from '~/state/webReducer'
import { assume0xAddress } from '~/utils/wagmi'
import { isValidHexString } from 'utilities/src/addresses/hex'
import { Platform } from 'uniswap/src/features/platforms/types/Platform'
import { areAddressesEqual } from 'uniswap/src/utils/addresses'

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
  if (!amountStr || !chainId) {return undefined}
  const token = GRG[chainId]
  try {
    return CurrencyAmount.fromRawAmount(token, JSBI.BigInt(amountStr))
  } catch {
    return undefined
  }
}

// Read the GRG USD price from the same REST portfolio data source that powers the
// Tokens tab. This avoids the quote-API flicker that useUSDCValue triggers and
// works even when the legacy spot-price feed does not have a GRG price.
function useGrgPriceFromPortfolio(address?: string): number | undefined {
  const { data: portfolioData } = usePortfolioDataMultichain({
    evmAddress: address,
    skip: !address,
  })

  return useMemo(() => {
    if (!portfolioData) {
      return undefined
    }

    const grg = Object.values(portfolioData).find(
      (balance): balance is PortfolioMultichainBalance =>
        balance.symbol === 'GRG' ||
        balance.tokens.some((token) => token.currencyInfo.currency.symbol === 'GRG'),
    )

    return grg?.priceUsd ?? undefined
  }, [portfolioData])
}

// Convert a GRG amount to its USD value using the portfolio-derived GRG price.
// This is the same price source used for portfolio tokens, so it avoids the extra
// quote-API round trip that useUSDCValue triggers for every refresh.
export function useGrgFiatValue(
  grgAmount?: CurrencyAmount<Token>,
  priceUSD?: number,
): CurrencyAmount<Token> | undefined {
  const mainnetGRG = GRG[UniverseChainId.Mainnet]

  return useMemo(() => {
    if (!grgAmount || priceUSD === undefined) {
      return undefined
    }
    try {
      const mainnetAmount = CurrencyAmount.fromRawAmount(mainnetGRG, grgAmount.quotient)
      const pricePrecision = BigInt(10 ** USDC_MAINNET.decimals)
      const priceRaw = BigInt(Math.floor(priceUSD * Number(pricePrecision)))
      const usdRaw = (BigInt(mainnetAmount.quotient.toString()) * priceRaw) / BigInt(10 ** mainnetGRG.decimals)
      return CurrencyAmount.fromRawAmount(USDC_MAINNET, usdRaw.toString())
    } catch {
      return undefined
    }
  }, [grgAmount, priceUSD, mainnetGRG])
}

// Hook to fetch and manage staking data for a single chain with Redux caching
function useChainStakingData({
  userAddress,
  chainId,
  targetAddress,
}: {
  userAddress: `0x${string}` | ''
  chainId: UniverseChainId
  targetAddress?: string // The address we're actually displaying stakes for (could be smart pool)
}) {
  const dispatch = useDispatch()
  const hexAddress = userAddress as `0x${string}` | undefined
  const needsFetch = useSelector((state: InterfaceState) =>
    hexAddress ? selectStakingDataNeedsFetch(state, { userAddress: hexAddress, chainId }) : true,
  )
  const cachedData = useSelector((state: InterfaceState) =>
    hexAddress ? selectChainStakingData(state, { userAddress: hexAddress, chainId }) : undefined,
  )

  // Call the hooks to get fresh data when needed
  const { userFreeStake, userDelegatedStake, smartPoolFreeStake, smartPoolDelegatedStake } = useTotalStakeBalances({
    address: userAddress,
    smartPoolAddress: targetAddress,
    chainId,
  })

  // Serialize values to avoid infinite re-renders from CurrencyAmount object references
  const serializedUserFreeStake = serializeStakingAmount(userFreeStake)
  const serializedUserDelegatedStake = serializeStakingAmount(userDelegatedStake)
  const serializedSmartPoolFreeStake = serializeStakingAmount(smartPoolFreeStake)
  const serializedSmartPoolDelegatedStake = serializeStakingAmount(smartPoolDelegatedStake)

  useEffect(() => {
    if (!userAddress) {return}

    // Only set loading state if we need to fetch and aren't already loading
    if (needsFetch && !cachedData?.isLoading) {
      dispatch(
        setChainStakingData({
          userAddress,
          chainId,
          data: {
            isLoading: true,
            error: undefined,
            // Preserve the last-known amounts so the UI doesn't flash to zero
            // while the quote API refreshes in the background.
            userFreeStake: cachedData?.userFreeStake,
            userDelegatedStake: cachedData?.userDelegatedStake,
            smartPoolFreeStake: cachedData?.smartPoolFreeStake,
            smartPoolDelegatedStake: cachedData?.smartPoolDelegatedStake,
          },
        }),
      )
    }
  }, [dispatch, userAddress, chainId, needsFetch, cachedData?.isLoading, cachedData?.userFreeStake, cachedData?.userDelegatedStake, cachedData?.smartPoolFreeStake, cachedData?.smartPoolDelegatedStake])

  useEffect(() => {
    // Process data when we have valid stake information
    if (!userAddress) {return}

    // If we have data from useTotalStakeBalances, serialize and save it to store
    if (
      serializedUserFreeStake !== undefined ||
      serializedUserDelegatedStake !== undefined ||
      serializedSmartPoolFreeStake !== undefined ||
      serializedSmartPoolDelegatedStake !== undefined
    ) {
      try {
        dispatch(
          setChainStakingData({
            userAddress,
            chainId,
            data: {
              // Serialize CurrencyAmount objects to strings for Redux
              userFreeStake: serializedUserFreeStake,
              userDelegatedStake: serializedUserDelegatedStake,
              smartPoolFreeStake: serializedSmartPoolFreeStake,
              smartPoolDelegatedStake: serializedSmartPoolDelegatedStake,
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
    serializedUserFreeStake,
    serializedUserDelegatedStake,
    serializedSmartPoolFreeStake,
    serializedSmartPoolDelegatedStake,
  ])
}

// Main hook for portfolio-level multi-chain staking data with proper target detection
export function usePortfolioStaking({
  address,
  chainId: filterChainId,
}: {
  address?: string
  chainId?: UniverseChainId
} = {}): {
  stakingChains: UniverseChainId[]
  stakingData: Partial<Record<UniverseChainId, StakingData>>
  totalStakeAmount?: CurrencyAmount<any>
  totalStakeUSD?: CurrencyAmount<any>
  grgPriceUSD?: number
  hasAnyStake: boolean
  isLoading: boolean
  targetAddress?: string // The address we're displaying stakes for
  isViewingOwnStakes: boolean // Whether we're viewing user's own stakes vs smart pool stakes
} {
  const { chains: enabledChains, isTestnetModeEnabled } = useEnabledChains()
  const { evmAddress } = useActiveAddresses()

  // Read the GRG USD price from the same portfolio REST data that prices the tokens tab.
  const grgPriceUSD = useGrgPriceFromPortfolio(evmAddress ?? undefined)

  // Determine target address and context based on the caller-supplied address or the connected wallet.
  // We intentionally do NOT fall back to the active smart pool here; all portfolio tabs should display
  // the same wallet/pool that the portfolio page is currently rendering.
  const { targetAddress, isViewingOwnStakes } = useMemo(() => {
    const resolvedAddress = address || evmAddress
    const isViewingOwnAddress =
      !!resolvedAddress &&
      !!evmAddress &&
      areAddressesEqual({
        addressInput1: { address: resolvedAddress, platform: Platform.EVM },
        addressInput2: { address: evmAddress, platform: Platform.EVM },
      })
    return {
      targetAddress: resolvedAddress,
      isViewingOwnStakes: isViewingOwnAddress,
    }
  }, [address, evmAddress])

  // Filter to only chains that have staking contracts
  const stakingChains = useMemo(() => {
    return enabledChains.filter((chainId) => {
      const hasStakingContract = STAKING_PROXY_ADDRESSES[chainId]
      const isTestnet = isTestnetChain(chainId)
      const matchesFilter = filterChainId === undefined || chainId === filterChainId
      return hasStakingContract && isTestnet === isTestnetModeEnabled && matchesFilter
    })
  }, [enabledChains, isTestnetModeEnabled, filterChainId])

  // Get cached staking data from Redux store
  const allUserStakingData = useSelector((state: InterfaceState) =>
    targetAddress ? selectUserStakingData(state, assume0xAddress(targetAddress)) : {},
  )

  // Trigger data fetching for each chain using individual hooks (fixed number to avoid infinite loops)
  const maxChains = 10 // Reasonable limit for hook calls
  const chainsToProcess = stakingChains.slice(0, maxChains)

  // Pad the array to ensure we always call the same number of hooks
  const paddedChains: UniverseChainId[] = [...chainsToProcess]
  while (paddedChains.length < maxChains) {
    paddedChains.push(UniverseChainId.Mainnet) // Use mainnet as placeholder
  }

  // Call useChainStakingData for each potential chain (hooks must be called unconditionally)
  for (let i = 0; i < maxChains; i++) {
    const chainId = paddedChains[i]
    const isActiveChain = i < chainsToProcess.length
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useChainStakingData({
      userAddress: isActiveChain && targetAddress ? (isValidHexString(targetAddress) ? targetAddress : '') : '',
      chainId,
      targetAddress: isActiveChain && targetAddress ? (isViewingOwnStakes ? undefined : targetAddress) : undefined,
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
    if (!targetAddress || stakingChains.length === 0) {
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

      // If data is still loading for any chain, don't conclude "no stake" yet,
      // but still include any cached amounts so the total doesn't drop to zero.
      if (!data) {
        hasLoadingChains = true
        continue
      }
      if (data.isLoading) {
        hasLoadingChains = true
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
      totalStakeAmount:
        primaryToken && JSBI.greaterThan(totalRawAmount, JSBI.BigInt(0))
          ? CurrencyAmount.fromRawAmount(primaryToken, totalRawAmount)
          : undefined,
      hasAnyStake: effectiveHasStake,
    }
  }, [targetAddress, stakingChains, stakingData, isViewingOwnStakes])

  // Get USD value for primary stake amount using the portfolio-derived GRG price.
  // This avoids the quote-API flicker/lag that useUSDCValue introduces during refreshes.
  const totalStakeUSDValue = useGrgFiatValue(totalStakeAmount, grgPriceUSD)

  // Check if any data is loading
  const isLoading = useMemo(() => {
    return Object.values(stakingData).some((data) => data.isLoading)
  }, [stakingData])

  return {
    stakingChains,
    stakingData,
    totalStakeAmount,
    totalStakeUSD: totalStakeUSDValue || undefined,
    grgPriceUSD,
    hasAnyStake,
    isLoading,
    targetAddress,
    isViewingOwnStakes,
  }
}
