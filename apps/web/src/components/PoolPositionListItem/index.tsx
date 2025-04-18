//import Badge from 'components/Badge'
import { ButtonPrimary } from 'components/Button/buttons'
import Row, { RowBetween, RowFixed } from 'components/deprecated/Row'
import RaceModal from 'components/earn/RaceModal'
//import RangeBadge from 'components/Badge/RangeBadge'
//import Loader from 'components/Loader'
//import { useToken } from 'hooks/Tokens'
import { Trans } from 'react-i18next'
import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import styled, { useTheme } from 'lib/styled-components'
import { MEDIA_WIDTHS } from 'theme'
import { PoolPositionDetails } from 'types/position'

const LinkRow = styled(Link)`
  align-items: center;
  display: flex;
  cursor: pointer;
  user-select: none;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  color: ${({ theme }) => theme.neutral1};
  padding: 16px;
  text-decoration: none;
  font-weight: 500;

  & > div:not(:first-child) {
    text-align: center;
  }
  :hover {
    background-color: ${({ theme }) => theme.deprecated_hoverDefault};
  }

  @media screen and (min-width: ${MEDIA_WIDTHS.deprecated_upToSmall}px) {
    /* flex-direction: row; */
  }

  ${({ theme }) => theme.deprecated_mediaWidth.deprecated_upToSmall`
    flex-direction: column;
    row-gap: 8px;
  `};
`

const PrimaryPositionIdData = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  > * {
    margin-right: 8px;
  }
`

const DataText = styled.div`
  font-weight: 600;
  font-size: 18px;

  ${({ theme }) => theme.deprecated_mediaWidth.deprecated_upToSmall`
    font-size: 18px;
  `};
`

const DataLineItem = styled.div`
  font-size: 14px;
`

const RangeLineItem = styled(DataLineItem)`
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-top: 4px;
  width: 100%;
`

const RangeText = styled.span`
  padding: 0.25rem 0.25rem;
  border-radius: 8px;
`

const ExtentsText = styled.span`
  color: ${({ theme }) => theme.neutral2};
  font-size: 14px;
  margin-right: 4px;
  ${({ theme }) => theme.deprecated_mediaWidth.deprecated_upToSmall`
    display: none;
  `};
`

const LabelText = styled.div<{ color: string }>`
  align-items: center;
  color: ${({ color }) => color};
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
`

const BadgeText = styled.div`
  font-weight: 500;
  font-size: 12px;
  line-height: 14px;
  margin-right: 4px;
`

const ActiveDot = styled.span`
  background-color: ${({ theme }) => theme.success};
  border-radius: 50%;
  height: 8px;
  width: 8px;
`

const ResponsiveRowFixed = styled(RowFixed)`
  margin-top: 4px;
  margin-right: 4px;

  @media screen and (max-width: ${MEDIA_WIDTHS.deprecated_upToExtraSmall}px) {
    margin-top: -12px;
    margin-right: -4px;
  }
`

interface PoolPositionListItemProps {
  positionDetails: PoolPositionDetails
  returnPage: string
}

export default function PoolPositionListItem({ positionDetails, returnPage }: PoolPositionListItemProps) {
  const theme = useTheme()
  const {
    name,
    apr,
    irr,
    userHasStake,
    poolDelegatedStake,
    poolOwnStake,
    userBalance,
    userIsOwner,
    currentEpochReward,
  } = positionDetails

  const shouldDisplayRaceButton = Number(currentEpochReward) === 0
  //const position = useMemo(() => {
  //  return new PoolPosition({ name, symbol, pool, id })
  //}, [name, symbol, pool, id])

  //const positionSummaryLink = '/smart-pool/' + positionDetails.pool '/' + positionDetails.id
  const poolStake = poolDelegatedStake ? (Number(poolDelegatedStake) / 1e18).toFixed(0) : 'NaN'
  const aprToString = apr ? (Number(apr) * 100).toFixed(2) : 'NaN'
  const poolOwnStakeString = poolOwnStake ? (Number(poolOwnStake) / 1e18).toFixed(0) : 'NaN'
  const irrToString = irr ? (Number(irr) * 100).toFixed(2) : 'NaN'
  const positionSummaryLink =
    poolStake !== 'NaN'
      ? `/smart-pool/${positionDetails.address}/${returnPage}/${poolStake}/${aprToString}/${poolOwnStakeString}/${irrToString}`
      : `/smart-pool/${positionDetails.address}/${returnPage}` ///${positionDetails.id}

  const [showRaceModal, setShowRaceModal] = useState<boolean>(false)

  const onButtonClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      setShowRaceModal(true)
    },
    [setShowRaceModal]
  )

  return (
    <>
      <RaceModal
        isOpen={showRaceModal}
        poolAddress={positionDetails.address}
        poolName={name}
        onDismiss={() => setShowRaceModal(false)}
        title={<Trans>Race Smart Pool</Trans>}
      />
      <LinkRow to={positionSummaryLink}>
        <RowBetween>
          <PrimaryPositionIdData>
            <Row gap="sm" justify="flex-end">
              <DataText>{name}</DataText>
              {userHasStake && (
                <LabelText color={theme.success}>
                  <BadgeText>
                    <Trans>active</Trans>
                  </BadgeText>
                  <ActiveDot />
                </LabelText>
              )}
              {returnPage === 'mint' && Number(userBalance) > 0 && (
                <LabelText color={theme.success}>
                  <BadgeText>
                    <Trans>held</Trans>
                  </BadgeText>
                  <ActiveDot />
                </LabelText>
              )}
              {returnPage === 'mint' && userIsOwner && (
                <LabelText color={theme.success}>
                  <BadgeText>
                    <Trans>owned</Trans>
                  </BadgeText>
                  <ActiveDot />
                </LabelText>
              )}
            </Row>
          </PrimaryPositionIdData>
          {returnPage === 'mint' && shouldDisplayRaceButton ? (
            <ResponsiveRowFixed gap="24px">
              <ButtonPrimary
                style={{ width: 'fit-content', height: '40px' }}
                padding="8px"
                $borderRadius="8px"
                onClick={onButtonClick}
              >
                <Trans>Race</Trans>
              </ButtonPrimary>
            </ResponsiveRowFixed>
          ) : returnPage === 'mint' ? (
            <RowFixed style={{ gap: '24px', marginRight: '8px' }}>
              <DataText>{(Number(currentEpochReward) / 1e18).toFixed(0)} GRG</DataText>
            </RowFixed>
          ) : (
            returnPage === 'stake' && (
              <RowFixed style={{ gap: '24px', marginRight: '8px' }}>
                <DataText>{(Number(irr) * 100).toFixed(1)}%</DataText>
                <DataText style={{ minWidth: '50px' }}>{(Number(apr) * 100).toFixed(1)}%</DataText>
              </RowFixed>
            )
          )}
        </RowBetween>
        <RangeLineItem>
          <RangeText>
            <ExtentsText>
              <Trans>{positionDetails.address}</Trans>
            </ExtentsText>
          </RangeText>
        </RangeLineItem>
      </LinkRow>
    </>
  )
}
