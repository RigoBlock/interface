/* eslint-disable max-params */
import { Interface } from '@ethersproject/abi'
import { isAddress } from '@ethersproject/address'
import { BigNumber } from '@ethersproject/bignumber'
import { Contract } from '@ethersproject/contracts'
import type { TransactionResponse } from '@ethersproject/providers'
import { parseBytes32String } from '@ethersproject/strings'
import { Currency } from '@uniswap/sdk-core'
import { useWeb3React } from '@web3-react/core'
import { RB_FACTORY_ADDRESSES, RB_REGISTRY_ADDRESSES } from 'constants/addresses'
import { useAccount } from 'hooks/useAccount'
import { useContract } from 'hooks/useContract'
import { useTotalSupply } from 'hooks/useTotalSupply'
import { useCallback, useMemo } from 'react'
import { useParams } from 'react-router'
import { useStakingContract } from 'state/governance/hooks'
import { useLogs } from 'state/logs/hooks'
import { useTransactionAdder } from 'state/transactions/hooks'
import POOL_EXTENDED_ABI from 'uniswap/src/abis/pool-extended.json'
import RB_POOL_FACTORY_ABI from 'uniswap/src/abis/rb-pool-factory.json'
import RB_REGISTRY_ABI from 'uniswap/src/abis/rb-registry.json'
import { ZERO_ADDRESS } from 'uniswap/src/constants/misc'
import { GRG } from 'uniswap/src/constants/tokens'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { TransactionType } from 'uniswap/src/features/transactions/types/transactionDetails'
import { isValidHexString } from 'utilities/src/addresses/hex'
import { calculateGasMargin } from 'utils/calculateGasMargin'
import { assume0xAddress } from 'utils/wagmi'
import type { Abi } from 'viem'
import { useReadContracts } from 'wagmi'

export const PoolInterface = new Interface(POOL_EXTENDED_ABI)
const RegistryInterface = new Interface(RB_REGISTRY_ABI)

export function useRegistryContract(): Contract | null {
  const account = useAccount()
  return useContract({
    address: account.chainId ? RB_REGISTRY_ADDRESSES[account.chainId] : undefined,
    ABI: RB_REGISTRY_ABI,
    withSignerIfPossible: true,
  })
}

export function usePoolFactoryContract(): Contract | null {
  const account = useAccount()
  return useContract({
    address: account.chainId ? RB_FACTORY_ADDRESSES[account.chainId] : undefined,
    ABI: RB_POOL_FACTORY_ABI,
    withSignerIfPossible: true,
  })
}

export function usePoolExtendedContract(poolAddress: string | undefined): Contract | null {
  return useContract({ address: poolAddress, ABI: POOL_EXTENDED_ABI, withSignerIfPossible: true })
}

// TODO: id should be optional as not returned in pools from url
export interface PoolRegisteredLog {
  group?: string
  pool: string
  name: string
  symbol: string
  id: string
  userHasStake?: boolean
}

function useStartBlock(chainId?: number): { fromBlock: number; toBlock?: number } {
  let registryStartBlock: number
  //const blockNumber = useBlockNumber()

  //const toBlock = typeof blockNumber === 'number' ? blockNumber : undefined
  // Notice: this prevents re-rendering from scratch at every new block
  const toBlock = undefined

  // Notice: we now query logs from the api, so start block is less relevant
  if (!chainId) {
    registryStartBlock = 0
  } else {
    switch (chainId) {
      case UniverseChainId.Mainnet:
        registryStartBlock = 15834693
        break
      case UniverseChainId.Sepolia:
        registryStartBlock = 7707806
        break
      case UniverseChainId.ArbitrumOne:
        registryStartBlock = 35439804
        break
      case UniverseChainId.Optimism:
        registryStartBlock = 34629059
        break
      case UniverseChainId.Polygon:
        registryStartBlock = 35228892
        break
      case UniverseChainId.Base:
        registryStartBlock = 2565256
        break
      case UniverseChainId.Bnb:
        registryStartBlock = 25549625
        break
      case UniverseChainId.Unichain:
        registryStartBlock = 16121684
        break
      default:
        registryStartBlock = 1000
    }
  }

  return { fromBlock: registryStartBlock, toBlock }
}

export function useAllPoolsData(): { data?: PoolRegisteredLog[] } {
  const pools: PoolRegisteredLog[] | undefined = useRegisteredPools()

  return useMemo(() => {
    const uniquePools = pools?.filter((obj, index) => {
      return index === pools.findIndex((o) => obj.pool === o.pool)
    })

    return { data: uniquePools }
  }, [pools])
}

