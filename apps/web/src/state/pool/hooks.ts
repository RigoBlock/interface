import { Interface } from '@ethersproject/abi'
import { isAddress } from '@ethersproject/address'
import { BigNumber } from '@ethersproject/bignumber'
import { Contract } from '@ethersproject/contracts'
import type { TransactionResponse } from '@ethersproject/providers'
import { parseBytes32String } from '@ethersproject/strings'
import { Currency } from '@uniswap/sdk-core'
import { useWeb3React } from '@web3-react/core'
import { RB_FACTORY_ADDRESSES, RB_REGISTRY_ADDRESSES } from 'constants/addresses'
import { ZERO_ADDRESS } from 'constants/misc'
import { useAccount } from 'hooks/useAccount'
import { useContract } from 'hooks/useContract'
import { useTotalSupply } from 'hooks/useTotalSupply'
import { CallStateResult, useSingleContractMultipleData } from 'lib/hooks/multicall'
import { useCallContext } from 'lib/hooks/useCallContext'
import { useCallback, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useStakingContract } from 'state/governance/hooks'
import { useLogs } from 'state/logs/hooks'
import { useTransactionAdder } from 'state/transactions/hooks'
import { TransactionType } from 'state/transactions/types'
import POOL_EXTENDED_ABI from 'uniswap/src/abis/pool-extended.json'
import RB_POOL_FACTORY_ABI from 'uniswap/src/abis/rb-pool-factory.json'
import RB_REGISTRY_ABI from 'uniswap/src/abis/rb-registry.json'
import { GRG } from 'uniswap/src/constants/tokens'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { calculateGasMargin } from 'utils/calculateGasMargin'

export const PoolInterface = new Interface(POOL_EXTENDED_ABI)
const RegistryInterface = new Interface(RB_REGISTRY_ABI)

export function useRegistryContract(): Contract | null {
  const account = useAccount()
  return useContract(
    account.chainId ? RB_REGISTRY_ADDRESSES[account.chainId] : undefined,
    RB_REGISTRY_ABI,
    true,
  )
}

export function usePoolFactoryContract(): Contract | null {
  const account = useAccount()
  return useContract(
    account.chainId ? RB_FACTORY_ADDRESSES[account.chainId] : undefined,
    RB_POOL_FACTORY_ABI,
    true,
  )
}

export function usePoolExtendedContract(poolAddress: string | undefined): Contract | null {
  return useContract(poolAddress, POOL_EXTENDED_ABI, true)
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

function useStartBlock(chainId?: number): {fromBlock: number, toBlock?: number } {
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
      return index === pools?.findIndex((o) => obj?.pool === o?.pool)
    })

    return { data: uniquePools }
  }, [pools])
}

export function useCreateCallback(): (
  name: string | undefined,
  symbol: string | undefined,
  currencyValue: Currency | undefined
) => undefined | Promise<string> {
  const account = useAccount()
  const { provider } = useWeb3React()
  const addTransaction = useTransactionAdder()
  const factoryContract = usePoolFactoryContract()

  return useCallback(
    (name: string | undefined, symbol: string | undefined, currencyValue: Currency | undefined) => {
      const parsedAddress = currencyValue?.isNative ? ZERO_ADDRESS : currencyValue?.address
      // TODO: check name and symbol assertions
      //if (!provider || !chainId || !account || name === '' || symbol === '' || !isAddress(parsedAddress ?? ''))
      if (!provider || !account.chainId || !account.address || !name || !symbol || !parsedAddress || !isAddress(parsedAddress ?? '')) {
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
              type: TransactionType.CREATE_V3_POOL,
            })
            return response.hash
          })
      })
    },
    [account.address, addTransaction, account.chainId, provider, factoryContract]
  )
}

