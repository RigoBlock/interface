import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { GetLatestCheckpointRequest } from '@uniswap/client-data-api/dist/data/v1/auction_pb'
import { AddressStringFormat, type EVMUniverseChainId, normalizeAddress } from '@universe/chains'
import { useEffect, useMemo } from 'react'
import { auctionQueries } from 'uniswap/src/data/apiClients/dataApiService/auctions/auctionQueries'
import { getBlockNumberQueryOptions } from 'uniswap/src/features/providers/getBlockNumberQueryOptions'
import { useEvent, usePrevious } from 'utilities/src/react/hooks'
import { ONE_MINUTE_MS } from 'utilities/src/time/time'
import type { CurrencyRaisedState, CurrentBlockState } from '~/features/Toucan/Auction/utils/resolveAuctionDisplayState'
import { safeBigInt } from '~/features/Toucan/Auction/utils/safeBigInt'
import { useTokenPoolState } from '~/hooks/useTokenPoolState'
import type { TokenPoolState } from '~/types/tokenPool'
import { getAverageBlockTimeMs, getPollingIntervalMs } from '~/utils/averageBlockTimeMs'

const FAR_FROM_BOUNDARY_POLL_INTERVAL_MS = 2 * ONE_MINUTE_MS
// Switch to the chain's faster polling interval within this window.
const NEAR_BOUNDARY_WINDOW_MS = 2 * ONE_MINUTE_MS

export interface AuctionDisplayDataSources {
  currentBlock: CurrentBlockState
  currencyRaised: CurrencyRaisedState
  pools: TokenPoolState
  /** Re-reads the chain head on demand — the TDP countdown calls it when it reaches zero. */
  refetchCurrentBlock: () => void
}

export function useAuctionDisplayDataSources({
  chainId,
  tokenAddress,
  auctionAddress,
  startBlock,
  endBlock,
  enabled,
  currentBlock: suppliedCurrentBlock,
}: {
  chainId: EVMUniverseChainId | undefined
  tokenAddress: string | undefined
  auctionAddress: string | undefined
  startBlock: string | undefined
  endBlock: string | undefined
  enabled: boolean
  /** Reuse the ADP's block source, including loading and error states, without another poller. */
  currentBlock?: CurrentBlockState
}): AuctionDisplayDataSources {
  const parsedStartBlock = useMemo(() => safeBigInt(startBlock), [startBlock])
  const parsedEndBlock = useMemo(() => safeBigInt(endBlock), [endBlock])
  const blockEnabled = enabled && chainId !== undefined && suppliedCurrentBlock === undefined
  const blockQuery = useQuery({
    ...getBlockNumberQueryOptions({ chainId, enabled: blockEnabled }),
    refetchInterval: (query) =>
      getBlockPollingInterval({
        blockNumber: query.state.data,
        startBlock: parsedStartBlock,
        endBlock: parsedEndBlock,
        chainId,
      }),
  })

  const currentBlock = deriveCurrentBlockState({ enabled, suppliedCurrentBlock, blockEnabled, blockQuery })
  const currentBlockNumber = currentBlock.status === 'success' ? currentBlock.blockNumber : undefined
  const isAtOrPastEndBlock =
    parsedStartBlock !== null &&
    parsedStartBlock >= 0n &&
    parsedEndBlock !== null &&
    parsedEndBlock >= 0n &&
    currentBlockNumber !== undefined &&
    currentBlockNumber >= parsedEndBlock

  const { poolState: pools, refetch: refetchPools } = useTokenPoolState({ chainId, tokenAddress, enabled })
  const wasAtOrPastEndBlock = usePrevious(isAtOrPastEndBlock)

  useEffect(() => {
    // The pool hook handles mount; this caller handles auction-end transitions.
    if (wasAtOrPastEndBlock !== undefined && wasAtOrPastEndBlock !== isAtOrPastEndBlock) {
      void refetchPools()
    }
  }, [isAtOrPastEndBlock, wasAtOrPastEndBlock, refetchPools])

  const checkpointEnabled = enabled && chainId !== undefined && Boolean(auctionAddress) && isAtOrPastEndBlock
  const checkpointParams = useMemo(
    () =>
      checkpointEnabled && auctionAddress
        ? new GetLatestCheckpointRequest({
            chainId,
            address: normalizeAddress(auctionAddress, AddressStringFormat.Lowercase),
          })
        : undefined,
    [auctionAddress, chainId, checkpointEnabled],
  )
  // TODO(CONS-3362): determine whether an auction graduated or failed on the backend instead of here.
  // A fresh request can still return a cached amount from before the auction ended.
  const checkpointQuery = useQuery(
    auctionQueries.getLatestCheckpoint({
      params: checkpointParams,
      enabled: checkpointEnabled,
      // Refresh on mount before using a cached amount to resolve the ended auction.
      staleTime: 0,
    }),
  )

  const currencyRaised = deriveCurrencyRaisedState({ enabled: checkpointEnabled, checkpointQuery })

  const refetchCurrentBlock = useEvent((): void => {
    void blockQuery.refetch()
  })

  return {
    currentBlock,
    currencyRaised,
    pools,
    refetchCurrentBlock,
  }
}

