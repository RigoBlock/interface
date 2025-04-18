//import { BigNumber } from '@ethersproject/bignumber'
//import type { TransactionResponse } from '@ethersproject/providers'
//import { Trace } from '@uniswap/analytics'
//import { PageName } from '@uniswap/analytics-events'
import { /*Currency,*/ CurrencyAmount /*, Fraction*/, Percent /*, Price, Token*/ } from '@uniswap/sdk-core'
//import { NonfungiblePositionManager, Pool, Position } from '@uniswap/v3-sdk'
import { IconHoverText } from 'components/AccountDrawer/IconButton'
//import { sendEvent } from 'components/analytics'
//import Badge from 'components/Badge'
import { /*ButtonConfirmed, ButtonGray,*/ ButtonPrimary } from 'components/Button/buttons'
import { DarkCard, LightCard } from 'components/Card/cards'
import { AutoColumn } from 'components/deprecated/Column'
import BuyModal from 'components/createPool/BuyModal'
import SellModal from 'components/createPool/SellModal'
import SetLockupModal from 'components/createPool/SetLockupModal'
import SetSpreadModal from 'components/createPool/SetSpreadModal'
import SetValueModal from 'components/createPool/SetValueModal'
import Row, { RowBetween, RowFixed } from 'components/deprecated/Row'
import HarvestYieldModal from 'components/earn/HarvestYieldModal'
import MoveStakeModal from 'components/earn/MoveStakeModal'
import UnstakeModal from 'components/earn/UnstakeModal'
//import Loader from 'components/Loader'
//import { Dots } from 'components/swap/styleds'
import { SwitchLocaleLink } from 'components/SwitchLocaleLink'
//import Toggle from 'components/Toggle'
import TransactionConfirmationModal, { ConfirmationModalContent } from 'components/TransactionConfirmationModal'
import DelegateModal from 'components/vote/DelegateModal'
import { /*BIG_INT_ZERO,*/ ZERO_ADDRESS } from 'constants/misc'
import { useCurrency } from 'hooks/Tokens'
import { useAccount } from 'hooks/useAccount'
import { UserAccount, useSmartPoolFromAddress, useUserPoolBalance } from 'hooks/useSmartPools'
// TODO: this import is from node modules
import JSBI from 'jsbi'
//import { PoolState, usePool } from 'hooks/usePools'
//import useStablecoinPrice from 'hooks/useStablecoinPrice'
//import { useSingleCallResult } from 'lib/hooks/multicall'
//import useNativeCurrency from 'lib/hooks/useNativeCurrency'
import styled /*, { useTheme }*/ from 'lib/styled-components'
import { nativeOnChain } from 'uniswap/src/constants/tokens'
import { Trans } from 'react-i18next'
import { useCallback, useMemo, /*useRef,*/ useState } from 'react'
import { Link, useParams } from 'react-router-dom'
//import { Bound } from 'state/mint/v3/actions'
import { PoolInfo } from 'state/buy/hooks'
//import { useTokenBalance } from 'state/connection/hooks'
import { useCurrencyBalancesMultipleAccounts } from 'state/connection/hooks'
import { usePoolIdByAddress } from 'state/governance/hooks'
import { useFreeStakeBalance, useUnclaimedRewards } from 'state/stake/hooks'
//import { useIsTransactionPending, useTransactionAdder } from 'state/transactions/hooks'
import { /*HideExtraSmall,*/ ThemedText } from 'theme/components'
import { CopyHelper } from 'theme/components/CopyHelper'
import { ExternalLink } from 'theme/components/Links'
import { ExplorerDataType, getExplorerLink } from 'uniswap/src/utils/linking'
import { shortenAddress } from 'utilities/src/addresses'
//import { currencyId } from 'utils/currencyId'
import { formatCurrencyAmount } from 'utils/formatCurrencyAmount'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
//import { formatTickPrice } from 'utils/formatTickPrice'
//import { unwrappedToken } from 'utils/unwrappedToken'

//import RangeBadge from '../../components/Badge/RangeBadge'
//import RateToggle from '../../components/RateToggle'
//import { SwitchLocaleLink } from '../../components/SwitchLocaleLink'
//import { useSwapState } from '../../state/swap/hooks'
//import { TransactionType } from '../../state/transactions/types'
//import { calculateGasMargin } from '../../utils/calculateGasMargin'
//import { LoadingRows } from '../Pool/styleds'

