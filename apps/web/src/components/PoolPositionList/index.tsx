import { AbiCoder } from '@ethersproject/abi'
import { getAddress } from '@ethersproject/address'
import { BigNumber } from '@ethersproject/bignumber'
import { keccak256 } from '@ethersproject/keccak256'
import Loader from 'components/Icons/LoadingSpinner'
import PoolPositionGroupedListItem from 'components/PoolPositionGroupedListItem'
import { useAccount } from 'hooks/useAccount'
import styled from 'lib/styled-components'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import InfiniteScroll from 'react-infinite-scroll-component'
import { Trans } from 'react-i18next'
import { MEDIA_WIDTHS } from 'theme'
import { PoolPositionDetails } from 'types/position'
import { Flex, Text } from 'ui/src'
import { assume0xAddress } from 'utils/wagmi'
import { useReadContracts } from 'wagmi'

const DesktopHeader = styled.div`
  display: none;
  font-size: 14px;
  font-weight: 500;
  padding: 16px;
  border-bottom: 1px solid ${({ theme }) => theme.surface3};

  @media screen and (min-width: ${MEDIA_WIDTHS.deprecated_upToSmall}px) {
    align-items: center;
    display: flex;
    justify-content: space-between;
    & > div:last-child {
      text-align: right;
      margin-right: 12px;
    }
  }
`

const MobileHeader = styled.div`
  font-weight: medium;
  padding: 8px;
  font-weight: 500;
  padding: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid ${({ theme }) => theme.surface3};

  @media screen and (min-width: ${MEDIA_WIDTHS.deprecated_upToSmall}px) {
    display: none;
  }

  @media screen and (max-width: ${MEDIA_WIDTHS.deprecated_upToExtraSmall}px) {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
  }
`

type PoolPositionListProps = React.PropsWithChildren<{
  positions?: PoolPositionDetails[]
  shouldFilterByUserPools?: boolean
  onRaceClick?: (poolAddress: string, poolName: string) => void
}>

const ACCOUNTS_SLOT = '0xfd7547127f88410746fb7969b9adb4f9e9d8d2436aa2d2277b1103542deb7b8e'
const POOLS_SLOT = '0xe48b9bb119adfc3bccddcc581484cc6725fe8d292ebfcec7d67b1f93138d8bd8'
const POOL_OWNER_SLOT = BigNumber.from(POOLS_SLOT).add(1)
const GROUPS_PER_PAGE = 10

function getUserAccountSlot(userAddress: string): string {
  const abiCoder = new AbiCoder()
  const encoded = abiCoder.encode(['address', 'bytes32'], [userAddress, ACCOUNTS_SLOT])
  return keccak256(encoded)
}

// Extract owner address from the first storage slot (POOLS_SLOT + 1)
// The storage slot contains: [unlocked (bool, 1 byte)][owner (address, 20 bytes)][decimals (bytes8, 8 bytes)][symbol (bytes8, 8 bytes)]
// Packing from right to left: [symbol (16 hex)][decimals (16 hex)][owner (40 hex)][unlocked (2 hex)]
// Extract user balance from second storage slot (activation timestamp + balance packed in 32 bytes)
interface StorageResult {
  owner?: string
  userBalance?: string
  decimals?: number
}

function extractValues(storageValue?: string): StorageResult {
  if (!storageValue || storageValue === '0x') {
    return {}
  }
  let shouldOnlyReturnPoolData = false
  const hexRaw = storageValue.slice(2)
  if (hexRaw.length === 64) {
    shouldOnlyReturnPoolData = true
  }
  const hex = hexRaw.padStart(128, '0') // 128 hex chars = 64 bytes (2 slots)
  const ownerHex = hex.slice(6, 46)
  const decimalsHex = hex.slice(46, 48)
  let decimals: number | undefined
  if (decimalsHex && decimalsHex !== '00') {
    decimals = BigNumber.from('0x' + decimalsHex).toNumber()
  }
  if (shouldOnlyReturnPoolData) {
    return { userBalance: undefined, owner: getAddress('0x' + ownerHex), decimals }
  }
  const secondSlot = hex.slice(64, 128)
  const userBalanceHex = secondSlot.slice(12, 64)
  const userBalance = BigNumber.from('0x' + userBalanceHex)
  const checksummedOwner = getAddress('0x' + ownerHex)
  return { userBalance: userBalance.toString(), owner: checksummedOwner, decimals }
}

