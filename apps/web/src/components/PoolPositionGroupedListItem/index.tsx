import { useMemo } from 'react'
import { Trans } from 'react-i18next'
import { useNavigate } from 'react-router'
import { Flex, Text } from 'ui/src'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { ChainLogo } from '~/components/Logo/ChainLogo'
import { useAccount } from '~/hooks/useAccount'
import styled from '~/lib/deprecated-styled'
import { MEDIA_WIDTHS } from '~/theme'
import { PoolPositionDetails } from '~/types/position'

const RowWrapper = styled(Flex)`
  width: 100%;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  gap: 12px;
  border-radius: 12px;
  cursor: pointer;
  background-color: ${({ theme }) => theme.surface1};
  transition: background-color 0.15s ease;

  :hover {
    background-color: ${({ theme }) => theme.surface2};
  }
`

const PortfolioButton = styled.button`
  font-size: 14px;
  font-weight: 600;
  padding: 8px 18px;
  border-radius: 10px;
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  background-color: ${({ theme }) => theme.accent2};
  color: ${({ theme }) => theme.accent1};
  transition:
    background-color 0.15s ease,
    color 0.15s ease;

  :hover {
    background-color: ${({ theme }) => theme.accent1};
    color: ${({ theme }) => theme.white};
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

/** Chain logos + count — hidden on small screens in collapsed row */
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
}

export default function PoolPositionGroupedListItem({
  positions,
  returnPage,
  isMyPools,
}: PoolPositionGroupedListItemProps) {
  const navigate = useNavigate()
  const account = useAccount()

  const poolName = positions[0]?.name
  const poolAddress = positions[0]?.pool
  const chainIds = positions.map((p) => p.chainId as UniverseChainId).filter(Boolean)
  const chainCount = chainIds.length

  // Aggregate badges
  const anyStaked = positions.some((p) => p.userHasStake)
  const anyOwned = positions.some((p) => p.userIsOwner)
  const anyHeld = positions.some((p) => {
    if (!p.userBalance) {
      return false
    }
    try {
      return BigInt(p.userBalance) > 0n
    } catch {
      return false
    }
  })

  // Default chain to open: where the user operates/stakes, else the wallet chain, else highest own stake
  const defaultPosition = useMemo(() => {
    const ownedOrStaked = positions.find((p) => p.userIsOwner || p.userHasStake)
    if (ownedOrStaked) {
      return ownedOrStaked
    }
    const onWalletChain = account.chainId ? positions.find((p) => p.chainId === account.chainId) : undefined
    if (onWalletChain) {
      return onWalletChain
    }
    return [...positions].sort((a, b) => Number(b.poolOwnStake ?? 0) - Number(a.poolOwnStake ?? 0))[0]
  }, [positions, account.chainId])

  // Rate: operators see their IRR, everyone else sees the best delegator APR across chains
  const { rateString, rateLabel } = useMemo(() => {
    const operated = positions.filter((p) => p.userIsOwner)
    const isOperator = operated.length > 0
    const rateValue = isOperator
      ? Math.max(0, ...operated.map((p) => Number(p.irr ?? 0)))
      : Math.max(0, ...positions.map((p) => Number(p.apr ?? 0)))
    return {
      rateString: rateValue > 0 ? `${(rateValue * 100).toFixed(1)}%` : '—',
      rateLabel: isOperator ? 'IRR' : 'APR',
    }
  }, [positions])

  if (positions.length === 0) {
    return null
  }

  const link = `/smart-pool/${
    defaultPosition.chainId ?? account.chainId ?? 1
  }/${defaultPosition.address ?? defaultPosition.pool}/${returnPage}`

  return (
    <RowWrapper
      row
      onPress={() => navigate(link)}
    >
      <Flex row alignItems="center" gap="$spacing8" style={{ minWidth: 0, flex: 1 }}>
        <Flex style={{ minWidth: 0 }}>
          <Flex row alignItems="center" gap="$spacing8" flexWrap="wrap">
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
      <Flex row alignItems="center" gap="$spacing8" flexShrink={0}>
        <Text fontSize={14} fontWeight="600" color="$neutral1" whiteSpace="nowrap">
          {rateString} {rateLabel}
        </Text>
        <PortfolioButton
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            navigate(`/portfolio/${poolAddress}`)
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Trans i18nKey="earn.portfolio" />
        </PortfolioButton>
      </Flex>
    </RowWrapper>
  )
}
