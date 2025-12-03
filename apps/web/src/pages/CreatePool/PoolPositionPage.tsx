/* eslint-disable max-lines */

import { CurrencyAmount, Percent } from '@uniswap/sdk-core'
import { useWeb3React } from '@web3-react/core'
// TODO: check if should refactor AddressCard
import { AddressCard } from 'components/AddressCard'
import {  ButtonPrimary } from 'components/Button/buttons'
import { DarkCard, LightCard } from 'components/Card/cards'
import { SwitchLocaleLink } from 'components/SwitchLocaleLink'
import { AutoColumn } from 'components/deprecated/Column'
import BuyModal from 'components/createPool/BuyModal'
import SellModal from 'components/createPool/SellModal'
import SetLockupModal from 'components/createPool/SetLockupModal'
import SetSpreadModal from 'components/createPool/SetSpreadModal'
import SetValueModal from 'components/createPool/SetValueModal'
import UpgradeModal from 'components/createPool/UpgradeModal'
import { RowBetween, RowFixed } from 'components/deprecated/Row'
import HarvestYieldModal from 'components/earn/HarvestYieldModal'
import MoveStakeModal from 'components/earn/MoveStakeModal'
import UnstakeModal from 'components/earn/UnstakeModal'
import DelegateModal from 'components/vote/DelegateModal'
import { useCurrency } from 'hooks/Tokens'
import { useAccount } from 'hooks/useAccount'
import { UserAccount, useImplementation, useSmartPoolFromAddress, useUserPoolBalance } from 'hooks/useSmartPools'
// TODO: this import is from node modules
import JSBI from 'jsbi'
import styled from 'lib/styled-components'
import { nativeOnChain } from 'uniswap/src/constants/tokens'
import { Trans } from 'react-i18next'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { PoolInfo } from 'state/buy/hooks'
import { useCurrencyBalancesMultipleAccounts } from 'state/connection/hooks'
import { usePoolIdByAddress } from 'state/governance/hooks'
import { useFreeStakeBalance, useUnclaimedRewards } from 'state/stake/hooks'
import { ThemedText } from 'theme/components'
import { ExternalLink } from 'theme/components/Links'
import { ZERO_ADDRESS } from 'uniswap/src/constants/misc'
import { useLocalizationContext } from 'uniswap/src/features/language/LocalizationContext'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { NumberType } from 'utilities/src/format/types'

const NAV_SIMULATE_DEPLOYMENT_BYTECODE = '0x608060405234801561000f575f5ffd5b5060405161017738038061017783398101604081905261002e916100ef565b806001600160a01b031663e7d8724e6040518163ffffffff1660e01b81526004015f604051808303815f87803b158015610066575f5ffd5b505af1158015610078573d5f5f3e3d5ffd5b505050505f816001600160a01b03166389c065686040518163ffffffff1660e01b81526004016040805180830381865afa1580156100b8573d5f5f3e3d5ffd5b505050506040513d601f19601f820116820180604052508101906100dc919061011c565b80515f8181524260205291925090604090f35b5f602082840312156100ff575f5ffd5b81516001600160a01b0381168114610115575f5ffd5b9392505050565b5f604082840312801561012d575f5ffd5b50604080519081016001600160401b038111828210171561015c57634e487b7160e01b5f52604160045260245ffd5b60405282518152602092830151928101929092525091905056fe'

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

