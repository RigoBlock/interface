import { CurrencyAmount, Token } from '@uniswap/sdk-core'
import JSBI from 'jsbi'
import { useMemo } from 'react'
import { useParams } from 'react-router'
import STAKING_ABI from 'uniswap/src/abis/staking-impl.json'
import { GRG } from 'uniswap/src/constants/tokens'
import type { Abi } from 'viem'
import { useReadContracts } from 'wagmi'
import { STAKING_PROXY_ADDRESSES } from '~/constants/addresses'
import { useAccount } from '~/hooks/useAccount'
import { StakeStatus } from '~/state/governance/hooks'
import { assume0xAddress } from '~/utils/wagmi'

export interface FreeStakeBalanceByChain {
  chainId: number
  freeStakeBalance: CurrencyAmount<Token>
}

/**
 * Returns free (undelegated) stake balances for the given chains in a single batch.
 * Useful for the Earn action bar and pool detail page, where the user may have free stake
 * to unstake on multiple chains and needs to pick one.
 */
export function useMultiChainFreeStakeBalances(
  isDelegateFreeStake?: boolean,
  chains?: number[],
): FreeStakeBalanceByChain[] | undefined {
  const account = useAccount()
  const { poolAddress: poolAddressFromUrl } = useParams<{
    poolAddress?: string
  }>()
  const ownerAddress = isDelegateFreeStake ? account.address : (poolAddressFromUrl ?? account.address)

  const contracts = useMemo(() => {
    if (!ownerAddress || !chains || chains.length === 0) {
      return []
    }
    return chains
      .map((chainId) => {
        const stakingProxyAddress = STAKING_PROXY_ADDRESSES[chainId]
        if (!stakingProxyAddress) {
          return undefined
        }
        return {
          address: assume0xAddress(stakingProxyAddress),
          abi: STAKING_ABI as Abi,
          functionName: 'getOwnerStakeByStatus',
          args: [ownerAddress, StakeStatus.UNDELEGATED],
          chainId,
        }
      })
      .filter((c): c is NonNullable<typeof c> => c !== undefined)
  }, [chains, ownerAddress])

  const queryEnabled = !!account.address && contracts.length > 0

  const { data } = useReadContracts({
    contracts,
    query: {
      enabled: queryEnabled,
      staleTime: 5 * 60_000,
      gcTime: 5 * 60_000,
      retry: 3,
      retryDelay: (attempt: number) => Math.min(attempt > 1 ? 2 ** attempt * 1000 : 1000, 30_000),
      refetchOnWindowFocus: false,
    },
  })

  return useMemo(() => {
    if (!data || !chains) {
      return undefined
    }
    const balances: FreeStakeBalanceByChain[] = []
    for (let i = 0; i < data.length; i++) {
      const chainId = contracts[i]?.chainId
      const grg = chainId ? GRG[chainId] : undefined
      const result = data[i]
      if (!grg) {
        continue
      }
      const raw = result as any
      const current = raw?.result?.currentEpochBalance
      const next = raw?.result?.nextEpochBalance
      if (current === undefined || next === undefined) {
        continue
      }
      const amount = JSBI.greaterThan(JSBI.BigInt(String(current)), JSBI.BigInt(String(next)))
        ? String(next)
        : String(current)
      const freeStakeBalance = CurrencyAmount.fromRawAmount(grg, amount)
      if (JSBI.greaterThan(freeStakeBalance.quotient, JSBI.BigInt(0))) {
        balances.push({ chainId, freeStakeBalance })
      }
    }
    return balances
  }, [data, chains, contracts])
}
