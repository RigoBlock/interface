import { ChainLogo } from '~/components/Logo/ChainLogo'
import styled from '~/lib/deprecated-styled'
import { useState } from 'react'
import { Link } from 'react-router'
import { MEDIA_WIDTHS } from '~/theme'
import { PoolPositionDetails } from '~/types/position'
import { Flex, Text } from 'ui/src'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { getChainLabel } from 'uniswap/src/features/chains/utils'

const GroupRow = styled.div<{ $expanded: boolean }>`
  align-items: center;
  display: flex;
  cursor: pointer;
  user-select: none;
  flex-direction: column;
  justify-content: space-between;
  color: ${({ theme }) => theme.neutral1};
  padding: 16px;
  font-weight: 500;

  :hover {
    background-color: ${({ theme }) => theme.deprecated_hoverDefault};
  }

  ${({ $expanded, theme }) =>
    $expanded &&
    `
    background-color: ${theme.surface2};
    border-bottom: 1px solid ${theme.surface3};
  `}
`

const ExpandIcon = styled.span<{ $expanded: boolean }>`
  transition: transform 0.2s;
  transform: ${({ $expanded }) => ($expanded ? 'rotate(90deg)' : 'rotate(0deg)')};
  font-size: 12px;
  margin-right: 8px;
  flex-shrink: 0;
`

const SubRowContainer = styled.div`
  border-left: 3px solid ${({ theme }) => theme.surface3};
  margin-left: 16px;
`

const SubRowLink = styled(Link)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  text-decoration: none;
  color: ${({ theme }) => theme.neutral1};

  :hover {
    background-color: ${({ theme }) => theme.deprecated_hoverDefault};
  }
`

const PortfolioLink = styled(Link)`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.accent1};
  text-decoration: none;
  margin-right: 8px;
  flex-shrink: 0;

  :hover {
    text-decoration: underline;
  }
`

const DataText = styled.div`
  font-weight: 600;
  font-size: 18px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;

  @media screen and (max-width: ${MEDIA_WIDTHS.deprecated_upToSmall}px) {
    font-size: 16px;
    max-width: 140px;
  }
`

const Badge = styled.span<{ $color: string }>`
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  background-color: ${({ $color }) => $color}20;
  color: ${({ $color }) => $color};
  white-space: nowrap;
`

/** Chain logos + count — hidden on small screens in collapsed row, shown in sub-rows */
const ChainInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;

  @media screen and (max-width: ${MEDIA_WIDTHS.deprecated_upToSmall}px) {
    display: none;
  }
`

/** Chain count text shown only on mobile, below the pool name */
const MobileChainCount = styled.div`
  display: none;
  font-size: 12px;
  color: ${({ theme }) => theme.neutral2};

  @media screen and (max-width: ${MEDIA_WIDTHS.deprecated_upToSmall}px) {
    display: flex;
    align-items: center;
    gap: 4px;
  }
`

interface PoolPositionGroupedListItemProps {
  positions: PoolPositionDetails[]
  returnPage: string
  isMyPools?: boolean
  onRaceClick?: (poolAddress: string, poolName: string) => void
}

