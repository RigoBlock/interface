import { Trans } from '@lingui/macro'
import { CurrencyAmount, Token } from '@uniswap/sdk-core'
import { useWeb3React } from '@web3-react/core'
import { GRG } from 'constants/tokens'
import JSBI from 'jsbi'
import { useMemo, useState } from 'react'
import InfiniteScroll from 'react-infinite-scroll-component'
import styled from 'styled-components/macro'

import { ButtonPrimary } from '../../components/Button'
import { OutlineCard } from '../../components/Card'
import { AutoColumn } from '../../components/Column'
import HarvestYieldModal from '../../components/earn/HarvestYieldModal'
//import PoolCard from '../../components/earn/PoolCard'
import { CardBGImage, CardNoise, CardSection, DataCard } from '../../components/earn/styled'
import UnstakeModal from '../../components/earn/UnstakeModal'
import Loader from '../../components/Loader'
import PoolPositionList from '../../components/PoolPositionList'
import { RowBetween, RowFixed } from '../../components/Row'
//import { LoadingSparkle } from '../../nft/components/common/Loading/LoadingSparkle'
import { Center } from '../../nft/components/Flex'
import { PoolRegisteredLog, useAllPoolsData, useStakingPools } from '../../state/pool/hooks'
import { useFreeStakeBalance, useUnclaimedRewards, useUserStakeBalances } from '../../state/stake/hooks'
import { ThemedText } from '../../theme'
//import { PoolPositionDetails } from '../../types/position'

//export interface PoolEventResponse {
//  events: PoolRegisteredLog[]
//  cursor?: string
//}

const PageWrapper = styled(AutoColumn)`
  padding: 68px 8px 0px;
  max-width: 640px;
  width: 100%;

  @media only screen and (max-width: ${({ theme }) => `${theme.breakpoint.md}px`}) {
    padding: 48px 8px 0px;
  }

  @media only screen and (max-width: ${({ theme }) => `${theme.breakpoint.sm}px`}) {
    padding-top: 20px;
  }
`

const TopSection = styled(AutoColumn)`
  max-width: 720px;
  width: 100%;
`

//const PoolSection = styled.div`
//  display: grid;
//  grid-template-columns: 1fr;
//  column-gap: 10px;
//  row-gap: 15px;
//  width: 100%;
//  justify-self: center;
//`

const MainContentWrapper = styled.main`
  background-color: ${({ theme }) => theme.deprecated_bg1};
  border: 1px solid ${({ theme }) => theme.backgroundOutline};
  padding: 0;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  box-shadow: 0px 0px 1px rgba(0, 0, 0, 0.01), 0px 4px 8px rgba(0, 0, 0, 0.04), 0px 16px 24px rgba(0, 0, 0, 0.04),
    0px 24px 32px rgba(0, 0, 0, 0.01);
`

const DataRow = styled(RowBetween)`
  ${({ theme }) => theme.deprecated_mediaWidth.deprecated_upToSmall`
flex-direction: column;
`};
`

const WrapSmall = styled(RowBetween)`
  margin-bottom: 1rem;
  ${({ theme }) => theme.deprecated_mediaWidth.deprecated_upToSmall`
    flex-wrap: wrap;
  `};
`

// TODO: check method renaming as we display staked pools first
function biggestOwnStakeFirst(a: any, b: any) {
  return b.hasStake - a.hasStake || b.poolOwnStake - a.poolOwnStake
}

