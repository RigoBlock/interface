import { Interface } from '@ethersproject/abi'
import { RowFixed } from 'components/deprecated/Row'
import Loader from 'components/Icons/LoadingSpinner'
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
  positions?: PoolPositionDetails[]
  shouldFilterByUserPools?: boolean
}>

export default function PoolPositionList({ positions, shouldFilterByUserPools }: PoolPositionListProps) {
  const account = useAccount()
  // TODO: we should merge this part with same part in swap page and move to a custom hook
  const poolAddresses = useMemo(() => positions?.map((p) => p.pool), [positions])
  const poolIds = useMemo(() => positions?.map((p) => p.id), [positions])
  const PoolInterface = new Interface(POOL_EXTENDED_ABI)

  const poolsRewards = useStakingPoolsRewards(poolIds)

  // notice: this call will not return pools if account is not connected and the endpoint is not responsive, which
  //   is fine as we don't want to display empty pools when endpoint is not responsive.
  const results = useMultipleContractSingleData(poolAddresses ?? [], PoolInterface, 'getPool')
  const userBalances = useMultipleContractSingleData(
    poolAddresses ?? [],
    PoolInterface,
    'balanceOf',
    useMemo(() => [account.address], [account.address])
  )

  // TODO: check if should define isLoading inside useMemo to avoid unnecessary re-renders (we can use loading from results and userBalances)
  const poolsWithStats = useMemo(() => {
    if (!positions) { return undefined }
    const isResultsLoading = results?.some((r) => r.loading)
    const isBalancesLoading = userBalances?.some((r) => r.loading)
    
    if (isResultsLoading || isBalancesLoading) { return undefined }
    
    return positions
      .map((p, i) => {
        const { result: pool, loading } = results[i] || {}
        const userBalance = Number(userBalances?.[i]?.result)
        const userIsOwner = pool && account.address ? pool[0]?.owner === account.address : false
        const shouldDisplay: boolean = shouldFilterByUserPools
          ? Boolean(userIsOwner || (userBalance && userBalance > 0))
          :  true

        return {
          ...p,
          loading,
          address: poolAddresses?.[i],
          chainId: account.chainId,
          shouldDisplay,
          userIsOwner,
          userBalance,
          id: poolIds?.[i],
          currentEpochReward: poolsRewards[i] ?? '0',
          decimals: pool?.[0]?.decimals ?? 18,
          symbol: p?.symbol,
          name: p?.name,
          apr: p?.apr,
          irr: p?.irr,
          poolOwnStake: p?.poolOwnStake,
          poolDelegatedStake: p?.poolDelegatedStake,
          userHasStake: p?.userHasStake
        }
      })
      .filter((p) => p && p.shouldDisplay) || []
  }, [account.address, account.chainId, poolAddresses, positions, results, poolIds, poolsRewards, shouldFilterByUserPools, userBalances])

  return (
    <>
      <DesktopHeader>
        <Flex>
          <Text>
            {shouldFilterByUserPools ? <Trans>Your vaults</Trans> : <Trans>Top Vaults</Trans>}
            {poolsWithStats && ` (${poolsWithStats?.length})`}
          </Text>
        </Flex>
        {shouldFilterByUserPools && (
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
        {!shouldFilterByUserPools && (
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
            {shouldFilterByUserPools ? <Trans>Your vaults</Trans> : <Trans>Vaults</Trans>}
          </Text>
        </Flex>
        {!shouldFilterByUserPools ? (
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
      {(poolsWithStats?.length ?? 0) > 0 ? (
        poolsWithStats?.map((p: any) => {
          return (
            <PoolPositionListItem
              key={p?.address.toString()}
              positionDetails={p}
              returnPage={shouldFilterByUserPools ? 'mint' : 'stake'}
            />
          )
        })
      ) : !poolsWithStats ? (
        <Loader style={{ margin: 'auto' }} />
      ) : !shouldFilterByUserPools && !account.isConnected ? (
        <>
          <DesktopHeader>
            <Flex>
              <Text>
                <Trans>Could not retrieve vaults. Try again by connecting your wallet.</Trans>
              </Text>
            </Flex>
          </DesktopHeader>
          <MobileHeader>
            <Trans>Could not retrieve vaults. Try again by connecting your wallet.</Trans>
          </MobileHeader>
        </>
      ) : shouldFilterByUserPools && account.isConnected ? (
        <>
          <DesktopHeader>
            <Flex>
              <Text>
                <Trans>You don&apos;t have a smart vault. Create yours or buy an existing one.</Trans>
              </Text>
            </Flex>
          </DesktopHeader>
          <MobileHeader>
            <Trans>You don&apos;t have a smart vault. Create yours or buy an existing one.</Trans>
          </MobileHeader>
        </>
      ) : (
        <>
          <DesktopHeader>
            <Flex>
              <Text>
                <Trans>Could not retrieve vaults. RPC endpoint is down.</Trans>
              </Text>
            </Flex>
          </DesktopHeader>
          <MobileHeader>
            <Trans>Could not retrieve vaults. RPC endpoint is down.</Trans>
          </MobileHeader>
        </>
      )}
    </>
  )
}