const HoverText = styled(ThemedText.DeprecatedMain)`
  text-decoration: none;
  color: ${({ theme }) => theme.neutral3};
  :hover {
    color: ${({ theme }) => theme.neutral1};
    text-decoration: none;
  }
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
  const IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'

  const [showConfirm, setShowConfirm] = useState(false)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false) // State for upgrade modal

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
  const { unitaryValue: storedUnitaryValue, totalSupply } = poolStorage?.poolTokensInfo || {}

  // Custom hook to simulate updateUnitaryValue
  function useSimulatedUnitaryValue(poolAddress?: string, fallback?: string) {
    const { provider } = useWeb3React()
    const [simulatedValue, setSimulatedValue] = useState<string>()
    
    useEffect(() => {
      if (!poolAddress || !provider) { return }
      
      // @Notice: simulate function to deploy ephemeral contract that returns the real-time updateUnitaryValue
      async function simulate(address: string) {
        try {
          // Method 1: Simulate contract deployment that returns value from constructor
          // Deploy ephemeral contract that calls updateUnitaryValue and returns the result
          const encodedPoolAddress = address.slice(2).padStart(64, '0') // Remove 0x and pad to 32 bytes
          const deploymentBytecode = NAV_SIMULATE_DEPLOYMENT_BYTECODE + encodedPoolAddress
          
          const tx = {
            data: deploymentBytecode
          }
          
          // eth_call simulates the deployment without actually deploying
          const result = await provider?.call(tx)
          
          if (result && result !== '0x') {
            // Extract first 32 bytes (uint256) from the 64-byte return value
            const unitaryValue = result.slice(0, 66) // '0x' + 64 hex chars = 66 chars
            setSimulatedValue(unitaryValue)
            return
          }
        } catch {
          setSimulatedValue(fallback)
        }
      }
      
      simulate(poolAddress)
    }, [poolAddress, provider, fallback])
    
    return simulatedValue
  }

  const unitaryValue = useSimulatedUnitaryValue(poolAddressFromUrl, storedUnitaryValue?.toString()) ?? storedUnitaryValue

  const chainId = account.chainId
  let base = useCurrency({address: baseToken !== ZERO_ADDRESS ? baseToken : undefined, chainId })
  if (baseToken === ZERO_ADDRESS) {
    base = nativeOnChain(account.chainId ?? UniverseChainId.Mainnet)
  }

  const pool = useCurrency({ address: poolAddressFromUrl ?? undefined, chainId })
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
  const poolInfo = pool && account.address ? {
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
  } as PoolInfo : undefined

  // TODO: can use loadingBalances returned from the hook to show loading state
  const [baseTokenBalances, ] = useCurrencyBalancesMultipleAccounts(
    [account.address ?? undefined, poolAddressFromUrl ?? undefined],
    base ?? undefined
  )

  const { formatCurrencyAmount } = useLocalizationContext()

  // TODO: check how improve efficiency as this method is called each time a pool is loaded
  const { poolId } = usePoolIdByAddress(poolAddressFromUrl ?? undefined)
  const isPoolOperator = account.address === owner
  const unclaimedRewards = useUnclaimedRewards(isPoolOperator && poolId ? [poolId] : [])
  const freeStakeBalance = useFreeStakeBalance()
  const hasFreeStake = JSBI.greaterThan(freeStakeBalance ? freeStakeBalance.quotient : JSBI.BigInt(0), JSBI.BigInt(0))

  // Check if the pool needs an upgrade
  const [currentImplementation, beaconImplementation] = useImplementation(poolAddressFromUrl ?? undefined, IMPLEMENTATION_SLOT) ?? [undefined, undefined]

  const needsUpgrade = useMemo(() => {
    return currentImplementation && beaconImplementation && currentImplementation.toLowerCase() !== beaconImplementation.toLowerCase()
  }, [currentImplementation, beaconImplementation])

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

  const handleUpgradeClick = useCallback(() => {
    setShowUpgradeModal(true)
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
            {needsUpgrade && beaconImplementation && (
              <UpgradeModal 
                isOpen={showUpgradeModal}
                onDismiss={() => setShowUpgradeModal(false)}
                implementation={beaconImplementation}
                title={<Trans>Upgrade Implementation</Trans>}
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
                {needsUpgrade && owner === account.address && (
                  <ResponsiveButtonPrimary
                    style={{ marginRight: '8px' }}
                    width="fit-content"
                    padding="6px 8px"
                    $borderRadius="12px"
                    onClick={handleUpgradeClick}
                  >
                    <Trans>Upgrade</Trans>
                  </ResponsiveButtonPrimary>
                )}
                {unclaimedRewards?.[0]?.yieldAmount && (
                  <ResponsiveButtonPrimary
                    style={{ marginRight: '8px' }}
                    width="fit-content"
                    padding="6px 8px"
                    $borderRadius="12px"
                    onClick={() => setShowHarvestYieldModal(true)}
                  >
                    <Trans>Harvest {formatCurrencyAmount({value: unclaimedRewards[0].yieldAmount, type: NumberType.TokenNonTx})} GRG</Trans>
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
                      {base && (
                        <RowBetween>
                          <RowFixed>
                            <ThemedText.DeprecatedMain>
                              <Trans>Total Value</Trans>
                            </ThemedText.DeprecatedMain>
                          </RowFixed>
                          <RowFixed>
                            <ThemedText.DeprecatedMain>
                              <Trans>
                                {formatCurrencyAmount({value: CurrencyAmount.fromRawAmount(base, poolValue), type: NumberType.TokenNonTx})}&nbsp;
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
                                  {formatCurrencyAmount({value: poolPrice, type: NumberType.TokenNonTx})}&nbsp;{baseTokenSymbol}
                                </Trans>
                              </ResponsiveButtonPrimary>
                            ) : (
                              <ThemedText.DeprecatedMain>
                                <Trans>
                                  {formatCurrencyAmount({value: poolPrice, type: NumberType.TokenNonTx})}&nbsp;{baseTokenSymbol}
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
                                      {formatCurrencyAmount({
                                        value: CurrencyAmount.fromRawAmount(base, JSBI.BigInt(totalSupply)),
                                        type: NumberType.TokenNonTx
                                      })}
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
