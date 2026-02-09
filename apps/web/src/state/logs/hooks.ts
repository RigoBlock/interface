import type { Filter } from '@ethersproject/providers'
import { useAccount } from 'hooks/useAccount'
import useBlockNumber from 'lib/hooks/useBlockNumber'
import { useEffect, useMemo, useRef } from 'react'
import { useAppDispatch, useAppSelector } from 'state/hooks'
import { addListener, removeListener } from 'state/logs/slice'
import { filterToKey, isHistoricalLog, Log } from 'state/logs/utils'

// TODO: try deprecate logs if we still have issues retrieving them on altchains
enum LogsState {
  // The filter is invalid
  INVALID = 0,
  // The logs are being loaded
  LOADING = 1,
  // Logs are from a previous block number
  SYNCING = 2,
  // Tried to fetch logs but received an error
  ERROR = 3,
  // Logs have been fetched as of the latest block number
  SYNCED = 4,
}

interface UseLogsResult {
  logs?: Log[]
  state: LogsState
}

/**
 * Returns the logs for the given filter as of the latest block, re-fetching from the library every block.
 * @param filter The logs filter, with `fromBlock` or `toBlock` optionally specified.
 * The filter parameter should _always_ be memoized, or else will trigger constant refetching
 */
export function useLogs(filter: Filter | undefined): UseLogsResult {
  const { chainId } = useAccount()
  const blockNumber = useBlockNumber()

  const logs = useAppSelector((state) => state.logs)
  const dispatch = useAppDispatch()

  useEffect(() => {
    if (!filter || !chainId) {
      return undefined
    }

    dispatch(addListener({ chainId, filter }))
    return () => {
      dispatch(removeListener({ chainId, filter }))
    }
  }, [chainId, dispatch, filter])

  const rawResult = useMemo(() => {
    if (!chainId || !filter || !blockNumber) {
      return {
        logs: undefined,
        state: LogsState.INVALID,
      }
    }

    const state = logs[chainId]?.[filterToKey(filter)]
    const result = state?.results

    if (!result) {
      return {
        state: LogsState.LOADING,
        logs: undefined,
      }
    }

    if (result.error) {
      return {
        state: LogsState.ERROR,
        logs: undefined,
      }
    }

    return {
      // if we're only fetching logs until a block that has already elapsed, we're synced regardless of result.blockNumber
      state: isHistoricalLog(filter, blockNumber)
        ? LogsState.SYNCED
        : result.blockNumber >= blockNumber
          ? LogsState.SYNCED
          : LogsState.SYNCING,
      logs: result.logs,
    }
  }, [blockNumber, chainId, filter, logs])

  // Return a stable reference when the logs data hasn't actually changed.
  // This prevents downstream useMemo/useEffect from re-running and
  // re-triggering expensive wagmi RPC calls on every block.
  const prevLogsRef = useRef<Log[] | undefined>(undefined)
  const stableResult = useMemo(() => {
    const prevLogs = prevLogsRef.current
    if (rawResult.logs && prevLogs && rawResult.logs.length === prevLogs.length) {
      let same = true
      for (let i = 0; i < rawResult.logs.length; i++) {
        if (
          rawResult.logs[i].blockNumber !== prevLogs[i].blockNumber ||
          rawResult.logs[i].logIndex !== prevLogs[i].logIndex ||
          rawResult.logs[i].data !== prevLogs[i].data
        ) {
          same = false
          break
        }
      }
      if (same) {
        return { ...rawResult, logs: prevLogs }
      }
    }
    prevLogsRef.current = rawResult.logs
    return rawResult
  }, [rawResult])

  return stableResult
}