export function useCreateCallback(): (options: {
  name: string | undefined
  symbol: string | undefined
  currencyValue: Currency | undefined
}) => undefined | Promise<string> {
  const account = useAccount()
  const { provider } = useWeb3React()
  const addTransaction = useTransactionAdder()
  const factoryContract = usePoolFactoryContract()

  return useCallback(
    ({
      name,
      symbol,
      currencyValue,
    }: {
      name: string | undefined
      symbol: string | undefined
      currencyValue: Currency | undefined
    }) => {
      const parsedAddress = currencyValue?.isNative ? ZERO_ADDRESS : currencyValue?.address
      // TODO: check name and symbol assertions
      //if (!provider || !chainId || !account || name === '' || symbol === '' || !isAddress(parsedAddress ?? ''))
      if (
        !provider ||
        !account.chainId ||
        !account.address ||
        !name ||
        !symbol ||
        !parsedAddress ||
        !isAddress(parsedAddress)
      ) {
        return undefined
      }
      if (currencyValue?.chainId !== account.chainId) {
        throw new Error('User Switched Wallet On Open Create Modal')
      }
      if (!factoryContract) {
        throw new Error('No Factory Contract!')
      }
      return factoryContract.estimateGas.createPool(name, symbol, parsedAddress, {}).then((estimatedGasLimit) => {
        return factoryContract
          .createPool(name, symbol, parsedAddress, { value: null, gasLimit: calculateGasMargin(estimatedGasLimit) })
          .then((response: TransactionResponse) => {
            addTransaction(response, {
              type: TransactionType.Deploy,
              name: `${name} (${symbol})`,
              symbol,
              baseTokenAddress: parsedAddress,
            })
            return response.hash
          })
      })
    },
    [account.address, addTransaction, account.chainId, provider, factoryContract],
  )
}

function useRegisteredPools(): PoolRegisteredLog[] | undefined {
  const registry = useRegistryContract()
  const { chainId } = useAccount()
  const { fromBlock, toBlock } = useStartBlock(chainId)

  // create filters for Registered events
  const filter = useMemo(() => {
    const filter = registry?.filters.Registered()
    if (!filter) {
      return undefined
    }
    return {
      ...filter,
      fromBlock,
      toBlock,
    }
  }, [registry, fromBlock, toBlock])

  const logsResult = useLogs(filter)

  return logsResult.logs
    ?.map((log) => {
      const parsed = RegistryInterface.parseLog(log).args
      return parsed
    })
    .map((parsed) => {
      const group = parsed.group
      const pool = parsed.pool
      const name = parseBytes32String(parsed.name)
      const symbol = parseBytes32String(parsed.symbol)
      const id = parsed.id //.toString()
      const poolData: PoolRegisteredLog = { group, pool, name, symbol, id }

      return poolData
    })
    .reverse()
}

export function useSetLockupCallback(): (lockup: string | undefined) => undefined | Promise<string> {
  const account = useAccount()
  const { provider } = useWeb3React()
  const addTransaction = useTransactionAdder()

  const { poolAddress: poolAddressFromUrl } = useParams<{ poolAddress?: string }>()
  const poolContract = usePoolExtendedContract(poolAddressFromUrl ?? undefined)

  return useCallback(
    (lockup: string | undefined) => {
      if (!provider || !account.chainId || !account.address) {
        return undefined
      }
      if (!poolContract) {
        throw new Error('No Pool Contract!')
      }
      return poolContract.estimateGas.changeMinPeriod(lockup, {}).then((estimatedGasLimit) => {
        return poolContract
          .changeMinPeriod(lockup, { value: null, gasLimit: calculateGasMargin(estimatedGasLimit) })
          .then((response: TransactionResponse) => {
            addTransaction(response, {
              type: TransactionType.SetLockup,
              vaultAddress: poolContract.address,
              lockupPeriodSeconds: Number(lockup),
            })
            return response.hash
          })
      })
    },
    [account.address, account.chainId, provider, poolContract, addTransaction],
  )
}