const PageWrapper = styled.div`
  padding: 68px 8px 0px;

  min-width: 800px;
  max-width: 960px;

  @media only screen and (max-width: ${({ theme }) => `${theme.breakpoint.md}px`}) {
    padding: 48px 8px 0px;
  }

  @media only screen and (max-width: ${({ theme }) => `${theme.breakpoint.sm}px`}) {
    padding-top: 20px;
  }

  ${({ theme }) => theme.deprecated_mediaWidth.deprecated_upToMedium`
    min-width: 680px;
    max-width: 680px;
  `};

  ${({ theme }) => theme.deprecated_mediaWidth.deprecated_upToSmall`
    min-width: 600px;
    max-width: 600px;
  `};

  @media only screen and (max-width: 620px) {
    min-width: 500px;
    max-width: 500px;
  }

  ${({ theme }) => theme.deprecated_mediaWidth.deprecated_upToExtraSmall`
    min-width: 340px;
    max-width: 340px;
  `};
`

//const BadgeText = styled.div`
//  font-weight: 500;
//  font-size: 14px;
//`

// responsive text
// disable the warning because we don't use the end prop, we just want to filter it out
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const Label = styled(({ end, ...props }) => <ThemedText.DeprecatedLabel {...props} />)<{ end?: boolean }>`
  display: flex;
  font-size: 16px;
  justify-content: ${({ end }) => (end ? 'flex-end' : 'flex-start')};
  align-items: center;
`

const ExtentsText = styled.span`
  color: ${({ theme }) => theme.neutral2};
  font-size: 14px;
  text-align: center;
  margin-right: 4px;
  font-weight: 500;
`

const HoverText = styled(ThemedText.DeprecatedMain)`
  text-decoration: none;
  color: ${({ theme }) => theme.neutral3};
  :hover {
    color: ${({ theme }) => theme.neutral1};
    text-decoration: none;
  }
`

const IconContainer = styled.div`
  display: flex;
  align-items: center;
  & > a,
  & > button {
    margin-right: 0px;
    margin-left: 40px;
  }

  & > button:last-child {
    margin-left: 8px;
    ${IconHoverText}:last-child {
      right: 0px;
    }
  }
  justify-content: center;
`

//const DoubleArrow = styled.span`
//  color: ${({ theme }) => theme.neutral2};
//  margin: 0 1rem;
//`

const ResponsiveRow = styled(RowBetween)`
  ${({ theme }) => theme.deprecated_mediaWidth.deprecated_upToSmall`
    flex-direction: column;
    align-items: flex-start;
    row-gap: 16px;
    width: 100%:
  `};
`

const ResponsiveButtonPrimary = styled(ButtonPrimary)`
  border-radius: 12px;
  padding: 6px 8px;
  width: fit-content;
  ${({ theme }) => theme.deprecated_mediaWidth.deprecated_upToSmall`
    flex: 1 1 auto;
    width: 49%;
  `};
`

function getZapperLink(data: string): string {
  return `https://zapper.xyz/account/${data}`
}

function AddressCard({
  address,
  chainId,
  label,
}: {
  address?: string | null
  chainId?: number | null
  label?: string | null
}) {
  if (!address || !chainId || !label) {
    return null
  }

  return (
    <LightCard padding="12px ">
      <AutoColumn gap="md">
        <ExtentsText>
          <Trans>{label}</Trans>
        </ExtentsText>
      </AutoColumn>
      {/*<AutoColumn gap="8px" justify="center">#*/}
      <AutoColumn gap="md">
        <ExtentsText>
          {typeof chainId === 'number' && address ? (
            <IconContainer>
              <CopyHelper iconSize={20} iconPosition="right" toCopy={address}>
                <Row width="100px" padding="8px 4px">
                  <ExternalLink href={getExplorerLink(chainId, address, ExplorerDataType.ADDRESS)}>
                    <Trans>{shortenAddress(address)}</Trans>
                  </ExternalLink>
                </Row>
              </CopyHelper>
            </IconContainer>
          ) : null}
        </ExtentsText>
        {/*</AutoColumn>
          <ExtentsText>
            <Trans>{poolAddress}</Trans>
          </ExtentsText>
        */}
      </AutoColumn>
    </LightCard>
  )
}

