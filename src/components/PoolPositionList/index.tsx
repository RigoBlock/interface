import { Interface } from '@ethersproject/abi'
import { Trans } from '@lingui/macro'
import { useWeb3React } from '@web3-react/core'
import POOL_EXTENDED_ABI from 'abis/pool-extended.json'
import PoolPositionListItem from 'components/PoolPositionListItem'
import { RowFixed } from 'components/Row'
import { MouseoverTooltip } from 'components/Tooltip'
import { useMultipleContractSingleData } from 'lib/hooks/multicall'
import React, { useMemo } from 'react'
import { useStakingPools } from 'state/pool/hooks'
import styled from 'styled-components/macro'
import { MEDIA_WIDTHS } from 'theme'
import { PoolPositionDetails } from 'types/position'

const DesktopHeader = styled.div`
  display: none;
  font-size: 14px;
  font-weight: 500;
  padding: 16px;
  border-bottom: 1px solid ${({ theme }) => theme.backgroundOutline};

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
  border-bottom: 1px solid ${({ theme }) => theme.backgroundOutline};

  @media screen and (min-width: ${MEDIA_WIDTHS.deprecated_upToSmall}px) {
    display: none;
  }

  @media screen and (max-width: ${MEDIA_WIDTHS.deprecated_upToExtraSmall}px) {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
  }
`

function highestAprFirst(a: any, b: any) {
  return b.apr - a.apr
}

type PoolPositionListProps = React.PropsWithChildren<{
  positions: PoolPositionDetails[]
  filterByOperator?: any
  filterByHolder?: string
}>

export default function PoolPositionList({ positions, filterByOperator }: PoolPositionListProps) {
  const { account, chainId } = useWeb3React()
  // TODO: we should merge this part with same part in swap page and move to a custom hook
  const poolAddresses = positions.map((p) => p.pool)
  const poolIds = positions.map((p) => p.id)
  const stakingPools = useStakingPools(poolAddresses, poolIds)
  // TODO: can define more variables here {aprs, stake, ownStake}
  const aprs = stakingPools?.stakingPools?.map((p) => p.apr)
  const irrs = stakingPools?.stakingPools?.map((p) => p.irr)
  const PoolInterface = new Interface(POOL_EXTENDED_ABI)
  // TODO: check how many times we are making this rpc call
  const results = useMultipleContractSingleData(poolAddresses, PoolInterface, 'getPool')
  // TODO: if we initiate this in state, we can later query from state instead of making rpc call
  //  in 1) swap and 2) each pool url, we could also store poolId at that point
  const operatedPools = useMemo(() => {
    return results
      .map((result, i) => {
        const { result: pools, loading } = result
        if (!chainId || loading || !pools || !pools?.[0] || !aprs || !irrs) return ''
        const { name, symbol, decimals, owner } = pools?.[0]
        const isPoolOperator = owner === account
        if (filterByOperator && !isPoolOperator) return ''
        const address = poolAddresses[i]
        const apr = aprs[i]
        const irr = irrs[i]
        return {
          ...result,
          apr,
          irr,
          address,
          decimals,
          symbol,
          name,
          chainId,
        }
      })
      .filter((p) => p !== '')
  }, [account, chainId, filterByOperator, poolAddresses, aprs, irrs, results])

  return (
    <>
      <DesktopHeader>
        <div>
          {filterByOperator ? <Trans>Operated pools</Trans> : <Trans>Loaded pools</Trans>}
          {positions && ' (' + operatedPools.length + ')'}
        </div>
        {!filterByOperator && (
          <RowFixed style={{ gap: '40px' }}>
            <MouseoverTooltip
              text={<Trans>The pool operator&apos;s annualized yield. Increases as more stakers join the pool.</Trans>}
            >
              irr&ensp;
            </MouseoverTooltip>
            <MouseoverTooltip
              text={
                <Trans>
                  The stakers&apos; annualized yield. Increases as the pool increases its own stake or as the pool
                  operator increases the percent of rewards shared.
                </Trans>
              }
            >
              apr&ensp;
            </MouseoverTooltip>
          </RowFixed>
        )}
      </DesktopHeader>
      <MobileHeader>
        <div>{filterByOperator ? <Trans>Operated pools</Trans> : <Trans>Loaded pools</Trans>}</div>
        {!filterByOperator && (
          <RowFixed style={{ gap: '40px' }}>
            <div>
              <Trans>irr&ensp;</Trans>
            </div>
            <div>
              <Trans>apr&ensp;</Trans>
            </div>
          </RowFixed>
        )}
      </MobileHeader>
      {operatedPools.length !== 0 ? (
        operatedPools.sort(highestAprFirst).map((p: any) => {
          return (
            <PoolPositionListItem
              key={p?.address.toString()}
              positionDetails={p}
              returnPage={filterByOperator ? 'mint' : 'stake'}
            />
          )
        })
      ) : (
        <>
          <DesktopHeader>
            <div>
              <Trans>You are not operating a pool. Click the &quot;Create Pool&quot; button to deploy one.</Trans>
            </div>
          </DesktopHeader>
          <MobileHeader>
            <Trans>You are not operating a pool. Click the &quot;Create Pool&quot; button to deploy one.</Trans>
          </MobileHeader>
        </>
      )}
    </>
  )
}
