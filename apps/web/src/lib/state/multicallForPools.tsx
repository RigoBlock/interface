import { createMulticall, ListenerOptions } from '@uniswap/redux-multicall'
import { useAccount } from 'hooks/useAccount'
import { useInterfaceMulticall } from 'hooks/useContract'
import { useContext, useMemo } from 'react'
import { BlockNumberContext } from 'lib/hooks/useBlockNumber'
import { getChainInfo } from 'uniswap/src/features/chains/chainInfo'

const MISSING_PROVIDER = Symbol()

// Create a separate multicall instance specifically for pool queries
// This is independent from the main multicall system and won't be affected
// by chain switches in the swap context
const poolMulticall = createMulticall()

export default poolMulticall

/**
 * Multicall updater specifically for pool queries.
 * Unlike the main MulticallUpdater, this one ONLY uses the wallet's actual chainId
 * and is not affected by multicallUpdaterSwapChainId from the swap context.
 * 
 * This prevents pool queries from being invalidated when users swap tokens on different chains.
 */
export function PoolMulticallUpdater() {
  const account = useAccount()
  // CRITICAL: Only use account.chainId, never use multicallUpdaterSwapChainId
  const chainId = account.chainId
  
  // Get block number from context
  const blockNumberContext = useContext(BlockNumberContext)
  const latestBlockNumber = blockNumberContext !== MISSING_PROVIDER ? blockNumberContext.block : undefined
  
  const contract = useInterfaceMulticall(chainId)
  const listenerOptions: ListenerOptions = useMemo(
    () => ({ blocksPerFetch: chainId ? getChainInfo(chainId).blockPerMainnetEpochForChainId : 1 }),
    [chainId],
  )

  return (
    <poolMulticall.Updater
      chainId={chainId}
      latestBlockNumber={latestBlockNumber}
      contract={contract}
      listenerOptions={listenerOptions}
    />
  )
}
