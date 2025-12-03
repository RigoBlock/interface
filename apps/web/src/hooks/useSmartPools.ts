import { BigNumber } from '@ethersproject/bignumber'
import { useMemo } from 'react'
// TODO: remove duplicate method definition and reorg code
import { usePoolExtendedContract, usePoolFactoryContract } from 'state/pool/hooks'
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

  const currentImplementation = data?.[0] as `0x${string}` | undefined
  const beaconImplementation = data?.[1] as `0x${string}` | undefined

  // TODO: verify if memoization is needed here
  return useMemo(() => {
    if (!currentImplementation || !beaconImplementation) {
      return undefined
    }
    return ["0x" + currentImplementation.slice(-40), beaconImplementation]
  }, [currentImplementation, beaconImplementation])
}

export function useSmartPoolFromAddress(poolAddress: string | undefined): PoolDetails | undefined {
  const poolExtendedContract = usePoolExtendedContract(poolAddress)
  // we return entire "poolStorage", i.e. poolInitParams, poolVariables, poolTokensInfo
  const { data: poolStorageData } = useReadContract({
    address: assume0xAddress(poolExtendedContract?.address),
    abi: poolExtendedContract?.interface.fragments,
    functionName: 'getPoolStorage',
    args: [],
    chainId: poolExtendedContract?.chainId,
    query: { enabled: !!poolExtendedContract },
  })

  return useMemo(() => {
    if (!poolStorageData) {
      return undefined
    }

    const typedData = poolStorageData as PoolDetails

    return {
      poolInitParams: typedData.poolInitParams,
      poolVariables: typedData.poolVariables,
      poolTokensInfo: typedData.poolTokensInfo,
    }
  }, [poolStorageData])
}

export function useUserPoolBalance(
  poolAddress: string | undefined,
  account: string | undefined
): UserAccount | undefined {
  const poolExtendedContract = usePoolExtendedContract(poolAddress)
  const target = useMemo(() => account ?? undefined, [account])
  const { data: result } = useReadContract({
    address: assume0xAddress(poolExtendedContract?.address),
    abi: poolExtendedContract?.interface.fragments,
    functionName: 'getUserAccount',
    args: [target],
    chainId: poolExtendedContract?.chainId,
    query: { enabled: !!poolExtendedContract && !!account },
  })

  return useMemo(() => {
    if (!poolExtendedContract || !result) {
      return undefined
    }

    return result as UserAccount
  }, [poolExtendedContract, result])
}
