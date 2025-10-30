import { usePoolCallContext } from 'lib/hooks/usePoolCallContext'
import poolMulticall from 'lib/state/multicallForPools'
import { SkipFirst } from 'types/tuple'

export { NEVER_RELOAD } from '@uniswap/redux-multicall' // re-export for convenience
export type { CallStateResult } from '@uniswap/redux-multicall' // re-export for convenience

// Create wrappers for pool-specific multicall hooks that use a separate multicall instance
// dedicated to pool queries. This instance uses the wallet's chainId and is not affected
// by multicallUpdaterSwapChainId from the swap context.
//
// This prevents pool queries from being invalidated when users swap tokens on different chains.

type SkipFirstTwoParams<T extends (...args: any) => any> = SkipFirst<Parameters<T>, 2>

export function useMultipleContractSingleDataForPools(
  ...args: SkipFirstTwoParams<typeof poolMulticall.hooks.useMultipleContractSingleData>
) {
  const { chainId, latestBlock } = usePoolCallContext()
  return poolMulticall.hooks.useMultipleContractSingleData(chainId, latestBlock, ...args)
}

export function useSingleCallResultForPools(...args: SkipFirstTwoParams<typeof poolMulticall.hooks.useSingleCallResult>) {
  const { chainId, latestBlock } = usePoolCallContext()
  return poolMulticall.hooks.useSingleCallResult(chainId, latestBlock, ...args)
}

export function useSingleContractMultipleDataForPools(
  ...args: SkipFirstTwoParams<typeof poolMulticall.hooks.useSingleContractMultipleData>
) {
  const { chainId, latestBlock } = usePoolCallContext()
  return poolMulticall.hooks.useSingleContractMultipleData(chainId, latestBlock, ...args)
}
