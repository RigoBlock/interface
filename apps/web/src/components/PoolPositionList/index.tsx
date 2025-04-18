import { Interface } from '@ethersproject/abi'
import { RowFixed } from 'components/deprecated/Row'
import PoolPositionListItem from 'components/PoolPositionListItem'
import { MouseoverTooltip } from 'components/Tooltip'
import { useAccount } from 'hooks/useAccount'
import { Trans } from 'react-i18next'
import { useMultipleContractSingleData } from 'lib/hooks/multicall'
import React, { useMemo } from 'react'
import { Info } from 'react-feather'
import { useStakingPoolsRewards } from 'state/pool/hooks'
import styled from 'lib/styled-components'
import { MEDIA_WIDTHS } from 'theme'
import { PoolPositionDetails } from 'types/position'
import { Flex, Text } from 'ui/src'
import POOL_EXTENDED_ABI from 'uniswap/src/abis/pool-extended.json'

// TODO: check if we want to keep margin right 12px by keeping list item margin right at 12px
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

const InfoIconContainer = styled.div`
  margin-left: 2px;
  display: flex;
  align-items: center;
  cursor: help;
`

type PoolPositionListProps = React.PropsWithChildren<{
  positions: PoolPositionDetails[]
  filterByOperator?: any
  filterByHolder?: string
}>

export default function PoolPositionList({ positions, filterByOperator }: PoolPositionListProps) {
  const account = useAccount()
  // TODO: we should merge this part with same part in swap page and move to a custom hook
  const poolAddresses: string[] = useMemo(() => positions.map((p) => p.pool), [positions])
  const poolIds: string[] = useMemo(() => positions.map((p) => p.id), [positions])
  const PoolInterface = new Interface(POOL_EXTENDED_ABI)

  const poolsRewards: string[] = useStakingPoolsRewards(poolIds)

  // notice: if RPC endpoint is not available the following calls will result in empty poolsWithStats. However,
  //  we do not want to return pools with partial data, so will prompt user to connect or return error.
  const userBalances = useMultipleContractSingleData(
    poolAddresses,
    PoolInterface,
    'balanceOf',
    useMemo(() => [account.address], [account.address])
  )
  // notice: this call will not return pools if account is not connected and the endpoint is not responsive, which
  //   is fine as we don't want to display empty pools when endpoint is not responsive.
  const results = useMultipleContractSingleData(poolAddresses, PoolInterface, 'getPool')
  // TODO: if we initiate this in state, we can later query from state instead of making rpc call
  //  in 1) swap and 2) each pool url, we could also store poolId at that point
  const poolsWithStats = useMemo(() => {
    return results
      ?.map((result, i) => {
        const { result: pool, loading } = result
        // if pool is not correctly returned by endpoint it means endpoint is down, and we don't want to display pools
        if (!account.chainId || loading || !pool) {
          return undefined
        }

        const { decimals, owner } = pool[0]
        if (!decimals || !owner) {
          return undefined
        }
        const shouldDisplay = filterByOperator
          ? Boolean(owner === account.address || Number(userBalances?.[i]?.result) > 0)
          : true
        return {
          ...result,
          apr: positions?.[i]?.apr,
          irr: positions?.[i]?.irr,
          poolOwnStake: positions?.[i]?.poolOwnStake,
          poolDelegatedStake: positions?.[i]?.poolDelegatedStake,
          userHasStake: positions?.[i]?.userHasStake ?? false,
          address: poolAddresses[i],
          decimals,
          symbol: positions?.[i]?.symbol,
          name: positions?.[i]?.name,
          chainId: account.chainId,
          shouldDisplay,
          userIsOwner: account.address ? owner === account.address : false,
          userBalance: userBalances?.[i]?.result,
          id: poolIds[i],
          currentEpochReward: poolsRewards[i],
        }
      })
      .filter((p) => p && p.shouldDisplay)
  }, [account.address, account.chainId, filterByOperator, poolAddresses, positions, results, userBalances, poolIds, poolsRewards])

  return (
    <>
      <DesktopHeader>
        <Flex>
          <Text>
            {filterByOperator ? <Trans>Your pools</Trans> : <Trans>Loaded pools</Trans>}
            {positions && ` (${poolsWithStats.length})`}
          </Text>
        </Flex>
        {filterByOperator && (
          <RowFixed gap="32px">
            <RowFixed gap="2px">
              <Trans>Points</Trans>
              <MouseoverTooltip
                text={
                  <Trans>
                    The bigger the pool&apos;s own stake, the higher the points. Together with the other stakers&apos;
                    stake, they compete for a share of the current epoch&apos;s rewards.
                  </Trans>
                }
                placement="right"
              >
                <InfoIconContainer>
                  <Info size={14} />
                </InfoIconContainer>
              </MouseoverTooltip>
            </RowFixed>
          </RowFixed>
        )}
        {!filterByOperator && (
          <RowFixed gap="32px">
            <RowFixed gap="2px">
              <Trans>IRR</Trans>
              <MouseoverTooltip
                text={
                  <Trans>
                    The pool operator&apos;s annualized yield. Increases as more stakers join the pool. Decreases as the
                    pool operator shares more of his revenue.
                  </Trans>
                }
                placement="right"
              >
                <InfoIconContainer>
                  <Info size={14} />
                </InfoIconContainer>
              </MouseoverTooltip>
            </RowFixed>
            <RowFixed gap="2px">
              <Trans>APR</Trans>
              <MouseoverTooltip
                text={
                  <Trans>
                    The stakers&apos; annualized yield. Increases as the pool increases its own stake or as the pool
                    operator increases the percent of rewards shared.
                  </Trans>
                }
                placement="right"
              >
                <InfoIconContainer>
                  <Info size={14} />
                </InfoIconContainer>
              </MouseoverTooltip>
            </RowFixed>
          </RowFixed>
        )}
      </DesktopHeader>
      <MobileHeader>
        <Flex>
          <Text>
            {filterByOperator ? <Trans>Your pools</Trans> : <Trans>Loaded pools</Trans>}
          </Text>
        </Flex>
        {!filterByOperator ? (
          <RowFixed style={{ gap: '40px', marginRight: '8px' }}>
            <Flex>
              <Text>
                <Trans>IRR</Trans>
              </Text>
            </Flex>
            <Flex>
              <Text>
                <Trans>APR</Trans>
              </Text>
            </Flex>
          </RowFixed>
        ) : (
          <RowFixed style={{ gap: '40px', marginRight: '8px' }}>
            <Flex>
              <Text>
                <Trans>Points</Trans>
              </Text>
            </Flex>
          </RowFixed>
        )}
      </MobileHeader>
      {poolsWithStats.length > 0 ? (
        poolsWithStats.map((p: any) => {
          return (
            <PoolPositionListItem
              key={p?.address.toString()}
              positionDetails={p}
              returnPage={filterByOperator ? 'mint' : 'stake'}
            />
          )
        })
      ) : !filterByOperator && !account.isConnected ? (
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
      ) : filterByOperator && account.isConnected ? (
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