export default function PoolPositionPage() {
  const {
    poolAddress: poolAddressFromUrl,
    returnPage: originFromUrl,
    poolStake: poolStakeFromUrl,
    apr: aprFromUrl,
    poolOwnStake: poolOwnStakeFromUrl,
    irr: irrFromUrl,
  } = useParams<{
    poolAddress: string
    returnPage: string
    poolStake: string
    apr: string
    poolOwnStake: string
    irr: string
  }>()
  const account = useAccount()
  //const theme = useTheme()

  const [showConfirm, setShowConfirm] = useState(false)

  const [showBuyModal, setShowBuyModal] = useState(false)
  const [showSellModal, setShowSellModal] = useState(false)
  const [showSetLockupModal, setShowSetLockupModal] = useState(false)
  const [showSetSpreadModal, setShowSetSpreadModal] = useState(false)
  const [showSetValueModal, setShowSetValueModal] = useState(false)
  const [showStakeModal, setShowStakeModal] = useState(false)
  const [showMoveStakeModal, setShowMoveStakeModal] = useState(false)
  const [showUnstakeModal, setShowUnstakeModal] = useState(false)
  const [deactivate, setDeactivate] = useState(false)
  const [showHarvestYieldModal, setShowHarvestYieldModal] = useState(false)

  // TODO: check how can reduce number of calls by limit update of poolStorage
  //  id is stored in registry so we could save rpc call by using storing in state?
  const poolStorage = useSmartPoolFromAddress(poolAddressFromUrl ?? undefined)
  // TODO: user account also stores activation
  const userAccount: UserAccount | undefined = useUserPoolBalance(poolAddressFromUrl, account.address)

  const { name, symbol, decimals, owner, baseToken } = poolStorage?.poolInitParams || {}
  const { minPeriod, spread, transactionFee } = poolStorage?.poolVariables || {}
  const { unitaryValue, totalSupply } = poolStorage?.poolTokensInfo || {}

  let base = useCurrency(baseToken !== ZERO_ADDRESS ? baseToken : undefined)
  if (baseToken === ZERO_ADDRESS) {
    base = nativeOnChain(account.chainId ?? UniverseChainId.Mainnet)
  }

  const pool = useCurrency(poolAddressFromUrl ?? undefined)
  const amount = JSBI.BigInt(unitaryValue ?? 0)
  const poolPrice = pool ? CurrencyAmount.fromRawAmount(pool, amount) : undefined
  const userPoolBalance = pool
    ? CurrencyAmount.fromRawAmount(pool, JSBI.BigInt(userAccount?.userBalance ?? 0))
    : undefined
  const hasBalance = useMemo(
    () => JSBI.greaterThan(JSBI.BigInt(userAccount?.userBalance ?? 0), JSBI.BigInt(0)),
    [userAccount]
  )
  const baseTokenSymbol = base?.symbol

  const poolValue = JSBI.divide(
    JSBI.multiply(JSBI.BigInt(unitaryValue ?? 0), JSBI.BigInt(totalSupply ?? 0)),
    JSBI.exponentiate(JSBI.BigInt(10), JSBI.BigInt(decimals ?? 18))
  )

  const lockup = (Number(minPeriod) / 86400).toLocaleString()

  // TODO: check if should move definitions in custom hook
  //const poolInfo= usePoolInfo(poolAddressFromUrl)
  // TODO: pass recipient as optional parameter to check currency balance hook
  const poolInfo = {
    pool,
    recipient: account.address,
    owner,
    userPoolBalance,
    activation: Number(userAccount?.activation),
    poolPriceAmount: poolPrice,
    spread,
    poolStake: Number(poolStakeFromUrl),
    apr: Number(aprFromUrl),
    poolOwnStake: Number(poolOwnStakeFromUrl),
    irr: Number(irrFromUrl),
  } as PoolInfo
  const baseTokenBalances = useCurrencyBalancesMultipleAccounts(
    [account.address ?? undefined, poolAddressFromUrl ?? undefined],
    base ?? undefined
  )

  // TODO: check how improve efficiency as this method is called each time a pool is loaded
  const { poolId } = usePoolIdByAddress(poolAddressFromUrl ?? undefined)
  const isPoolOperator = account.address === owner
  const unclaimedRewards = useUnclaimedRewards(isPoolOperator && poolId ? [poolId] : [])
  const freeStakeBalance = useFreeStakeBalance()
  const hasFreeStake = JSBI.greaterThan(freeStakeBalance ? freeStakeBalance.quotient : JSBI.BigInt(0), JSBI.BigInt(0))

  const handleMoveStakeClick = useCallback(() => {
    setShowMoveStakeModal(true)
    if (deactivate) {
      setDeactivate(false)
    }
  }, [deactivate])

  const handleDeactivateStakeClick = useCallback(() => {
    setShowMoveStakeModal(true)
    setDeactivate(true)
  }, [])

  function modalHeader() {
    return (
      <AutoColumn gap="md" style={{ marginTop: '20px' }}>
        <ThemedText.DeprecatedMain>
          <Trans>Let&apos;s check where this component goes.</Trans>
        </ThemedText.DeprecatedMain>
      </AutoColumn>
    )
  }

  return (
    <>
      <PageWrapper>
        <TransactionConfirmationModal
          isOpen={showConfirm}
          onDismiss={() => setShowConfirm(false)}
          attemptingTxn={showConfirm}
          hash=""
          reviewContent={() => (
            <ConfirmationModalContent
              title={<Trans>Claim fees</Trans>}
              onDismiss={() => setShowConfirm(false)}
              topContent={modalHeader}
            />
          )}
          pendingText={<Trans>Collecting fees</Trans>}
        />
        {poolInfo && (
          <>
            {account.address && (
              <BuyModal
                isOpen={showBuyModal}
                onDismiss={() => setShowBuyModal(false)}
                poolInfo={poolInfo}
                userBaseTokenBalance={baseTokenBalances[account.address]}
              />
            )}
            {account.address && poolAddressFromUrl && (
              <SellModal
                isOpen={showSellModal}
                onDismiss={() => setShowSellModal(false)}
                poolInfo={poolInfo}
                userBaseTokenBalance={baseTokenBalances[account.address]}
                poolBaseTokenBalance={baseTokenBalances[poolAddressFromUrl]}
              />
            )}
            <SetLockupModal
              isOpen={showSetLockupModal}
              currentLockup={Number(minPeriod).toString()}
              onDismiss={() => setShowSetLockupModal(false)}
              title={<Trans>Set Lockup</Trans>}
            />
            {spread && (
              <SetSpreadModal
                isOpen={showSetSpreadModal}
                currentSpread={spread}
                onDismiss={() => setShowSetSpreadModal(false)}
                title={<Trans>Set Spread</Trans>}
              />
            )}
            {baseTokenSymbol && (
              <SetValueModal
                isOpen={showSetValueModal}
                onDismiss={() => setShowSetValueModal(false)}
                baseTokenSymbol={baseTokenSymbol}
                title={<Trans>Set Value</Trans>}
              />
            )}
            <DelegateModal
              isOpen={showStakeModal}
              poolInfo={poolInfo}
              onDismiss={() => setShowStakeModal(false)}
              title={<Trans>Stake</Trans>}
            />
            <MoveStakeModal
              isOpen={showMoveStakeModal}
              poolInfo={poolInfo}
              isDeactivate={deactivate}
              onDismiss={() => setShowMoveStakeModal(false)}
              title={!deactivate ? <Trans>Move Stake</Trans> : <Trans>Deactivate Stake</Trans>}
            />
            <UnstakeModal
              isOpen={showUnstakeModal}
              isPool={true}
              freeStakeBalance={freeStakeBalance}
              onDismiss={() => setShowUnstakeModal(false)}
              title={<Trans>Withdraw</Trans>}
            />
            {unclaimedRewards && poolId && (
              <HarvestYieldModal
                isOpen={showHarvestYieldModal}
                isPool={true}
                yieldAmount={unclaimedRewards[0]?.yieldAmount}
                poolIds={[poolId]}
                onDismiss={() => setShowHarvestYieldModal(false)}
                title={<Trans>Harvest Pool Yield</Trans>}
              />
            )}
          </>
        )}
        <AutoColumn gap="md">
          <AutoColumn gap="sm">
            <ResponsiveRow>
              <RowFixed gap="lg">
                {originFromUrl && (
                  <Link
                    data-cy="visit-pool"
                    style={{ textDecoration: 'none', width: 'fit-content', marginBottom: '0.5rem' }}
                    to={originFromUrl === 'mint' ? '/mint' : '/stake'}
                  >
                    <HoverText>
                      <Trans>← Back to Pools</Trans>
                    </HoverText>
                  </Link>
                )}
                {unclaimedRewards && unclaimedRewards[0]?.yieldAmount && (
                  <ResponsiveButtonPrimary
                    style={{ marginRight: '8px' }}
                    width="fit-content"
                    padding="6px 8px"
                    $borderRadius="12px"
                    onClick={() => setShowHarvestYieldModal(true)}
                  >
                    <Trans>Harvest {formatCurrencyAmount(unclaimedRewards[0].yieldAmount, 4)} GRG</Trans>
                  </ResponsiveButtonPrimary>
                )}
              </RowFixed>
            </ResponsiveRow>
            <ResponsiveRow>
              <RowFixed>
                <ThemedText.DeprecatedLabel fontSize="24px" mr="10px">
                  &nbsp;{name}&nbsp;|&nbsp;{symbol}&nbsp;
                </ThemedText.DeprecatedLabel>
              </RowFixed>
              {poolAddressFromUrl && (
                <ExternalLink href={getZapperLink(poolAddressFromUrl)}>
                  <RowFixed>
                    <ThemedText.DeprecatedMain>Pool Data ↗</ThemedText.DeprecatedMain>
                  </RowFixed>
                </ExternalLink>
              )}
              <RowFixed>
                <ResponsiveButtonPrimary
                  onClick={() => setShowBuyModal(true)}
                  width="fit-content"
                  padding="6px 8px"
                  $borderRadius="12px"
                  style={{ marginRight: '8px' }}
                >
                  <Trans>Buy</Trans>
                </ResponsiveButtonPrimary>
                {hasBalance && (
                  <ResponsiveButtonPrimary
                    onClick={() => setShowSellModal(true)}
                    width="fit-content"
                    padding="6px 8px"
                    $borderRadius="12px"
                  >
                    <Trans>Sell</Trans>
                  </ResponsiveButtonPrimary>
                )}
              </RowFixed>
            </ResponsiveRow>
          </AutoColumn>
          <ResponsiveRow align="flex-start">
            <AutoColumn gap="sm" style={{ width: '100%', height: '100%' }}>
              <DarkCard
                width="100%"
                height="100%"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  flexDirection: 'column',
                  justifyContent: 'space-around',
                  marginRight: '12px',
                }}
              >
                <AutoColumn gap="md" style={{ width: '100%' }}>
                  <AutoColumn gap="md">
                    <Label>Pool Values</Label>
                  </AutoColumn>
                  <LightCard padding="12px 16px">
                    <AutoColumn gap="md">
                      {poolValue && base && (
                        <RowBetween>
                          <RowFixed>
                            <ThemedText.DeprecatedMain>
                              <Trans>Total Value</Trans>
                            </ThemedText.DeprecatedMain>
                          </RowFixed>
                          <RowFixed>
                            <ThemedText.DeprecatedMain>
                              <Trans>
                                {formatCurrencyAmount(CurrencyAmount.fromRawAmount(base, poolValue), 4)}&nbsp;
                                {baseTokenSymbol}
                              </Trans>
                            </ThemedText.DeprecatedMain>
                          </RowFixed>
                        </RowBetween>
                      )}
                      {baseTokenSymbol && (
                        <RowBetween>
                          <RowFixed>
                            <ThemedText.DeprecatedMain>
                              <Trans>Unitary Value</Trans>
                            </ThemedText.DeprecatedMain>
                          </RowFixed>
                          <RowFixed>
                            {owner === account.address && JSBI.greaterThan(poolValue, JSBI.BigInt(0)) ? (
                              <ResponsiveButtonPrimary
                                onClick={() => setShowSetValueModal(true)}
                                height="1.1em"
                                width="fit-content"
                                padding="6px 8px"
                                $borderRadius="12px"
                              >
                                <Trans>
                                  {formatCurrencyAmount(poolPrice, 4)}&nbsp;{baseTokenSymbol}
                                </Trans>
                              </ResponsiveButtonPrimary>
                            ) : (
                              <ThemedText.DeprecatedMain>
                                <Trans>
                                  {formatCurrencyAmount(poolPrice, 4)}&nbsp;{baseTokenSymbol}
                                </Trans>
                              </ThemedText.DeprecatedMain>
                            )}
                          </RowFixed>
                        </RowBetween>
                      )}
                    </AutoColumn>
                  </LightCard>
                </AutoColumn>
              </DarkCard>
              <DarkCard>
                <AutoColumn gap="sm" style={{ width: '100%', height: '100%' }}>
                  <DarkCard>
                    <AutoColumn gap="md" style={{ width: '100%' }}>
                      <AutoColumn gap="md">
                        <Label>
                          <Trans>Issuance Data</Trans>
                        </Label>
                        <LightCard>
                          <AutoColumn>
                            {totalSupply && base && (
                              <RowBetween>
                                <RowFixed>
                                  <ThemedText.DeprecatedMain>
                                    <Trans>Total Supply</Trans>
                                  </ThemedText.DeprecatedMain>
                                </RowFixed>
                                <RowFixed>
                                  <ThemedText.DeprecatedMain>
                                    <Trans>
                                      {formatCurrencyAmount(
                                        CurrencyAmount.fromRawAmount(base, JSBI.BigInt(totalSupply)),
                                        4
                                      )}
                                    </Trans>
                                    &nbsp;{symbol}
                                  </ThemedText.DeprecatedMain>
                                </RowFixed>
                              </RowBetween>
                            )}
                          </AutoColumn>
                        </LightCard>
                      </AutoColumn>
                    </AutoColumn>
                  </DarkCard>
                </AutoColumn>
              </DarkCard>
            </AutoColumn>
            <RowBetween style={{ width: '2%' }}></RowBetween>
            <AutoColumn gap="sm" style={{ width: '100%', height: '100%' }}>
              <DarkCard>
                <AutoColumn gap="md" style={{ width: '100%' }}>
                  <AutoColumn gap="md">
                    <Label>
                      <Trans>Cost Factors</Trans>
                    </Label>
                    <LightCard padding="12px 16px">
                      <AutoColumn gap="md">
                        {spread && (
                          <RowBetween>
                            <RowFixed>
                              <ThemedText.DeprecatedMain>
                                <Trans>Spread</Trans>
                              </ThemedText.DeprecatedMain>
                            </RowFixed>
                            <RowFixed>
                              {owner === account.address ? (
                                <ResponsiveButtonPrimary
                                  onClick={() => setShowSetSpreadModal(true)}
                                  height="1.1em"
                                  width="fit-content"
                                  padding="6px 8px"
                                  $borderRadius="12px"
                                >
                                  <Trans>{new Percent(spread, 10_000).toSignificant()}%</Trans>
                                </ResponsiveButtonPrimary>
                              ) : (
                                <ThemedText.DeprecatedMain>
                                  <Trans>{new Percent(spread, 10_000).toSignificant()}%</Trans>
                                </ThemedText.DeprecatedMain>
                              )}
                            </RowFixed>
                          </RowBetween>
                        )}
                        {transactionFee && transactionFee !== 0 ? (
                          <RowBetween>
                            <RowFixed>
                              <ThemedText.DeprecatedMain>
                                <Trans>Distribution Fee</Trans>
                              </ThemedText.DeprecatedMain>
                            </RowFixed>
                            <RowFixed>
                              <ThemedText.DeprecatedMain>
                                <Trans>{new Percent(transactionFee, 10_000).toSignificant()}%</Trans>
                              </ThemedText.DeprecatedMain>
                            </RowFixed>
                          </RowBetween>
                        ) : null}
                        {lockup && (
                          <RowBetween>
                            <RowFixed>
                              <ThemedText.DeprecatedMain>
                                <Trans>Lockup</Trans>
                              </ThemedText.DeprecatedMain>
                            </RowFixed>
                            <RowFixed>
                              {owner === account.address ? (
                                <ResponsiveButtonPrimary
                                  onClick={() => setShowSetLockupModal(true)}
                                  height="1.1em"
                                  width="fit-content"
                                  fontSize={4}
                                  padding="6px 8px"
                                  $borderRadius="12px"
                                >
                                  <Trans>{lockup} days</Trans>
                                </ResponsiveButtonPrimary>
                              ) : (
                                <ThemedText.DeprecatedMain>
                                  <Trans>{lockup} days</Trans>
                                </ThemedText.DeprecatedMain>
                              )}
                            </RowFixed>
                          </RowBetween>
                        )}
                      </AutoColumn>
                    </LightCard>
                  </AutoColumn>
                </AutoColumn>
              </DarkCard>
              <DarkCard>
                <AutoColumn gap="sm" style={{ width: '100%', height: '100%' }}>
                  <DarkCard>
                    <AutoColumn gap="md" style={{ width: '100%' }}>
                      <AutoColumn gap="md">
                        <Label>
                          <Trans>Pool Constants</Trans>
                        </Label>
                        <LightCard padding="12px 16px">
                          <AutoColumn gap="md">
                            {decimals && decimals !== 0 && (
                              <RowBetween>
                                <RowFixed>
                                  <ThemedText.DeprecatedMain>
                                    <Trans>Decimals</Trans>
                                  </ThemedText.DeprecatedMain>
                                </RowFixed>
                                <RowFixed>
                                  <ThemedText.DeprecatedMain>
                                    <Trans i18nKey="smartPool.decimals" values={{ decimals }} />
                                  </ThemedText.DeprecatedMain>
                                </RowFixed>
                              </RowBetween>
                            )}
                          </AutoColumn>
                        </LightCard>
                      </AutoColumn>
                    </AutoColumn>
                  </DarkCard>
                </AutoColumn>
              </DarkCard>
            </AutoColumn>
          </ResponsiveRow>
          <AutoColumn>
            <DarkCard>
              <AddressCard address={poolAddressFromUrl} chainId={account.chainId} label="Smart Pool" />
            </DarkCard>
          </AutoColumn>
          <AutoColumn>
            <DarkCard>
              <AddressCard address={owner} chainId={account.chainId} label="Pool Operator" />
            </DarkCard>
          </AutoColumn>
          <AutoColumn gap="sm" style={{ width: '100%', height: '100%', justifyContent: 'center' }}>
            <ResponsiveRow>
              <RowFixed>
                <ResponsiveButtonPrimary
                  onClick={() => setShowStakeModal(true)}
                  width="fit-content"
                  padding="6px 8px"
                  $borderRadius="12px"
                  style={{ marginRight: '8px' }}
                >
                  <Trans>Stake</Trans>
                </ResponsiveButtonPrimary>
                <ResponsiveButtonPrimary
                  onClick={handleMoveStakeClick}
                  width="fit-content"
                  padding="6px 8px"
                  $borderRadius="12px"
                  style={{ marginRight: '8px' }}
                >
                  <Trans>Switch</Trans>
                </ResponsiveButtonPrimary>
                <ResponsiveButtonPrimary
                  onClick={handleDeactivateStakeClick}
                  width="fit-content"
                  padding="6px 8px"
                  $borderRadius="12px"
                  style={{ marginRight: '8px' }}
                >
                  <Trans>Disable</Trans>
                </ResponsiveButtonPrimary>
                {owner === account.address && hasFreeStake && (
                  <ResponsiveButtonPrimary
                    style={{ marginRight: '8px' }}
                    width="fit-content"
                    padding="6px 8px"
                    $borderRadius="12px"
                    onClick={() => setShowUnstakeModal(true)}
                  >
                    <Trans>Unstake</Trans>
                  </ResponsiveButtonPrimary>
                )}
              </RowFixed>
            </ResponsiveRow>
          </AutoColumn>
        </AutoColumn>
      </PageWrapper>
      <SwitchLocaleLink />
    </>
  )
}
