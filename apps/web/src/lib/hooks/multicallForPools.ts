import { usePoolCallContext } from 'lib/hooks/usePoolCallContext'
import multicall from 'lib/state/multicall'
import { SkipFirst } from 'types/tuple'

export { NEVER_RELOAD } from '@uniswap/redux-multicall' // re-export for convenience
export type { CallStateResult } from '@uniswap/redux-multicall' // re-export for convenience

// Create wrappers for pool-specific multicall hooks that use the wallet's chainId
// instead of the swap multichain context chainId. This prevents pool queries from
// re-fetching when users swap tokens on different chains.

type SkipFirstTwoParams<T extends (...args: any) => any> = SkipFirst<Parameters<T>, 2>

export function useMultipleContractSingleDataForPools(
  ...args: SkipFirstTwoParams<typeof multicall.hooks.useMultipleContractSingleData>
) {
  const { chainId, latestBlock } = usePoolCallContext()
  return multicall.hooks.useMultipleContractSingleData(chainId, latestBlock, ...args)
}

export function useSingleCallResultForPools(...args: SkipFirstTwoParams<typeof multicall.hooks.useSingleCallResult>) {
  const { chainId, latestBlock } = usePoolCallContext()
  return multicall.hooks.useSingleCallResult(chainId, latestBlock, ...args)
}

export function useSingleContractMultipleDataForPools(
  ...args: SkipFirstTwoParams<typeof multicall.hooks.useSingleContractMultipleData>
) {
  const { chainId, latestBlock } = usePoolCallContext()
  return multicall.hooks.useSingleContractMultipleData(chainId, latestBlock, ...args)
}