export function useSetSpreadCallback(): (spread: string | undefined) => undefined | Promise<string> {
  const account = useAccount()
  const { provider } = useWeb3React()
  const addTransaction = useTransactionAdder()

  const { poolAddress: poolAddressFromUrl } = useParams<{ poolAddress?: string }>()
  const poolContract = usePoolExtendedContract(poolAddressFromUrl ?? undefined)

  return useCallback(
    (spread: string | undefined) => {
      if (!provider || !account.chainId || !account.address) {
        return undefined
      }
      if (!poolContract) {
        throw new Error('No Pool Contract!')
      }
      return poolContract.estimateGas.changeSpread(spread, {}).then((estimatedGasLimit) => {
        return poolContract
          .changeSpread(spread, { value: null, gasLimit: calculateGasMargin(estimatedGasLimit) })
          .then((response: TransactionResponse) => {
            addTransaction(response, {
              type: TransactionType.SetSpread,
              vaultAddress: poolContract.address,
              spreadBasisPoints: Number(spread),
            })
            return response.hash
          })
      })
    },
    [account.address, account.chainId, provider, poolContract, addTransaction],
  )
}

export function useSetValueCallback(): () => undefined | Promise<string> {
  const account = useAccount()
  const { provider } = useWeb3React()
  const addTransaction = useTransactionAdder()

  const { poolAddress: poolAddressFromUrl } = useParams<{ poolAddress?: string }>()
  const poolContract = usePoolExtendedContract(poolAddressFromUrl ?? undefined)

  return useCallback(() => {
    if (!provider || !account.chainId || !account.address) {
      return undefined
    }
    if (!poolContract) {
      throw new Error('No Pool Contract!')
    }
    return poolContract.estimateGas.updateUnitaryValue().then((estimatedGasLimit) => {
      return poolContract
        .updateUnitaryValue({ value: null, gasLimit: calculateGasMargin(estimatedGasLimit) })
        .then((response: TransactionResponse) => {
          addTransaction(response, {
            type: TransactionType.SetValue,
            vaultAddress: poolContract.address,
          })
          return response.hash
        })
    })
  }, [account.address, account.chainId, provider, poolContract, addTransaction])
}

export function useUpgradeCallback(): () => undefined | Promise<string> {
  const account = useAccount()
  const { provider } = useWeb3React()
  const addTransaction = useTransactionAdder()

  const { poolAddress: poolAddressFromUrl } = useParams<{ poolAddress?: string }>()
  const poolContract = usePoolExtendedContract(poolAddressFromUrl ?? undefined)

  return useCallback(() => {
    if (!provider || !account.chainId || !account.address) {
      return undefined
    }
    if (!poolContract) {
      throw new Error('No Pool Contract!')
    }
    return poolContract.estimateGas.upgradeImplementation().then((estimatedGasLimit) => {
      return poolContract
        .upgradeImplementation({ value: null, gasLimit: calculateGasMargin(estimatedGasLimit) })
        .then((response: TransactionResponse) => {
          addTransaction(response, {
            type: TransactionType.Upgrade,
            vaultAddress: poolContract.address,
          })
          return response.hash
        })
    })
  }, [account.address, account.chainId, provider, poolContract, addTransaction])
}

interface StakingPools {
  id: string
  operatorShare: number
  apr: number
  irr?: number
  delegatedStake: BigNumber
  poolOwnStake: BigNumber
}

interface UseStakingPools {
  loading: boolean
  stakingPools?: StakingPools[]
}

export function useStakingPoolsRewards(poolIds: string[] | undefined) {
  const stakingContract = useStakingContract()

  const inputs = useMemo(() => (poolIds ? poolIds.map((poolId) => [poolId]) : []), [poolIds])
  const { data } = useReadContracts({
    contracts: stakingContract
      ? inputs.map((input) => ({
          address: assume0xAddress(stakingContract.address),
          abi: stakingContract.interface.fragments as Abi,
          functionName: 'getStakingPoolStatsThisEpoch',
          args: input,
        }))
      : [],
    query: {
      enabled: !!stakingContract?.address && inputs.length > 0,
      staleTime: 30_000, // Cache data for 30 seconds
      gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    },
  })

  return useMemo(() => {
    return data?.map((result) => {
      return (result as any).feesCollected
    })
  }, [data])
}

