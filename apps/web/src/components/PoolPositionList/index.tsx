import Loader from '~/components/Icons/LoadingSpinner'
import PoolPositionGroupedListItem from '~/components/PoolPositionGroupedListItem'
import { useAccount } from '~/hooks/useAccount'
import styled from '~/lib/deprecated-styled'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import InfiniteScroll from 'react-infinite-scroll-component'
import { Trans } from 'react-i18next'
import { MEDIA_WIDTHS } from '~/theme'
import { PoolPositionDetails } from '~/types/position'
import { Flex, Text } from 'ui/src'

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

const GROUPS_PER_PAGE = 10

export default function PoolPositionList({ positions, shouldFilterByUserPools, onRaceClick }: PoolPositionListProps) {
  const account = useAccount()

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

  // Flatten visible groups
  const visiblePositions = useMemo(() => visibleGroups.flat(), [visibleGroups])

  // --- Build Display Data (pure passthrough — no RPC calls) ---
  // All filtering (ownership, staking) is done by the parent (Earn page).
  // PoolPositionList is a pure display component.

  const displayPools = useMemo(() => {
    if (!visiblePositions.length) {
      return undefined
    }

    return visiblePositions.map((p) => ({
      ...p,
      address: p.pool,
      chainId: p.chainId ?? account.chainId,
      shouldDisplay: true,
      currentEpochReward: p.currentEpochReward ?? '0',
      decimals: 18,
    }))
  }, [visiblePositions, account.chainId])

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
