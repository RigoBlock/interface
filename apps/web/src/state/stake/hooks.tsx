import { BigNumber } from '@ethersproject/bignumber'
import { Contract } from '@ethersproject/contracts'
import type { TransactionResponse } from '@ethersproject/providers'
import { CurrencyAmount, Token } from '@uniswap/sdk-core'
import JSBI from 'jsbi'
import { useCallback, useMemo } from 'react'
import { useParams } from 'react-router'
import POP_ABI from 'uniswap/src/abis/pop.json'
import STAKING_ABI from 'uniswap/src/abis/staking-impl.json'
import { GRG } from 'uniswap/src/constants/tokens'
import { TransactionType } from 'uniswap/src/features/transactions/types/transactionDetails'
import type { Abi } from 'viem'
import { useReadContract, useReadContracts } from 'wagmi'
import { POP_ADDRESSES, STAKING_PROXY_ADDRESSES } from '~/constants/addresses'
import { useAccount } from '~/hooks/useAccount'
import { useContract } from '~/hooks/useContract'
import { useEthersWeb3Provider } from '~/hooks/useEthersProvider'
import { StakeStatus, useStakingContract, useStakingProxyContract } from '~/state/governance/hooks'
import { usePoolExtendedContract } from '~/state/pool/hooks'
import { useTransactionAdder } from '~/state/transactions/hooks'
import { calculateGasMargin } from '~/utils/calculateGasMargin'
import { assume0xAddress } from '~/utils/wagmi'

export function useFreeStakeBalance(isDelegateFreeStake?: boolean, chainId?: number): CurrencyAmount<Token> | undefined {
  const account = useAccount()
  const resolvedChainId = chainId ?? account.chainId
  const grg = useMemo(() => (resolvedChainId ? GRG[resolvedChainId] : undefined), [resolvedChainId])
  const stakingContract = useStakingContract(resolvedChainId)
  const { poolAddress: poolAddressFromUrl } = useParams<{
    poolAddress?: string
  }>()
  // TODO: check if can improve as whenever there is an address in the url the pool's balance will be checked
  const queryEnabled = !!account.address && !!stakingContract
  const { data: freeStake } = useReadContract({
    address: assume0xAddress(stakingContract?.address),
    chainId: resolvedChainId,
    abi: stakingContract?.interface.fragments,
    functionName: 'getOwnerStakeByStatus',
    args: [isDelegateFreeStake ? account.address : (poolAddressFromUrl ?? account.address), StakeStatus.UNDELEGATED],
    query: {
      enabled: queryEnabled,
      staleTime: 5 * 60_000,
      gcTime: 5 * 60_000,
      retry: 3,
      retryDelay: (attempt: number) => Math.min(attempt > 1 ? 2 ** attempt * 1000 : 1000, 30_000),
    },
  })

  // when all stake has been delegated, the current epoch stake is positive but withdrawing it will revert
  //  unless deactivated first. We use the lower of the current and next epoch undelegated stake.
  return freeStake && grg
    ? CurrencyAmount.fromRawAmount(
        grg,
        JSBI.greaterThan(
          JSBI.BigInt(String((freeStake as any).currentEpochBalance)),
          JSBI.BigInt(String((freeStake as any).nextEpochBalance)),
        )
          ? String((freeStake as any).nextEpochBalance)
          : String((freeStake as any).currentEpochBalance),
      )
    : undefined
}

interface StakingBalancesProps {
  address?: string
  smartPoolAddress?: string
  chainId?: number
}