function useRegisteredPools(): PoolRegisteredLog[] | undefined {
  const registry = useRegistryContract()
  //const account = useAccount()
  const { chainId } = useCallContext()
  const { fromBlock, toBlock } = useStartBlock(chainId)

  // create filters for Registered events
  const filter = useMemo(() => {
    const filter = registry?.filters?.Registered()
    if (!filter) {
      return undefined
    }
    return {
      ...filter,
      fromBlock,
      toBlock
    }
  }, [registry, fromBlock, toBlock])

  const logsResult = useLogs(filter)

  return logsResult?.logs
    ?.map((log) => {
      const parsed = RegistryInterface.parseLog(log).args
      return parsed
    })
    ?.map((parsed) => {
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
              type: TransactionType.SET_LOCKUP,
            })
            return response.hash
          })
      })
    },
    [account.address, account.chainId, provider, poolContract, addTransaction]
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
              type: TransactionType.SET_SPREAD,
            })
            return response.hash
          })
      })
    },
    [account.address, account.chainId, provider, poolContract, addTransaction]
  )
}

export function useSetValueCallback(): () => undefined | Promise<string> {
  const account = useAccount()
  const { provider } = useWeb3React()
  const addTransaction = useTransactionAdder()

  const { poolAddress: poolAddressFromUrl } = useParams<{ poolAddress?: string }>()
  const poolContract = usePoolExtendedContract(poolAddressFromUrl ?? undefined)

  return useCallback(
    () => {
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
              type: TransactionType.SET_VALUE,
            })
            return response.hash
          })
      })
    },
    [account.address, account.chainId, provider, poolContract, addTransaction]
  )
}

export function useUpgradeCallback(): () => undefined | Promise<string> {
  const account = useAccount()
  const { provider } = useWeb3React()
  const addTransaction = useTransactionAdder()

  const { poolAddress: poolAddressFromUrl } = useParams<{ poolAddress?: string }>()
  const poolContract = usePoolExtendedContract(poolAddressFromUrl ?? undefined)

  return useCallback(
    () => {
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
              type: TransactionType.UPGRADE_IMPLEMENTATION,
            })
            return response.hash
          })
      })
    },
    [account.address, account.chainId, provider, poolContract, addTransaction]
  )
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
  const results = useSingleContractMultipleData(stakingContract, 'getStakingPoolStatsThisEpoch', inputs)
  return useMemo(() => {
    return results.map((call) => {
      const result = call.result as CallStateResult
      return result?.[0].feesCollected
    })
  }, [results])
}

