import { Contract } from '@ethersproject/contracts'
import type { TransactionResponse } from '@ethersproject/providers'
import { CurrencyAmount, Token } from '@uniswap/sdk-core'
import { POP_ADDRESSES } from 'constants/addresses'
import { useAccount } from 'hooks/useAccount'
import { useEthersWeb3Provider } from 'hooks/useEthersProvider'
import { useContract } from 'hooks/useContract'
import JSBI from 'jsbi'
import { useCallback, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { StakeStatus, useStakingContract, useStakingProxyContract } from 'state/governance/hooks'
import { usePoolExtendedContract } from 'state/pool/hooks'
import { useTransactionAdder } from 'state/transactions/hooks'
import { TransactionType } from 'uniswap/src/features/transactions/types/transactionDetails'
import { GRG } from 'uniswap/src/constants/tokens'
import POP_ABI from 'uniswap/src/abis/pop.json'
import { calculateGasMargin } from 'utils/calculateGasMargin'
import { useReadContract } from 'wagmi'
import { assume0xAddress } from 'utils/wagmi'

export function useFreeStakeBalance(isDelegateFreeStake?: boolean): CurrencyAmount<Token> | undefined {
  const account = useAccount()
  const grg = useMemo(() => (account.chainId ? GRG[account.chainId] : undefined), [account.chainId])
  const stakingContract = useStakingContract()
  const { poolAddress: poolAddressFromUrl } = useParams<{ poolAddress?: string }>()
  // TODO: check if can improve as whenever there is an address in the url the pool's balance will be checked
  const queryEnabled = !!account.address && !!stakingContract
  const { data: freeStake } = useReadContract({
    address: assume0xAddress(stakingContract?.address),
    chainId: account.chainId,
    abi: stakingContract?.interface.fragments,
    functionName: 'getOwnerStakeByStatus',
    args: [
      isDelegateFreeStake ? account.address : poolAddressFromUrl ?? account.address,
      StakeStatus.UNDELEGATED,
    ],
    query: { enabled: queryEnabled },
  })

  // when all stake has been delegated, the current epoch stake is positive but withdrawing it will revert
  //  unless deactivated first. We use the lower of the current and next epoch undelegated stake.
  return freeStake && grg
    ? CurrencyAmount.fromRawAmount(
        grg,
        Number((freeStake as any).currentEpochBalance) > Number((freeStake as any).nextEpochBalance)
          ? (freeStake as any).nextEpochBalance
          : (freeStake as any).currentEpochBalance
      )
    : undefined
}

interface UnclaimedRewardsData {
  yieldAmount: CurrencyAmount<Token>
  yieldPoolId: string
}

// TODO: check as from pool page we are passing [] if not pool operator, i.e. we want to skip the rpc call when normal user
export function useUnclaimedRewards(poolIds: string[]): UnclaimedRewardsData[] | undefined {
  const account = useAccount()
  const grg = useMemo(() => (account.chainId ? GRG[account.chainId] : undefined), [account.chainId])
  const stakingContract = useStakingContract()
  const { poolAddress: poolAddressFromUrl } = useParams<{ poolAddress?: string }>()
  //const members = Array(poolIds.length).fill(poolAddressFromUrl ?? account)
  const farmer = poolAddressFromUrl ?? account.address
  // TODO: check if can improve as whenever there is an address in the url the pool's balance will be checked
  //  we should check the logic of appending pool address as we should also append its pool id, but will result
  //  in a duplicate id, however the positive reward filter will return that id either for user or for pool, never both
  //  [poolIds, poolAddressFromUrl ? [...members, ...poolAddressFromUrl] : members]
  const inputs = useMemo(() => {
    return poolIds.map((poolId) => {
      return [poolId, farmer]
    })
  }, [farmer, poolIds])

  const { data: unclaimedRewards } = useReadContract({
    address: assume0xAddress(stakingContract?.address),
    chainId: account.chainId,
    abi: stakingContract?.interface.fragments,
    functionName: 'computeRewardBalanceOfDelegator',
    args: inputs,
    query: { enabled: !!stakingContract && inputs.length > 0 },
  })

  return useMemo(() => {
    if (!unclaimedRewards || !grg) {
      return undefined
    }
    return (unclaimedRewards as any[])
      .map((reward, i) => {
        const value = reward?.result?.[0]
        return {
          yieldAmount: CurrencyAmount.fromRawAmount(grg, value ?? JSBI.BigInt(0)),
          yieldPoolId: poolIds[i],
        }
      })
      .filter((p) => JSBI.greaterThan(p.yieldAmount.quotient, JSBI.BigInt(0)))
  }, [grg, unclaimedRewards, poolIds])
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
    query: { enabled: !!stakingContract && inputs.length > 0 },
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

export function useUnstakeCallback(): (amount: CurrencyAmount<Token>, isPool?: boolean) => undefined | Promise<string> {
  const account = useAccount()
  const provider = useEthersWeb3Provider()
  const stakingContract = useStakingContract()
  const { poolAddress: poolAddressFromUrl } = useParams<{ poolAddress?: string }>()
  const poolContract = usePoolExtendedContract(poolAddressFromUrl ?? undefined)

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
        return stakingContract.estimateGas.unstake(amount.quotient.toString(), {}).then((estimatedGasLimit) => {
          return stakingContract
            .unstake(amount.quotient.toString(), {
              value: null,
              gasLimit: calculateGasMargin(estimatedGasLimit),
            })
            .then((response: TransactionResponse) => {
              addTransaction(response, {
                type: TransactionType.ClaimUni,
                recipient: account.address ?? '',
              })
              return response.hash
            })
        })
      } else {
        return poolContract?.estimateGas.unstake(amount.quotient.toString(), {}).then((estimatedGasLimit) => {
          return poolContract
            .unstake(amount.quotient.toString(), {
              value: null,
              gasLimit: calculateGasMargin(estimatedGasLimit),
            })
            .then((response: TransactionResponse) => {
              addTransaction(response, {
                type: TransactionType.ClaimUni,
                recipient: poolContract.address,
              })
              return response.hash
            })
        })
      }
    },
    [account.address, account.chainId, provider, poolContract, stakingContract, addTransaction]
  )
}

