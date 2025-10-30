import { useAccount } from 'hooks/useAccount'
import { useContext } from 'react'
import { BlockNumberContext } from 'lib/hooks/useBlockNumber'

const MISSING_PROVIDER = Symbol()

/**
 * Get block number for the wallet's actual chainId.
 * This accesses the BlockNumberContext which tracks blocks independently,
 * so we get the current block for whatever chain is active in the context.
 */
function useWalletBlockNumber(): number | undefined {
  const blockNumberContext = useContext(BlockNumberContext)
  if (blockNumberContext === MISSING_PROVIDER) {
    return undefined
  }
  
  // Return the current block number from context
  // The PoolMulticallUpdater ensures this is for the wallet's actual chainId
  return blockNumberContext.block
}

/**
 * Hook to provide call context for pool-related multicall queries.
 * This is used by pool-specific multicall hooks to ensure they always query
 * the wallet's actual chainId, not the swap context's chainId.
 * 
 * The key is that pool queries use PoolMulticallUpdater which never looks at
 * multicallUpdaterSwapChainId, so pool data remains stable when swapping across chains.
 */
export function usePoolCallContext() {
  const account = useAccount()
  const latestBlock = useWalletBlockNumber()
  return { chainId: account.chainId, latestBlock }
}