export function useTotalStakeBalances({ address, smartPoolAddress, chainId }: StakingBalancesProps): {
  userFreeStake?: CurrencyAmount<Token>
  userDelegatedStake?: CurrencyAmount<Token>
  smartPoolFreeStake?: CurrencyAmount<Token>
  smartPoolDelegatedStake?: CurrencyAmount<Token>
} {
  const grg = useMemo(() => (address && chainId ? GRG[chainId] : undefined), [address, chainId])
  const stakingProxyAddress = STAKING_PROXY_ADDRESSES[chainId ?? 1]
  const queryEnabled = !!address && !!stakingProxyAddress && !!grg
  const contractCalls = [
    {
      address: assume0xAddress(stakingProxyAddress),
      abi: STAKING_ABI as Abi,
      functionName: 'getOwnerStakeByStatus',
      args: [address, StakeStatus.UNDELEGATED],
      chainId,
    },
    {
      address: assume0xAddress(stakingProxyAddress),
      abi: STAKING_ABI as Abi,
      functionName: 'getOwnerStakeByStatus',
      args: [address, StakeStatus.DELEGATED],
      chainId,
    },
    {
      address: assume0xAddress(stakingProxyAddress),
      abi: STAKING_ABI as Abi,
      functionName: 'getOwnerStakeByStatus',
      args: [smartPoolAddress, StakeStatus.UNDELEGATED],
      chainId,
    },
    {
      address: assume0xAddress(stakingProxyAddress),
      abi: STAKING_ABI as Abi,
      functionName: 'getOwnerStakeByStatus',
      args: [smartPoolAddress, StakeStatus.DELEGATED],
      chainId,
    },
  ]

  const { data } = useReadContracts({
    contracts: [...contractCalls],
    query: {
      enabled: queryEnabled,
      staleTime: 5 * 60_000,
      gcTime: 5 * 60_000,
      retry: 3,
      retryDelay: (attempt: number) => Math.min(attempt > 1 ? 2 ** attempt * 1000 : 1000, 30_000),
      refetchOnWindowFocus: false,
    },
  })

  // when all stake has been delegated, the current epoch stake is positive but withdrawing it will revert
  //  unless deactivated first. We use the lower of the current and next epoch undelegated stake.
  const getStakeAmount = (index: number): string | undefined => {
    const result = data?.[index]?.result as any
    const current = result?.currentEpochBalance
    const next = result?.nextEpochBalance
    if (current === undefined || next === undefined) {
      return undefined
    }
    return JSBI.greaterThan(JSBI.BigInt(String(current)), JSBI.BigInt(String(next)))
      ? String(next)
      : String(current)
  }

  const userFreeStakeRaw = getStakeAmount(0)
  const userDelegatedStakeRaw = getStakeAmount(1)
  const smartPoolFreeStakeRaw = smartPoolAddress ? getStakeAmount(2) : undefined
  const smartPoolDelegatedStakeRaw = smartPoolAddress ? getStakeAmount(3) : undefined

  return data && grg
    ? {
        userFreeStake: userFreeStakeRaw ? CurrencyAmount.fromRawAmount(grg, userFreeStakeRaw) : undefined,
        userDelegatedStake: userDelegatedStakeRaw ? CurrencyAmount.fromRawAmount(grg, userDelegatedStakeRaw) : undefined,
        smartPoolFreeStake: smartPoolFreeStakeRaw ? CurrencyAmount.fromRawAmount(grg, smartPoolFreeStakeRaw) : undefined,
        smartPoolDelegatedStake: smartPoolDelegatedStakeRaw
          ? CurrencyAmount.fromRawAmount(grg, smartPoolDelegatedStakeRaw)
          : undefined,
      }
    : {
        userFreeStake: undefined,
        userDelegatedStake: undefined,
        smartPoolFreeStake: undefined,
        smartPoolDelegatedStake: undefined,
      }
}

export interface UnclaimedReward {
  chainId: number
  poolId: string
  yieldAmount: CurrencyAmount<Token>
}

interface UseUnclaimedRewardsArgs {
  /** Address to check as delegator. Defaults to the connected wallet. */
  farmer?: string
  /** Per-chain pool IDs to check. */
  pools?: { poolId: string; chainId: number }[]
}

// TODO: this can be further optimized by grouping calls by chain and using a single batch per chain.
export function useUnclaimedRewards({ farmer, pools }: UseUnclaimedRewardsArgs): UnclaimedReward[] | undefined {
  const account = useAccount()
  const resolvedFarmer = farmer ?? account.address

  const contracts = useMemo(() => {
    if (!resolvedFarmer || !pools || pools.length === 0) {
      return []
    }
    const calls = []
    for (const { poolId, chainId } of pools) {
      const stakingAddr = STAKING_PROXY_ADDRESSES[chainId]
      if (!stakingAddr) {
        continue
      }
      calls.push({
        address: assume0xAddress(stakingAddr),
        abi: STAKING_ABI as Abi,
        functionName: 'computeRewardBalanceOfDelegator',
        args: [poolId, resolvedFarmer],
        chainId,
      })
    }
    return calls
  }, [resolvedFarmer, pools])

  const { data } = useReadContracts({
    contracts,
    query: {
      enabled: contracts.length > 0,
      retry: 3,
      retryDelay: (attempt: number) => Math.min(attempt > 1 ? 2 ** attempt * 1000 : 1000, 30_000),
    },
  })

  return useMemo(() => {
    if (!data || !pools) {
      return undefined
    }
    const rewards: UnclaimedReward[] = []
    for (let i = 0; i < data.length; i++) {
      const call = contracts[i]
      const grg = GRG[call.chainId]
      const result = data[i]
      const value = (result as any)?.result ?? 0
      const amount = CurrencyAmount.fromRawAmount(grg, JSBI.BigInt(value.toString()))
      if (JSBI.greaterThan(amount.quotient, JSBI.BigInt(0))) {
        rewards.push({ chainId: call.chainId, poolId: call.args[0] as string, yieldAmount: amount })
      }
    }
    return rewards
  }, [data, contracts, pools])
}

