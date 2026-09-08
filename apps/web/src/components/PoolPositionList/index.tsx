import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Trans } from 'react-i18next'
import InfiniteScroll from 'react-infinite-scroll-component'
import { Flex, Text } from 'ui/src'
import Loader from '~/components/Icons/LoadingSpinner'
import PoolPositionGroupedListItem from '~/components/PoolPositionGroupedListItem'
import { useAccount } from '~/hooks/useAccount'
import styled from '~/lib/deprecated-styled'
import { MEDIA_WIDTHS } from '~/theme'
import { PoolPositionDetails } from '~/types/position'

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
  /** Full, unfiltered pool list used to show every chain where a pool is deployed in the row counter. */
  allPositions?: PoolPositionDetails[]
  shouldFilterByUserPools?: boolean
  /** Optional action rendered at the right of the list header (e.g. the Create button) */
  headerAction?: React.ReactNode
}>

const GROUPS_PER_PAGE = 10

export default function PoolPositionList({
  positions,
  allPositions,
  shouldFilterByUserPools,
  headerAction,
}: PoolPositionListProps) {
  const account = useAccount()

  // --- Grouping & Pagination ---

  const allGroups = useMemo(() => {
    if (!positions) {
      return []
    }
    const map = new Map<string, PoolPositionDetails[]>()
    for (const p of positions) {
      // Group by pool address so the same vault across chains stays in one row.
      // Different vaults with the same name are shown as separate rows.
      const key = (p.pool || '').toLowerCase()
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
  const isLoading = positions === undefined

  const displayPools = useMemo(() => {
    if (!visiblePositions.length) {
      return []
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
    if (displayPools.length === 0) {
      return null
    }

    const groups = new Map<string, any[]>()
    for (const p of displayPools) {
      // Group by pool address to match the pagination grouping above.
      const key = (p.pool || '').toLowerCase()
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
            {shouldFilterByUserPools ? <Trans>My Smart Pools</Trans> : <Trans>Top Smart Pools</Trans>}
            {groupCount > 0 && ` (${groupCount})`}
          </Text>
        </Flex>
        {headerAction}
      </DesktopHeader>
      <MobileHeader>
        <Flex>
          <Text>{shouldFilterByUserPools ? <Trans>My Smart Pools</Trans> : <Trans>Top Smart Pools</Trans>}</Text>
        </Flex>
        {headerAction}
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
          style={{
            overflow: 'unset',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {groupedPools?.map((group) => (
            <PoolPositionGroupedListItem
              key={`group-${group[0]?.pool ?? group[0]?.name}`}
              positions={group}
              allPositions={allPositions}
              returnPage={shouldFilterByUserPools ? 'manage' : 'earn'}
              isMyPools={!!shouldFilterByUserPools}
            />
          ))}
        </InfiniteScroll>
      ) : isLoading ? (
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
