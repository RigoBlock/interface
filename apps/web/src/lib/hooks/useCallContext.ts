import useBlockNumber from 'lib/hooks/useBlockNumber'
import { useMultichainContext } from 'state/multichain/useMultichainContext'

export function useCallContext() {
  const { chainId } = useMultichainContext()
  const latestBlock = useBlockNumber()
  // When latestBlock is undefined (e.g., after chain switch), use 0 to ensure multicalls still execute
  // The multicall updater will handle fetching the actual latest block
  return { chainId, latestBlock: latestBlock ?? 0 }
}