interface UserStakeData {
  stake: CurrencyAmount<Token>
  hasStake: boolean
}

export function useUserStakeBalances(poolIds: string[]): UserStakeData[] | undefined {
  const account = useAccount()
  const grg = useMemo(() => (account.chainId ? GRG[account.chainId] : undefined), [account.chainId])
  const stakingContract = useStakingContract()

  const inputs = useMemo(() => {
    return poolIds.map((poolId) => {
      return [account.address, poolId]
    })
  }, [account, poolIds])

  // TODO: verify we are correctly reading multiple poolIds in a single call
  const { data: userStakeBalances } = useReadContract({
    address: assume0xAddress(stakingContract?.address),
    chainId: account.chainId,
    abi: stakingContract?.interface.fragments,
    functionName: 'getStakeDelegatedToPoolByOwner',
    args: inputs,
    query: {
      enabled: !!stakingContract && inputs.length > 0,
      retry: 3,
      retryDelay: (attempt: number) => Math.min(attempt > 1 ? 2 ** attempt * 1000 : 1000, 30_000),
    },
  })

  return useMemo(() => {
    if (!userStakeBalances || !grg) {
      return undefined
    }
    return (userStakeBalances as any[]).map((balance) => {
      const stake = balance?.result?.[0].nextEpochBalance
      const stakeAmount = CurrencyAmount.fromRawAmount(grg, stake ?? JSBI.BigInt(0))
      return {
        stake: stakeAmount,
        hasStake: JSBI.greaterThan(stakeAmount.quotient, JSBI.BigInt(0)),
      }
    })
  }, [grg, userStakeBalances])
}

export function useUnstakeCallback(chainId?: number): (amount: CurrencyAmount<Token>, isPool?: boolean) => undefined | Promise<string> {
  const account = useAccount()
  const provider = useEthersWeb3Provider({ chainId })
  const stakingContract = useStakingContract(chainId)
  const { poolAddress: poolAddressFromUrl } = useParams<{
    poolAddress?: string
  }>()
  const poolContract = usePoolExtendedContract(poolAddressFromUrl ?? undefined, chainId)

  // state for pending and submitted txn views
  const addTransaction = useTransactionAdder()

  return useCallback(
    (amount: CurrencyAmount<Token>, isPool?: boolean) => {
      if (!provider || !account.chainId || !account.address) {
        return undefined
      }
      if (!stakingContract) {
        throw new Error('No Staking Proxy Contract!')
      }
      if (isPool && !poolContract) {
        throw new Error('No Pool Contract!')
      }
      if (!isPool) {
        return (async (): Promise<string> => {
          const estimatedGasLimit = await stakingContract.estimateGas.unstake(amount.quotient.toString(), {}) as BigNumber
          const response = await stakingContract.unstake(amount.quotient.toString(), {
            value: null,
            gasLimit: calculateGasMargin(estimatedGasLimit),
          }) as TransactionResponse
          addTransaction(response, {
            type: TransactionType.ClaimUni,
            recipient: account.address ?? '',
          })
          return response.hash
        })()
      } else {
        return (async (): Promise<string> => {
          if (!poolContract) {
            throw new Error('No Pool Contract!')
          }
          const estimatedGasLimit = await poolContract.estimateGas.unstake(amount.quotient.toString(), {}) as BigNumber
          const response = await poolContract.unstake(amount.quotient.toString(), {
            value: null,
            gasLimit: calculateGasMargin(estimatedGasLimit),
          }) as TransactionResponse
          addTransaction(response, {
            type: TransactionType.ClaimUni,
            recipient: poolContract.address,
          })
          return response.hash
        })()
      }
    },
    [account.address, account.chainId, provider, poolContract, stakingContract, addTransaction],
  )
}

