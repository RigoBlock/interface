import { useMemo } from 'react'
import STAKING_ABI from 'uniswap/src/abis/staking-impl.json'
import type { Abi } from 'viem'
import { useReadContracts } from 'wagmi'
import { STAKING_PROXY_ADDRESSES } from '~/constants/addresses'
import { assume0xAddress } from '~/utils/wagmi'

export interface StakingEpochInfo {
  /** Current epoch index */
  currentEpoch?: number
  /** Earliest time the current epoch can end, unix seconds */
  earliestEndTime?: number
  /** Epoch duration in seconds */
  epochDuration?: number
  /** Minimum own stake (raw, 18 decimals) a pool needs to be eligible for rewards */
  minimumPoolStake?: string
  /** GRG reserved for pool rewards (raw, 18 decimals) */
  rewardsBudget?: string
}

/**
 * Reads global staking parameters (epoch info, minimum stake, rewards budget)
 * from the staking proxy on the given chain in a single batched call.
 */
export function useStakingEpochInfo(chainId?: number): {
  data?: StakingEpochInfo
  isLoading: boolean
} {
  const stakingAddress = chainId ? STAKING_PROXY_ADDRESSES[chainId] : undefined

  const contracts = useMemo(() => {
    if (!stakingAddress || !chainId) {
      return []
    }
    const address = assume0xAddress(stakingAddress)
    const abi = STAKING_ABI as Abi
    return [
      { address, abi, functionName: 'currentEpoch', chainId },
      {
        address,
        abi,
        functionName: 'getCurrentEpochEarliestEndTimeInSeconds',
        chainId,
      },
      { address, abi, functionName: 'epochDurationInSeconds', chainId },
      { address, abi, functionName: 'minimumPoolStake', chainId },
      { address, abi, functionName: 'grgReservedForPoolRewards', chainId },
    ]
  }, [stakingAddress, chainId])

  const { data: rawData, isLoading } = useReadContracts({
    contracts,
    query: {
      enabled: contracts.length > 0,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  })

  const data = useMemo((): StakingEpochInfo | undefined => {
    if (!rawData || rawData.length < 5) {
      return undefined
    }
    const [epoch, earliestEnd, duration, minStake, budget] = rawData
    return {
      currentEpoch: epoch.result != null ? Number(epoch.result) : undefined,
      earliestEndTime: earliestEnd.result != null ? Number(earliestEnd.result) : undefined,
      epochDuration: duration.result != null ? Number(duration.result) : undefined,
      minimumPoolStake: minStake.result != null ? minStake.result.toString() : undefined,
      rewardsBudget: budget.result != null ? budget.result.toString() : undefined,
    }
  }, [rawData])

  return { data, isLoading }
}