export function useStakingPools(addresses: string[] | undefined, poolIds: string[] | undefined): UseStakingPools {
  const stakingContract = useStakingContract()

  const inputs = useMemo(() => (poolIds ? poolIds.map((poolId) => [poolId]) : []), [poolIds])
  const poolAddresses = useMemo(() => (addresses ? addresses.map((address) => [address, 1]) : []), [addresses])

  const poolsData = useSingleContractMultipleData(stakingContract, 'getStakingPool', inputs)
  const poolsStakes = useSingleContractMultipleData(stakingContract, 'getTotalStakeDelegatedToPool', inputs)
  // TODO: if we allow pools to stake pools other then self we'll have to use getStakeDelegatedToPoolByOwner
  const poolsOwnStakes = useSingleContractMultipleData(stakingContract, 'getOwnerStakeByStatus', poolAddresses)

  const poolsLoading = useMemo(() => poolsData.some(({ loading }) => loading), [poolsData])
  const stakesLoading = useMemo(() => poolsStakes.some(({ loading }) => loading), [poolsStakes])
  const ownStakesLoading = useMemo(() => poolsOwnStakes.some(({ loading }) => loading), [poolsOwnStakes])
  const poolsError = useMemo(() => poolsData.some(({ error }) => error), [poolsData])
  const stakesError = useMemo(() => poolsStakes.some(({ error }) => error), [poolsStakes])
  const ownStakesError = useMemo(() => poolsOwnStakes.some(({ error }) => error), [poolsOwnStakes])

  const stakingPools = useMemo(() => {
    if (!poolsLoading && !poolsError && poolIds) {
      return poolsData.map((call, i) => {
        const id = poolIds[i]
        const result = call.result as CallStateResult
        return {
          id,
          operatorShare: result?.[0].operatorShare,
        }
      })
    }
    return undefined
  }, [poolsError, poolsLoading, poolIds, poolsData])

  const delegatedStakes = useMemo(() => {
    if (!stakesLoading && !stakesError && addresses && poolIds) {
      return poolsStakes.map((call: any, i: number) => {
        const id = poolIds[i]
        const result = call.result as CallStateResult
        return {
          id,
          delegatedStake: result?.[0].nextEpochBalance,
        }
      })
    }
    return undefined
  }, [stakesLoading, stakesError, addresses, poolIds, poolsStakes])

  const delegatedOwnStakes = useMemo(() => {
    if (!ownStakesLoading && !ownStakesError && addresses && poolIds) {
      return poolsOwnStakes.map((call: any, i: number) => {
        const id = poolIds[i]
        const result = call.result as CallStateResult
        return {
          id,
          poolOwnStake: result?.[0].nextEpochBalance,
        }
      })
    }
    return undefined
  }, [ownStakesLoading, ownStakesError, addresses, poolIds, poolsOwnStakes])

  const totalDelegatedStake = delegatedStakes?.reduce((prev: any, curr: any) => prev + Number(curr.delegatedStake), 0)
  const totalPoolsOwnStake = delegatedOwnStakes?.reduce((prev: any, curr: any) => prev + Number(curr.poolOwnStake), 0)
  // TODO: check if should pass supply from parent
  const account = useWeb3React()
  const supplyAmount = useTotalSupply(GRG[account.chainId ?? UniverseChainId.Mainnet])

  const yieldData = useMemo(() => {
    if (!delegatedStakes || !delegatedOwnStakes || !totalDelegatedStake || !totalPoolsOwnStake || !supplyAmount) {
      return undefined
    }
    const poolsInfo = stakingPools?.map((pool, i) => ({
      ...pool,
      operatorShare: stakingPools[i].operatorShare,
      delegatedStake: delegatedStakes[i].delegatedStake,
      delegatedOwnStake: delegatedOwnStakes[i].poolOwnStake,
    }))

    return poolsInfo?.map((p) => {
      // if we want to return NaN when pool has no delegated stake, we can remove the following assertion
      const reward =
        Math.pow(p.delegatedOwnStake / totalPoolsOwnStake, 2 / 3) *
        Math.pow(p.delegatedStake / totalDelegatedStake, 1 / 3) *
        ((Number(supplyAmount?.quotient) * 2) / 100)
      const apr =
        p.delegatedStake.toString() !== BigNumber.from(0).toString()
          ? (reward * ((1_000_000 - p.operatorShare) / 1_000_000)) / p.delegatedStake
          : 0
      const irr =
        p.delegatedOwnStake.toString() !== BigNumber.from(0).toString()
          ? (reward * (p.operatorShare / 1_000_000)) / p.delegatedOwnStake
          : 0
      return { apr, irr }
    })
  }, [delegatedStakes, delegatedOwnStakes, stakingPools, supplyAmount, totalDelegatedStake, totalPoolsOwnStake])

  const loading = poolsLoading || stakesLoading || ownStakesLoading

  return {
    loading,
    stakingPools: stakingPools?.map((pool, i) => ({
      ...pool,
      id: inputs[i][0],
      apr: yieldData ? yieldData[i]?.apr : 0,
      irr: yieldData ? yieldData[i]?.irr : 0,
      operatorShare: stakingPools[i].operatorShare,
      delegatedStake: delegatedStakes ? delegatedStakes[i].delegatedStake : 0,
      poolOwnStake: delegatedOwnStakes ? delegatedOwnStakes[i].poolOwnStake : 0,
    })),
  }
}
