import type { Filter } from '@ethersproject/providers'
//import { useWeb3React } from '@web3-react/core'
import { getBackupRpcProvider, RPC_PROVIDERS, TESTNET_RPC_PROVIDERS } from 'constants/providers'
import { useAccount } from 'hooks/useAccount'
import useBlockNumber from 'lib/hooks/useBlockNumber'
import { useEffect, useMemo } from 'react'
import { useAppDispatch, useAppSelector } from 'state/hooks'
import { fetchedLogs, fetchedLogsError, fetchingLogs } from 'state/logs/slice'
import { isHistoricalLog, keyToFilter } from 'state/logs/utils'
import { SUPPORTED_TESTNET_CHAIN_IDS, UniverseChainId } from 'uniswap/src/features/chains/types'
import { logger } from 'utilities/src/logger/logger'

export default function Updater(): null {
  const dispatch = useAppDispatch()
  const state = useAppSelector((state) => state.logs)
  const { chainId } = useAccount()
  //const { provider } = useWeb3React()
  // TODO: test that using our providers works inside mobile wallets
  // TODO: should be dependent on chainId, so we can switch provider on switch chain, unless we
  //  use our multichain provider
  let provider = RPC_PROVIDERS[chainId ?? UniverseChainId.Mainnet]

  if (SUPPORTED_TESTNET_CHAIN_IDS.includes(chainId ?? UniverseChainId.Sepolia)) {
    provider = TESTNET_RPC_PROVIDERS[chainId ?? UniverseChainId.Sepolia]
  }

  // TODO: check if we want to use our endpoints as addition to use onchain logs and ours combined
  // TODO: check define provider inside useEffect, so will update on chain switch.
  if (chainId === UniverseChainId.Bnb) {
    provider = getBackupRpcProvider(chainId ?? UniverseChainId.Mainnet)
  }

  const blockNumber = useBlockNumber()

  const filtersNeedFetch: Filter[] = useMemo(() => {
    if (!chainId || typeof blockNumber !== 'number') {
      return []
    }

    const active = state[chainId]
    if (!active) {
      return []
    }

    return Object.keys(active)
      .filter((key) => {
        const { fetchingBlockNumber, results, listeners } = active[key]
        if (listeners === 0) {
          return false
        }
        if (typeof fetchingBlockNumber === 'number' && fetchingBlockNumber >= blockNumber) {
          return false
        }
        if (results && typeof results.blockNumber === 'number' && results.blockNumber >= blockNumber) {
          return false
        }
        // this condition ensures that if a log is historical, and it's already fetched, we don't re-fetch it
        if (isHistoricalLog(keyToFilter(key), blockNumber) && results?.logs !== undefined) {
          return false
        }
        return true
      })
      .map((key) => keyToFilter(key))
  }, [blockNumber, chainId, state])

  useEffect(() => {
    if (!provider || !chainId || typeof blockNumber !== 'number' || filtersNeedFetch.length === 0) {
      return
    }

    dispatch(fetchingLogs({ chainId, filters: filtersNeedFetch, blockNumber }))
    filtersNeedFetch.forEach((filter) => {
      // provide defaults if {from,to}Block are missing
      let fromBlock = filter.fromBlock ?? 0
      let toBlock = filter.toBlock ?? blockNumber
      if (typeof fromBlock === 'string') {
        fromBlock = Number.parseInt(fromBlock)
      }
      if (typeof toBlock === 'string') {
        toBlock = Number.parseInt(toBlock)
      }
      provider
        .getLogs({
          ...filter,
          fromBlock,
          toBlock,
        })
        .then((logs) => {
          dispatch(
            fetchedLogs({
              chainId,
              filter,
              results: { logs, blockNumber },
            }),
          )
        })
        .catch((error) => {
          logger.warn('logs/updater', 'Updater#useEffect', 'Failed to fetch logs', { error, filter })
          dispatch(
            fetchedLogsError({
              chainId,
              filter,
              blockNumber,
            }),
          )
        })
    })
  }, [blockNumber, chainId, dispatch, filtersNeedFetch, provider])

  return null
}