export function useHarvestCallback(): (poolIds: string[], isPool?: boolean) => undefined | Promise<string> {
  const account = useAccount()
  const provider = useEthersWeb3Provider()
  const stakingContract = useStakingContract()
  const stakingProxy = useStakingProxyContract()
  const { poolAddress: poolAddressFromUrl } = useParams<{ poolAddress?: string }>()
  const poolContract = usePoolExtendedContract(poolAddressFromUrl ?? undefined)

  // state for pending and submitted txn views
  const addTransaction = useTransactionAdder()

  return useCallback(
    (poolIds: string[], isPool?: boolean) => {
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
      // when withdrawing pool rewards we will pass an array of only 1 pool ids
      // TODO: we encode pool calls but do not use them as we want to use direct method instead of multicall.
      //  Check if should remove encoding call for pool.
      for (const poolId of poolIds) {
        const harvestCall = !isPool
          ? stakingContract.interface.encodeFunctionData('withdrawDelegatorRewards', [poolId])
          : poolContract?.interface.encodeFunctionData('withdrawDelegatorRewards')
        if (harvestCall) {
          harvestCalls.push(harvestCall)
        }
      }
      if (!isPool) {
        return stakingProxy.estimateGas.batchExecute(harvestCalls, {}).then((estimatedGasLimit) => {
          return stakingProxy
            .batchExecute(harvestCalls, {
              value: null,
              gasLimit: calculateGasMargin(estimatedGasLimit),
            })
            .then((response: TransactionResponse) => {
              addTransaction(response, {
                type: TransactionType.ClaimUni,
                recipient: account.address ?? '',
              })
              return response.hash
            })
        })
      } else {
        return poolContract?.estimateGas.withdrawDelegatorRewards({}).then((estimatedGasLimit) => {
          return poolContract
            .withdrawDelegatorRewards({
              value: null,
              gasLimit: calculateGasMargin(estimatedGasLimit),
            })
            .then((response: TransactionResponse) => {
              addTransaction(response, {
                type: TransactionType.ClaimUni,
                recipient: poolContract.address,
              })
              return response.hash
            })
        })
      }
    },
    [account.address, account.chainId, provider, poolContract, stakingContract, stakingProxy, addTransaction]
  )
}

export function usePopContract(): Contract | null {
  const account = useAccount()
  return useContract({
    address:account.chainId ? POP_ADDRESSES[account.chainId] : undefined,
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
      return popContract.estimateGas.creditPopRewardToStakingProxy(poolAddress, {}).then((estimatedGasLimit) => {
        return popContract
          .creditPopRewardToStakingProxy(poolAddress, {
            value: null,
            gasLimit: calculateGasMargin(estimatedGasLimit),
          })
          .then((response: TransactionResponse) => {
            addTransaction(response, {
              type: TransactionType.ClaimUni,
              recipient: account.address ?? '',
            })
            return response.hash
          })
      })
    },
    [account.address, account.chainId, provider, popContract, addTransaction]
  )
}