export function useHarvestCallback({
  chainId,
  poolAddress,
  isPool = false,
}: {
  chainId: number
  poolAddress?: string
  isPool?: boolean
}): (poolIds: string[]) => undefined | Promise<string> {
  const account = useAccount()
  const provider = useEthersWeb3Provider({ chainId })
  const { poolAddress: poolAddressFromUrl } = useParams<{
    poolAddress?: string
  }>()
  const effectivePoolAddress = poolAddress ?? poolAddressFromUrl
  const stakingContract = useStakingContract(chainId)
  const stakingProxy = useStakingProxyContract(chainId)
  const poolContract = usePoolExtendedContract(effectivePoolAddress ?? undefined, chainId)

  // state for pending and submitted txn views
  const addTransaction = useTransactionAdder()

  return useCallback(
    (poolIds: string[]) => {
      if (!provider || !account.chainId || !account.address) {
        return undefined
      }
      if (!stakingContract || !stakingProxy) {
        throw new Error('No Staking Proxy Contract!')
      }
      if (isPool && !poolContract) {
        throw new Error('No Pool Contract!')
      }
      const harvestCalls: string[] = []
      for (const poolId of poolIds) {
        const harvestCall = !isPool
          ? stakingContract.interface.encodeFunctionData('withdrawDelegatorRewards', [poolId])
          : poolContract?.interface.encodeFunctionData('withdrawDelegatorRewards')
        if (harvestCall) {
          harvestCalls.push(harvestCall)
        }
      }
      if (!isPool) {
        return (async (): Promise<string> => {
          const estimatedGasLimit = await stakingProxy.estimateGas.batchExecute(harvestCalls, {}) as BigNumber
          const response = await stakingProxy.batchExecute(harvestCalls, {
            value: null,
            gasLimit: calculateGasMargin(estimatedGasLimit),
          }) as TransactionResponse
          addTransaction(response, {
            type: TransactionType.ClaimUni,
            recipient: account.address ?? '',
          })
          return response.hash
        })()
      } else {
        return (async (): Promise<string> => {
          if (!poolContract) {
            throw new Error('No Pool Contract!')
          }
          const estimatedGasLimit = await poolContract.estimateGas.withdrawDelegatorRewards({}) as BigNumber
          const response = await poolContract.withdrawDelegatorRewards({
            value: null,
            gasLimit: calculateGasMargin(estimatedGasLimit),
          }) as TransactionResponse
          addTransaction(response, {
            type: TransactionType.ClaimUni,
            recipient: poolContract.address,
          })
          return response.hash
        })()
      }
    },
    [account.address, account.chainId, provider, poolContract, stakingContract, stakingProxy, isPool, addTransaction],
  )
}

export function usePopContract(): Contract | null {
  const account = useAccount()
  return useContract({
    address: account.chainId ? POP_ADDRESSES[account.chainId] : undefined,
    ABI: POP_ABI,
    withSignerIfPossible: true,
  })
}

export function useRaceCallback(): (poolAddress: string | undefined) => undefined | Promise<string> {
  const account = useAccount()
  const provider = useEthersWeb3Provider()
  const popContract = usePopContract()

  // state for pending and submitted txn views
  const addTransaction = useTransactionAdder()

  return useCallback(
    (poolAddress: string | undefined) => {
      if (!provider || !account.chainId || !account.address) {
        return undefined
      }
      if (!popContract) {
        throw new Error('No PoP Contract!')
      }
      return (async (): Promise<string> => {
        const estimatedGasLimit = await popContract.estimateGas.creditPopRewardToStakingProxy(poolAddress, {}) as BigNumber
        const response = await popContract.creditPopRewardToStakingProxy(poolAddress, {
          value: null,
          gasLimit: calculateGasMargin(estimatedGasLimit),
        }) as TransactionResponse
        addTransaction(response, {
          type: TransactionType.ClaimUni,
          recipient: account.address ?? '',
        })
        return response.hash
      })()
    },
    [account.address, account.chainId, provider, popContract, addTransaction],
  )
}