export default function Stake() {
  const [showHarvestYieldModal, setShowHarvestYieldModal] = useState(false)
  const [showUnstakeModal, setShowUnstakeModal] = useState(false)

  const itemsPerPage = 10
  const [hasMore, setHasMore] = useState(true)
  const [records, setRecords] = useState(itemsPerPage)

  // we retrieve logs again as we want to be able to load pools when switching chain from stake page.
  const { data: allPools, loading } = useAllPoolsData()

  const { chainId } = useWeb3React()
  const freeStakeBalance = useFreeStakeBalance()
  const hasFreeStake = JSBI.greaterThan(freeStakeBalance ? freeStakeBalance.quotient : JSBI.BigInt(0), JSBI.BigInt(0))

  const poolAddresses = allPools?.map((p) => p.pool)
  const poolIds = allPools?.map((p) => p.id)
  const { stakingPools, loading: loadingPools } = useStakingPools(poolAddresses, poolIds)
  const grg = useMemo(() => (chainId ? GRG[chainId] : undefined), [chainId])
  const unclaimedRewards = useUnclaimedRewards(poolIds ?? [])
  // TODO: check if want to return null, but returning undefined will simplify displaying only if positive reward
  const yieldAmount: CurrencyAmount<Token> | undefined = useMemo(() => {
    if (!grg || !unclaimedRewards || unclaimedRewards?.length === 0) return undefined
    const yieldBigint = unclaimedRewards
      .map((reward) => reward.yieldAmount.quotient)
      .reduce((acc, value) => JSBI.add(acc, value))
    return CurrencyAmount.fromRawAmount(grg, yieldBigint ?? undefined)
  }, [grg, unclaimedRewards])
  const farmingPoolIds = useMemo(() => {
    const ids = unclaimedRewards?.map((reward) => reward?.yieldPoolId)
    return ids && ids?.length > 0 ? ids : undefined
  }, [unclaimedRewards])
  const userStakeBalances = useUserStakeBalances(poolIds ?? [])

  // TODO: check PoolPositionDetails type as irr and apr are number not string
  const poolsWithStats: PoolRegisteredLog[] = useMemo(() => {
    if (!allPools || !stakingPools) return []
    return allPools
      .map((p, i) => {
        const apr = stakingPools?.[i].apr
        const irr = stakingPools?.[i].irr
        const poolOwnStake = stakingPools?.[i].poolOwnStake
        const userHasStake = userStakeBalances?.[i].hasStake
        return {
          ...p,
          irr,
          apr,
          poolOwnStake,
          userHasStake,
        }
      })
      .sort(biggestOwnStakeFirst)
  }, [allPools, stakingPools, userStakeBalances])

  // TODO: useStakingPools hook also returns stake, ownStake, can use as filter and add stake to page
  //const [activeFilters, filtersDispatch] = useReducer(reduceFilters, initialFilterState)

  const fetchMoreData = () => {
    if (poolsWithStats && records === poolsWithStats.length) {
      setHasMore(false)
    } else {
      setTimeout(() => {
        setRecords(records + itemsPerPage)
      }, 500)
    }
  }

  const showItems = (records: number, poolsWithStats: PoolRegisteredLog[]) => {
    const items: PoolRegisteredLog[] = []

    for (let i = 0; i < records; i++) {
      if (poolsWithStats[i] !== undefined) {
        items.push(poolsWithStats[i])
      }
    }

    return items
  }

  const items = useMemo(() => {
    if (!poolsWithStats) return []
    return showItems(records, poolsWithStats)
  }, [records, poolsWithStats])

  return (
    <PageWrapper gap="lg" justify="center">
      <TopSection gap="md">
        <DataCard>
          <CardBGImage />
          <CardNoise />
          <CardSection>
            <AutoColumn gap="md">
              <RowBetween>
                <ThemedText.DeprecatedWhite fontWeight={600}>
                  <Trans>Staking Pools</Trans>
                </ThemedText.DeprecatedWhite>
              </RowBetween>
              <RowBetween>
                <ThemedText.DeprecatedWhite fontSize={14}>
                  <Trans>Select a pool to stake to, you will keep your voting power and earn staking rewards.</Trans>
                </ThemedText.DeprecatedWhite>
              </RowBetween>{' '}
            </AutoColumn>
          </CardSection>
          <CardBGImage />
          <CardNoise />
        </DataCard>
      </TopSection>

      <AutoColumn gap="lg" style={{ width: '100%', maxWidth: '720px' }}>
        <DataRow style={{ alignItems: 'baseline' }}>
          <HarvestYieldModal
            isOpen={showHarvestYieldModal}
            yieldAmount={yieldAmount}
            poolIds={farmingPoolIds}
            onDismiss={() => setShowHarvestYieldModal(false)}
            title={<Trans>Harvest</Trans>}
          />
          <UnstakeModal
            isOpen={showUnstakeModal}
            freeStakeBalance={freeStakeBalance}
            onDismiss={() => setShowUnstakeModal(false)}
            title={<Trans>Withdraw</Trans>}
          />
          <WrapSmall>
            <ThemedText.DeprecatedMediumHeader style={{ marginTop: '0.5rem' }}>
              <Trans>All Pools</Trans>
            </ThemedText.DeprecatedMediumHeader>
            <RowFixed gap="8px" style={{ marginRight: '4px' }}>
              {yieldAmount && (
                <ButtonPrimary
                  style={{ width: 'fit-content', height: '40px' }}
                  padding="8px"
                  $borderRadius="8px"
                  onClick={() => setShowHarvestYieldModal(true)}
                >
                  <Trans>Harvest</Trans>
                </ButtonPrimary>
              )}
              {hasFreeStake && (
                <ButtonPrimary
                  style={{ width: 'fit-content', height: '40px' }}
                  padding="8px"
                  $borderRadius="8px"
                  onClick={() => setShowUnstakeModal(true)}
                >
                  <Trans>Unstake</Trans>
                </ButtonPrimary>
              )}
            </RowFixed>
          </WrapSmall>
        </DataRow>

        <MainContentWrapper>
          {!allPools ? (
            <OutlineCard>
              <Trans>Please connect your wallet</Trans>
            </OutlineCard>
          ) : loading || loadingPools ? (
            <Loader style={{ margin: 'auto' }} />
          ) : poolsWithStats?.length > 0 ? (
            <InfiniteScroll
              next={fetchMoreData}
              hasMore={!!hasMore}
              loader={
                loadingPools ? (
                  <Center paddingY="20">
                    <h4>Loading...</h4>
                  </Center>
                ) : null
              }
              dataLength={poolsWithStats.length}
              style={{ overflow: 'unset' }}
            >
              <PoolPositionList positions={items} filterByOperator={false} />
            </InfiniteScroll>
          ) : poolsWithStats?.length === 0 ? (
            <OutlineCard>
              <Trans>No pool found</Trans>
            </OutlineCard>
          ) : null}
        </MainContentWrapper>
      </AutoColumn>
    </PageWrapper>
  )
}