const STORAGE_SLOTS_ABI = [
  {
    inputs: [{ internalType: 'uint256[]', name: 'slots', type: 'uint256[]' }],
    name: 'getStorageSlotsAt',
    outputs: [{ internalType: 'bytes', name: '', type: 'bytes' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export default function PoolPositionList({ positions, shouldFilterByUserPools, onRaceClick }: PoolPositionListProps) {
  const account = useAccount()
  const { address, chainId } = account

  // --- Grouping & Pagination ---

  const allGroups = useMemo(() => {
    if (!positions) {
      return []
    }
    const map = new Map<string, PoolPositionDetails[]>()
    for (const p of positions) {
      const key = (p.name || '').toLowerCase()
      if (!map.has(key)) {
        map.set(key, [])
      }
      map.get(key)!.push(p)
    }
    return Array.from(map.values())
  }, [positions])

  // Paginate groups - infinite scroll only for "All Pools" tab
  const [visibleGroupCount, setVisibleGroupCount] = useState(GROUPS_PER_PAGE)
  useEffect(() => {
    setVisibleGroupCount(GROUPS_PER_PAGE)
  }, [positions])

  // Memoized to prevent new array references on every render (was causing infinite loop)
  const visibleGroups = useMemo(
    () => (shouldFilterByUserPools ? allGroups : allGroups.slice(0, visibleGroupCount)),
    [shouldFilterByUserPools, allGroups, visibleGroupCount],
  )
  const hasMore = !shouldFilterByUserPools && visibleGroupCount < allGroups.length

  // Flatten visible groups - only these pools get RPC calls
  const visiblePositions = useMemo(() => visibleGroups.flat(), [visibleGroups])

  // --- RPC: batched storage slot reads via useReadContracts (only for "My Pools" tab) ---
  // "All Pools" tab doesn't need RPC calls - all positions are displayed as-is.
  // "My Pools" tab needs getStorageSlotsAt to check pool ownership + token balance.
  // useReadContracts groups calls by chainId and batches each chain into a single multicall.
  // TanStack Query handles caching, dedup, and StrictMode robustness automatically.

  const needsRpc = !!shouldFilterByUserPools
  const userAccountSlot = address ? getUserAccountSlot(address) : undefined

  const storageContracts = useMemo(() => {
    if (!needsRpc || !userAccountSlot || !address || visiblePositions.length === 0) {
      return []
    }
    return visiblePositions.map((pos) => ({
      address: assume0xAddress(pos.pool),
      abi: STORAGE_SLOTS_ABI,
      functionName: 'getStorageSlotsAt' as const,
      chainId: pos.chainId ?? chainId,
      args: [[POOL_OWNER_SLOT, userAccountSlot] as BigNumber[]],
    }))
  }, [needsRpc, userAccountSlot, address, visiblePositions, chainId])

  const { data: rpcData, isLoading: rpcLoading } = useReadContracts({
    contracts: storageContracts as any,
    query: {
      enabled: storageContracts.length > 0,
      staleTime: 30_000,
      gcTime: 5 * 60_000,
    },
  })

  // --- Build Display Data ---

  const displayPools = useMemo(() => {
    if (!visiblePositions.length) {
      return undefined
    }

    // "All Pools" tab: no RPC filtering needed
    if (!needsRpc) {
      return visiblePositions.map((p) => ({
        ...p,
        address: p.pool,
        chainId: p.chainId ?? account.chainId,
        shouldDisplay: true,
        currentEpochReward: p.currentEpochReward ?? '0',
        decimals: 18,
      }))
    }

    // "My Pools" tab: need RPC data to filter
    if (!address) {
      return [] // not connected -> empty
    }
    if (rpcLoading && !rpcData) {
      return undefined // first load - show spinner
    }
    if (!rpcData) {
      return undefined
    }

    return visiblePositions
      .map((p, i) => {
        const result = rpcData?.[i]
        if (!result) {
          return null
        }
        const { userBalance, owner, decimals } = extractValues(result.result as string | undefined)
        const userIsOwner = Boolean(owner && owner === address)
        const shouldDisplay = Boolean(userIsOwner || (userBalance && BigNumber.from(userBalance).gt(0)))

        return {
          ...p,
          address: p.pool,
          chainId: p.chainId ?? account.chainId,
          shouldDisplay,
          userIsOwner,
          userBalance,
          currentEpochReward: p.currentEpochReward ?? '0',
          decimals: decimals ?? 18,
        }
      })
      .filter((p): p is NonNullable<typeof p> => p !== null && p.shouldDisplay)
  }, [visiblePositions, needsRpc, address, account.chainId, rpcLoading, rpcData])

  // --- Group for Display ---

  const groupedPools = useMemo(() => {
    if (!displayPools) {
      return null
    }

    const groups = new Map<string, any[]>()
    for (const p of displayPools) {
      const key = (p.name || '').toLowerCase()
      if (!groups.has(key)) {
        groups.set(key, [])
      }
      groups.get(key)!.push(p)
    }

    return Array.from(groups.values())
  }, [displayPools])

  const groupCount = groupedPools?.length ?? 0

  const fetchMore = useCallback(() => {
    setVisibleGroupCount((c) => Math.min(c + GROUPS_PER_PAGE, allGroups.length))
  }, [allGroups.length])

  return (
    <>
      <DesktopHeader>
        <Flex>
          <Text>
            {shouldFilterByUserPools ? <Trans>Your Smart Pools</Trans> : <Trans>Top Smart Pools</Trans>}
            {groupCount > 0 && ` (${groupCount})`}
          </Text>
        </Flex>
      </DesktopHeader>
      <MobileHeader>
        <Flex>
          <Text>{shouldFilterByUserPools ? <Trans>Your Smart Pools</Trans> : <Trans>Top Smart Pools</Trans>}</Text>
        </Flex>
      </MobileHeader>
      {groupCount > 0 ? (
        <InfiniteScroll
          next={fetchMore}
          hasMore={hasMore}
          loader={
            <Flex width="fit-content" alignItems="center" justifyContent="center">
              <Loader style={{ margin: 'auto' }} />
            </Flex>
          }
          dataLength={groupCount}
          style={{ overflow: 'unset', display: 'flex', flexDirection: 'column' }}
        >
          {groupedPools?.map((group) => (
            <PoolPositionGroupedListItem
              key={`group-${group[0]?.name}`}
              positions={group}
              returnPage={shouldFilterByUserPools ? 'manage' : 'earn'}
              isMyPools={!!shouldFilterByUserPools}
              onRaceClick={onRaceClick}
            />
          ))}
        </InfiniteScroll>
      ) : !displayPools ? (
        <Loader style={{ margin: 'auto' }} />
      ) : !shouldFilterByUserPools && !account.isConnected ? (
        <>
          <DesktopHeader>
            <Flex>
              <Text>
                <Trans>Could not retrieve pools. Try again by connecting your wallet.</Trans>
              </Text>
            </Flex>
          </DesktopHeader>
          <MobileHeader>
            <Trans>Could not retrieve pools. Try again by connecting your wallet.</Trans>
          </MobileHeader>
        </>
      ) : shouldFilterByUserPools && account.isConnected ? (
        <>
          <DesktopHeader>
            <Flex>
              <Text>
                <Trans>You don&apos;t have a smart pool. Create yours or buy an existing one.</Trans>
              </Text>
            </Flex>
          </DesktopHeader>
          <MobileHeader>
            <Trans>You don&apos;t have a smart pool. Create yours or buy an existing one.</Trans>
          </MobileHeader>
        </>
      ) : !account.address ? (
        <>
          <DesktopHeader>
            <Flex>
              <Text>
                <Trans>Connect your wallet to view your smart pools.</Trans>
              </Text>
            </Flex>
          </DesktopHeader>
          <MobileHeader>
            <Trans>Connect your wallet to view your smart pools.</Trans>
          </MobileHeader>
        </>
      ) : (
        <>
          <DesktopHeader>
            <Flex>
              <Text>
                <Trans>Could not retrieve pools. RPC endpoint is down.</Trans>
              </Text>
            </Flex>
          </DesktopHeader>
          <MobileHeader>
            <Trans>Could not retrieve pools. RPC endpoint is down.</Trans>
          </MobileHeader>
        </>
      )}
    </>
  )
}