function deriveCurrentBlockState({
  enabled,
  suppliedCurrentBlock,
  blockEnabled,
  blockQuery,
}: {
  enabled: boolean
  suppliedCurrentBlock: CurrentBlockState | undefined
  blockEnabled: boolean
  blockQuery: Pick<UseQueryResult<bigint>, 'data' | 'isError'>
}): CurrentBlockState {
  if (enabled && suppliedCurrentBlock !== undefined) {
    return suppliedCurrentBlock
  }
  if (blockEnabled && blockQuery.data !== undefined) {
    // Keep the last successful head through a failed refetch.
    return { status: 'success', blockNumber: blockQuery.data }
  }
  if (blockEnabled && blockQuery.isError) {
    return { status: 'error' }
  }
  return { status: 'loading' }
}

function deriveCurrencyRaisedState({
  enabled,
  checkpointQuery,
}: {
  enabled: boolean
  checkpointQuery: UseQueryResult<{ currencyRaised: string }>
}): CurrencyRaisedState {
  if (!enabled) {
    return { status: 'idle' }
  }
  // A failed refetch also sets isFetchedAfterMount; retained pre-end data is not a settled result.
  if (checkpointQuery.isSuccess && checkpointQuery.isFetchedAfterMount) {
    return { status: 'success', currencyRaised: checkpointQuery.data.currencyRaised }
  }
  if (checkpointQuery.isError) {
    return { status: 'error' }
  }
  return { status: 'loading' }
}

/** Poll more often near a phase boundary and stop at the end. */
function getBlockPollingInterval({
  blockNumber,
  startBlock,
  endBlock,
  chainId,
}: {
  blockNumber: bigint | undefined
  startBlock: bigint | null
  endBlock: bigint | null
  chainId: EVMUniverseChainId | undefined
}): number | false {
  // Keep the initial query for Unknown, but there is no phase to poll without valid bounds.
  if (startBlock === null || startBlock < 0n || endBlock === null || endBlock < 0n) {
    return false
  }
  if (blockNumber === undefined) {
    return FAR_FROM_BOUNDARY_POLL_INTERVAL_MS
  }
  if (blockNumber >= endBlock) {
    return false
  }

  const nextBoundary = blockNumber < startBlock ? startBlock : endBlock
  const timeToBoundary = (nextBoundary - blockNumber) * BigInt(getAverageBlockTimeMs(chainId))
  return timeToBoundary <= BigInt(NEAR_BOUNDARY_WINDOW_MS)
    ? getPollingIntervalMs(chainId)
    : FAR_FROM_BOUNDARY_POLL_INTERVAL_MS
}
