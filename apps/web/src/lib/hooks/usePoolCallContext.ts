import { useAccount } from 'hooks/useAccount'
import useBlockNumber from 'lib/hooks/useBlockNumber'

/**
 * Hook to provide call context for pool-related multicall queries.
 * Unlike useCallContext(), this always uses the actual wallet's chainId,
 * ignoring the swap multichain context chainId.
 * 
 * This prevents pool queries from re-fetching when users swap tokens on different chains,
 * which was causing CreatePool and Stake pages to show "loading" forever.
 */
export function usePoolCallContext() {
  const account = useAccount()
  const latestBlock = useBlockNumber()
  return { chainId: account.chainId, latestBlock }
}