export function useStakingPools(addresses: string[], poolIds: string[]): UseStakingPools {
  const stakingContract = useStakingContract()
  const { chainId } = useAccount()
  const calls = useMemo(() => {
    if (
      addresses.length === 0 ||
      addresses.length !== poolIds.length ||
      !stakingContract?.address ||
      !isValidHexString(stakingContract.address)
    ) {
      return undefined
    }
    const contractAddress = assume0xAddress(stakingContract.address)
    return poolIds.flatMap((poolId, index) => [
      {
        address: contractAddress,
        abi: stakingContract.interface.fragments as Abi,
        functionName: 'getStakingPool',
        args: [poolId],
        chainId,
      },
      {
        address: contractAddress,
        abi: stakingContract.interface.fragments as Abi,
        functionName: 'getTotalStakeDelegatedToPool',
        args: [poolId],
        chainId,
      },
      {
        address: contractAddress,
        abi: stakingContract.interface.fragments as Abi,
        functionName: 'getOwnerStakeByStatus',
        args: addresses[index] ? [addresses[index], 1] : undefined,
        chainId,
      },
    ])
  }, [poolIds, addresses, stakingContract?.address, stakingContract?.interface.fragments, chainId])

  const { data: combinedData, isFetching: isLoading } = useReadContracts({
    contracts: calls,
    query: {
      enabled: !!stakingContract?.address && addresses.length > 0 && poolIds.length > 0,
      staleTime: 30_000, // Cache data for 30 seconds
      gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    },
  })

  const supplyAmount = useTotalSupply(GRG[chainId ?? UniverseChainId.Mainnet])

  const stakingPoolsData = useMemo(() => {
    if (!combinedData || isLoading) {
      return undefined
    }

    let totalDelegatedStake = BigNumber.from(0)
    let totalPoolsOwnStake = BigNumber.from(0)

    const pools = poolIds.reduce(
      (acc, _, i) => {
        const baseIndex = i * 3
        const operatorShare = (combinedData[baseIndex]?.result as any)?.operatorShare as any[] | undefined
        const delegatedStake = (combinedData[baseIndex + 1]?.result as any)?.nextEpochBalance as any[] | undefined
        const poolOwnStake = (combinedData[baseIndex + 2]?.result as any)?.nextEpochBalance as any[] | undefined

        const delegatedStakeBN = delegatedStake ? BigNumber.from(delegatedStake) : BigNumber.from(0)
        const poolOwnStakeBN = poolOwnStake ? BigNumber.from(poolOwnStake) : BigNumber.from(0)

        totalDelegatedStake = totalDelegatedStake.add(delegatedStakeBN)
        totalPoolsOwnStake = totalPoolsOwnStake.add(poolOwnStakeBN)

        acc[poolIds[i]] = {
          operatorShare: Number(operatorShare ?? 0),
          delegatedStake: delegatedStakeBN,
          poolOwnStake: poolOwnStakeBN,
        }
        return acc
      },
      {} as Record<string, { operatorShare: number; delegatedStake: BigNumber; poolOwnStake: BigNumber }>,
    )

    return { pools, totalDelegatedStake, totalPoolsOwnStake }
  }, [combinedData, isLoading, poolIds])

  return useMemo(() => {
    if (!stakingPoolsData || !supplyAmount) {
      return { loading: isLoading, stakingPools: undefined }
    }

    const { pools, totalDelegatedStake, totalPoolsOwnStake } = stakingPoolsData
    const totalRewardPool = Number(supplyAmount.quotient.toString()) * 0.02

    const stakingPools = poolIds.map((poolId) => {
      const pool = pools[poolId]

      const totalDelegatedStakeNum = parseFloat(totalDelegatedStake.toString())
      const totalPoolsOwnStakeNum = parseFloat(totalPoolsOwnStake.toString())
      const poolOwnStakeNum = parseFloat(pool.poolOwnStake.toString())
      const poolDelegatedStakeNum = parseFloat(pool.delegatedStake.toString())

      const rewardRatio =
        totalDelegatedStakeNum > 0 && totalPoolsOwnStakeNum > 0
          ? Math.pow(poolOwnStakeNum / totalPoolsOwnStakeNum, 2 / 3) *
            Math.pow(poolDelegatedStakeNum / totalDelegatedStakeNum, 1 / 3)
          : 0

      const totalReward = rewardRatio * totalRewardPool
      const apr =
        poolDelegatedStakeNum !== 0
          ? (totalReward * ((1_000_000 - pool.operatorShare) / 1_000_000)) / poolDelegatedStakeNum
          : 0
      const irr = poolOwnStakeNum !== 0 ? (totalReward * (pool.operatorShare / 1_000_000)) / poolOwnStakeNum : 0

      return {
        id: poolId,
        operatorShare: pool.operatorShare,
        apr,
        irr,
        delegatedStake: pool.delegatedStake,
        poolOwnStake: pool.poolOwnStake,
      }
    })

    return { loading: isLoading, stakingPools }
  }, [stakingPoolsData, supplyAmount, isLoading, poolIds])
}