export default function PoolPositionGroupedListItem({
  positions,
  returnPage,
  isMyPools,
  onRaceClick,
}: PoolPositionGroupedListItemProps) {
  const [expanded, setExpanded] = useState(false)

  if (positions.length === 0) {
    return null
  }

  const poolName = positions[0].name
  const poolAddress = positions[0].pool
  const chainIds = positions.map((p) => p.chainId as UniverseChainId).filter(Boolean)
  const chainCount = chainIds.length

  // Aggregate badges for collapsed row
  const anyStaked = positions.some((p) => p.userHasStake)
  const anyOwned = positions.some((p) => p.userIsOwner)
  const anyHeld = positions.some((p) => {
    if (!p.userBalance) return false
    try { return BigInt(p.userBalance) > 0n } catch { return false }
  })

  return (
    <>
      <GroupRow $expanded={expanded} onClick={() => setExpanded(!expanded)}>
        <Flex row width="100%" justifyContent="space-between" alignItems="center">
          <Flex row alignItems="center" gap="$spacing8" style={{ minWidth: 0, flex: 1 }}>
            <ExpandIcon $expanded={expanded}>▶</ExpandIcon>
            <Flex style={{ minWidth: 0 }}>
              <Flex row alignItems="center" gap="$spacing8">
                <DataText>{poolName}</DataText>
                <ChainInfo>
                  {chainIds.map((chainId) => (
                    <ChainLogo key={chainId} chainId={chainId} size={16} />
                  ))}
                  <Text color="$neutral2" fontSize={14}>
                    {chainCount} {chainCount === 1 ? 'chain' : 'chains'}
                  </Text>
                </ChainInfo>
                {!isMyPools && anyStaked && <Badge $color="#40B66B">Staked</Badge>}
                {isMyPools && anyOwned && <Badge $color="#4C82FB">Operated</Badge>}
                {isMyPools && anyHeld && <Badge $color="#9B59B6">Held</Badge>}
              </Flex>
              <MobileChainCount>
                {chainIds.map((chainId) => (
                  <ChainLogo key={chainId} chainId={chainId} size={14} />
                ))}
                {chainCount} {chainCount === 1 ? 'chain' : 'chains'}
              </MobileChainCount>
            </Flex>
          </Flex>
          <PortfolioLink
            to={`/portfolio?address=${poolAddress}`}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            Portfolio
          </PortfolioLink>
        </Flex>
      </GroupRow>
      {expanded && (
        <SubRowContainer>
          {positions.map((p) => {
            const chainId = p.chainId as UniverseChainId
            const chainName = getChainLabel(chainId)

            // Show IRR for My Pools (operator view), APR for All Pools (delegator view)
            const rateValue = isMyPools ? p.irr : p.apr
            const rateLabel = isMyPools ? 'IRR' : 'APR'
            const rateString = rateValue && Number(rateValue) > 0 ? `${(Number(rateValue) * 100).toFixed(1)}%` : '\u2014'

            const poolStake = p.poolDelegatedStake ? (Number(p.poolDelegatedStake) / 1e18).toFixed(0) : undefined
            const poolOwnStakeStr = p.poolOwnStake ? (Number(p.poolOwnStake) / 1e18).toFixed(0) : undefined
            const aprToStr = p.apr ? (Number(p.apr) * 100).toFixed(2) : undefined
            const irrToStr = p.irr ? (Number(p.irr) * 100).toFixed(2) : undefined

            const link =
              poolStake && aprToStr && poolOwnStakeStr && irrToStr
                ? `/smart-pool/${chainId}/${p.address ?? p.pool}/${returnPage}/${poolStake}/${aprToStr}/${poolOwnStakeStr}/${irrToStr}`
                : `/smart-pool/${chainId}/${p.address ?? p.pool}/${returnPage}`

            // Per-chain badges
            const isStaked = !isMyPools && p.userHasStake
            const isOwned = isMyPools && p.userIsOwner
            const isHeld = isMyPools && (() => {
              if (!p.userBalance) return false
              try { return BigInt(p.userBalance) > 0n } catch { return false }
            })()

            return (
              <SubRowLink key={`${p.chainId}-${p.pool}`} to={link}>
                <Flex row alignItems="center" gap="$spacing8">
                  <ChainLogo chainId={chainId} size={16} />
                  <Text fontSize={14}>{chainName}</Text>
                  {isStaked && <Badge $color="#40B66B">Staked</Badge>}
                  {isOwned && <Badge $color="#4C82FB">Operated</Badge>}
                  {isHeld && <Badge $color="#9B59B6">Held</Badge>}
                </Flex>
                <Text
                  fontSize={14}
                  mr={8}
                  cursor={onRaceClick ? 'pointer' : undefined}
                  backgroundColor={onRaceClick ? '$accent2' : undefined}
                  color={onRaceClick ? '$accent1' : undefined}
                  px={onRaceClick ? '$spacing8' : undefined}
                  py={onRaceClick ? '$spacing4' : undefined}
                  borderRadius={onRaceClick ? '$rounded8' : undefined}
                  fontWeight={onRaceClick ? '600' : undefined}
                  hoverStyle={onRaceClick ? { opacity: 0.8, backgroundColor: '$accent1', color: '$white' } : undefined}
                  onPress={
                    onRaceClick
                      ? (e: any) => {
                          e.preventDefault()
                          e.stopPropagation()
                          onRaceClick(p.address ?? p.pool, poolName)
                        }
                      : undefined
                  }
                >
                  {rateString} {rateLabel}
                </Text>
              </SubRowLink>
            )
          })}
        </SubRowContainer>
      )}
    </>
  )
}
