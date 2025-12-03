/* eslint-disable max-params */

import { BigNumber } from '@ethersproject/bignumber'
import { useMemo } from 'react'
// TODO: remove duplicate method definition and reorg code
import { usePoolExtendedContract, usePoolFactoryContract } from 'state/pool/hooks'
import POOL_EXTENDED_ABI from 'uniswap/src/abis/pool-extended.json'
import { assume0xAddress } from 'utils/wagmi'
import { useReadContract, useReadContracts } from 'wagmi'

interface PoolInitParams {
  name: string
  symbol: string
  decimals: number
  owner: string
  baseToken: string
}

interface PoolVariables {
  minPeriod: BigNumber
  spread: number
  transactionFee: number
  feeCollector: string
  kycProvider: string
}

interface PoolTokensInfo {
  unitaryValue: BigNumber
  totalSupply: BigNumber
}
// only value we are missing here is pool Id
interface PoolDetails {
  poolInitParams: PoolInitParams
  poolVariables: PoolVariables
  poolTokensInfo: PoolTokensInfo
}

export interface UserAccount {
  userBalance: BigNumber
  activation: BigNumber
}

export function useImplementation(poolAddress: string | undefined, implementationSlot: string): [string, string] | undefined {
  const poolExtendedContract = usePoolExtendedContract(poolAddress)
  const queryEnabled = !!poolAddress && !!implementationSlot
  const poolFactory = usePoolFactoryContract()
  // TODO: return isLoading state
  const { data, isLoading: isLoadingImplementations } = useReadContracts({
    contracts: [
      {
        address: assume0xAddress(poolAddress),
        abi: poolExtendedContract?.interface.fragments,
        functionName: 'getStorageAt',
        args: [implementationSlot, 1],
        chainId: poolExtendedContract?.chainId,
      },
      {
        address: assume0xAddress(poolFactory?.address),
        abi: poolFactory?.interface.fragments,
        functionName: 'implementation',
        args: [],
        chainId: poolFactory?.chainId,
      },
    ],
    query: { enabled: queryEnabled },
  })

  const currentImplementation = (typeof data?.[0]?.result === 'string' ? data[0].result.slice(-40) : undefined) as `0x${string}` | undefined
  const beaconImplementation = data?.[1]?.result as `0x${string}` | undefined

  // TODO: verify if memoization is needed here
  return useMemo(() => {
    if (!currentImplementation || !beaconImplementation) {
      return undefined
    }
    return ["0x" + currentImplementation.slice(-40), beaconImplementation]
  }, [currentImplementation, beaconImplementation])
}

export function useSmartPoolFromAddress(poolAddress?: string, chainId?: number): PoolDetails | undefined {
  const isQueryEnabled = !!poolAddress && !!chainId
  // we return entire "poolStorage", i.e. poolInitParams, poolVariables, poolTokensInfo
  const { data: poolStorageData } = useReadContract({
    address: assume0xAddress(poolAddress),
    abi: POOL_EXTENDED_ABI,
    functionName: 'getPoolStorage',
    chainId,
    query: { enabled: isQueryEnabled },
  })

  return useMemo(() => {
    if (!poolStorageData) {
      return undefined
    }

    return {
      poolInitParams: (poolStorageData as any)?.[0] as PoolInitParams,
      poolVariables: (poolStorageData as any)?.[1] as PoolVariables,
      poolTokensInfo: (poolStorageData as any)?.[2] as PoolTokensInfo,
    }
  }, [poolStorageData])
}

export function useUserPoolBalance(
  poolAddress?: string,
  account?: string,
  chainId?: number
): UserAccount | undefined {
  const target = useMemo(() => account ?? undefined, [account])
  const { data: result } = useReadContract({
    address: assume0xAddress(poolAddress),
    abi: POOL_EXTENDED_ABI,
    functionName: 'getUserAccount',
    args: [target],
    chainId,
    query: { enabled: !!poolAddress && !!account },
  })

  return useMemo(() => {
    if (!poolAddress || !result) {
      return undefined
    }

    return result as UserAccount
  }, [poolAddress, result])
}
