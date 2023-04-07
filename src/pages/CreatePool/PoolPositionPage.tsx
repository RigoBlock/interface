//import { BigNumber } from '@ethersproject/bignumber'
//import type { TransactionResponse } from '@ethersproject/providers'
import { Trans } from '@lingui/macro'
//import { Trace } from '@uniswap/analytics'
//import { PageName } from '@uniswap/analytics-events'
import { /*Currency,*/ CurrencyAmount /*, Fraction*/, Percent /*, Price, Token*/ } from '@uniswap/sdk-core'
//import { NonfungiblePositionManager, Pool, Position } from '@uniswap/v3-sdk'
import { useWeb3React } from '@web3-react/core'
//import { sendEvent } from 'components/analytics'
//import Badge from 'components/Badge'
import { /*ButtonConfirmed, ButtonGray,*/ ButtonPrimary } from 'components/Button'
import { DarkCard, LightCard } from 'components/Card'
import { AutoColumn } from 'components/Column'
import BuyModal from 'components/createPool/BuyModal'
import SellModal from 'components/createPool/SellModal'
import SetLockupModal from 'components/createPool/SetLockupModal'
import SetSpreadModal from 'components/createPool/SetSpreadModal'
import SetValueModal from 'components/createPool/SetValueModal'
//import Loader from 'components/Loader'
import { RowBetween, RowFixed } from 'components/Row'
//import { Dots } from 'components/swap/styleds'
import { SwitchLocaleLink } from 'components/SwitchLocaleLink'
//import Toggle from 'components/Toggle'
import TransactionConfirmationModal, { ConfirmationModalContent } from 'components/TransactionConfirmationModal'
import IconButton, { IconHoverText } from 'components/WalletDropdown/IconButton'
import { /*BIG_INT_ZERO,*/ ZERO_ADDRESS } from 'constants/misc'
import { nativeOnChain } from 'constants/tokens'
import { useCurrency } from 'hooks/Tokens'
import useCopyClipboard from 'hooks/useCopyClipboard'
import { useSmartPoolFromAddress, useUserPoolBalance } from 'hooks/useSmartPools'
// TODO: this import is from node modules
import JSBI from 'jsbi'
//import { PoolState, usePool } from 'hooks/usePools'
//import useStablecoinPrice from 'hooks/useStablecoinPrice'
//import { useSingleCallResult } from 'lib/hooks/multicall'
//import useNativeCurrency from 'lib/hooks/useNativeCurrency'
import { useCallback, useMemo, /*useRef,*/ useState } from 'react'
import { Copy } from 'react-feather'
import { Link, useParams } from 'react-router-dom'
//import { Bound } from 'state/mint/v3/actions'
import { useToggleWalletModal } from 'state/application/hooks'
import { PoolInfo } from 'state/buy/hooks'
//import { useTokenBalance } from 'state/connection/hooks'
import { useCurrencyBalance } from 'state/connection/hooks'
//import { useIsTransactionPending, useTransactionAdder } from 'state/transactions/hooks'
import styled /*, { useTheme }*/ from 'styled-components/macro'
import { ExternalLink, /*HideExtraSmall,*/ ThemedText } from 'theme'
import { shortenAddress } from 'utils'
//import { currencyId } from 'utils/currencyId'
import { formatCurrencyAmount } from 'utils/formatCurrencyAmount'
//import { formatTickPrice } from 'utils/formatTickPrice'
import { ExplorerDataType, getExplorerLink } from 'utils/getExplorerLink'
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

/*
const BadgeText = styled.div`
  font-weight: 500;
  font-size: 14px;
`
*/

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
  color: ${({ theme }) => theme.deprecated_text2};
  font-size: 14px;
  text-align: center;
  margin-right: 4px;
  font-weight: 500;
`

const HoverText = styled(ThemedText.DeprecatedMain)`
  text-decoration: none;
  color: ${({ theme }) => theme.deprecated_text3};
  :hover {
    color: ${({ theme }) => theme.deprecated_text1};
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

/*
const DoubleArrow = styled.span`
  color: ${({ theme }) => theme.deprecated_text3};
  margin: 0 1rem;
`
*/

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
  const [isCopied, setCopied] = useCopyClipboard()
  const copy = useCallback(() => {
    setCopied(address || '')
  }, [address, setCopied])

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
              <ExternalLink href={getExplorerLink(chainId, address, ExplorerDataType.ADDRESS)}>
                <Trans>{shortenAddress(address)}</Trans>
              </ExternalLink>
              <IconButton onClick={copy} Icon={Copy}>
                {isCopied ? <Trans>Copied!</Trans> : <Trans>Copy</Trans>}
              </IconButton>
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

export function PoolPositionPage() {
  const { poolAddress: poolAddressFromUrl, returnPage: originFromUrl } = useParams<{
    poolAddress: string
    returnPage: string
  }>()
  const { chainId, account } = useWeb3React()
  //const theme = useTheme()

  const [showConfirm, setShowConfirm] = useState(false)

  const [showBuyModal, setShowBuyModal] = useState(false)
  const [showSellModal, setShowSellModal] = useState(false)
  const [showSetLockupModal, setShowSetLockupModal] = useState(false)
  const [showSetSpreadModal, setShowSetSpreadModal] = useState(false)
  const [showSetValueModal, setShowSetValueModal] = useState(false)

  // TODO: check how can reduce number of calls by limit update of poolStorage
  //  id is stored in registry so we could save rpc call by using storing in state?
  const poolStorage = useSmartPoolFromAddress(poolAddressFromUrl ?? undefined)
  // TODO: user account also stores activation
  const userAccount = useUserPoolBalance(poolAddressFromUrl, account)

  const { name, symbol, decimals, owner, baseToken } = poolStorage?.poolInitParams || {}
  const { minPeriod, spread, transactionFee } = poolStorage?.poolVariables || {}
  const { unitaryValue, totalSupply } = poolStorage?.poolTokensInfo || {}

  let base = useCurrency(baseToken !== ZERO_ADDRESS ? baseToken : undefined)
  if (baseToken === ZERO_ADDRESS) {
    base = nativeOnChain(chainId ?? 1)
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

  const lockup = JSBI.BigInt(minPeriod ?? 0).toLocaleString()

  // TODO: check if should move definitions in custom hook
  //const poolInfo= usePoolInfo(poolAddressFromUrl)
  // TODO: pass recipient as optional parameter to check currency balance hook
  const poolInfo = { pool, recipient: account, userPoolBalance, poolPriceAmount: poolPrice, spread } as PoolInfo
  const userBaseTokenBalance = useCurrencyBalance(account ?? undefined, base ?? undefined)
  const toggleWalletModal = useToggleWalletModal()

  const handleDepositClick = useCallback(() => {
    if (account) {
      setShowBuyModal(true)
    } else {
      toggleWalletModal()
    }
  }, [account, toggleWalletModal])

  const handleWithdrawClick = useCallback(() => {
    if (account) {
      setShowSellModal(true)
    } else {
      toggleWalletModal()
    }
  }, [account, toggleWalletModal])

  const handleSetLockupClick = useCallback(() => {
    if (account) {
      setShowSetLockupModal(true)
    } else {
      toggleWalletModal()
    }
  }, [account, toggleWalletModal])

  const handleSetSpreadClick = useCallback(() => {
    if (account) {
      setShowSetSpreadModal(true)
    } else {
      toggleWalletModal()
    }
  }, [account, toggleWalletModal])

  const handleSetValueClick = useCallback(() => {
    if (account) {
      setShowSetValueModal(true)
    } else {
      toggleWalletModal()
    }
  }, [account, toggleWalletModal])

  function modalHeader() {
    return (
      <AutoColumn gap="md" style={{ marginTop: '20px' }}>
        <ThemedText.DeprecatedItalic>
          <Trans>Let&apos;s check where this component goes.</Trans>
        </ThemedText.DeprecatedItalic>
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
          content={() => (
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
            <BuyModal
              isOpen={showBuyModal}
              onDismiss={() => setShowBuyModal(false)}
              poolInfo={poolInfo}
              userBaseTokenBalance={userBaseTokenBalance}
            />
            <SellModal
              isOpen={showSellModal}
              onDismiss={() => setShowSellModal(false)}
              poolInfo={poolInfo}
              userBaseTokenBalance={userBaseTokenBalance}
            />
            <SetLockupModal
              isOpen={showSetLockupModal}
              onDismiss={() => setShowSetLockupModal(false)}
              title={<Trans>Set Lockup</Trans>}
            />
            <SetSpreadModal
              isOpen={showSetSpreadModal}
              onDismiss={() => setShowSetSpreadModal(false)}
              title={<Trans>Set Spread</Trans>}
            />
            <SetValueModal
              isOpen={showSetValueModal}
              onDismiss={() => setShowSetValueModal(false)}
              poolInfo={poolInfo}
              title={<Trans>Set Value</Trans>}
            />
          </>
        )}
        <AutoColumn gap="md">
          <AutoColumn gap="sm">
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
                  onClick={handleDepositClick}
                  width="fit-content"
                  padding="6px 8px"
                  $borderRadius="12px"
                  style={{ marginRight: '8px' }}
                >
                  <Trans>Buy</Trans>
                </ResponsiveButtonPrimary>
                {hasBalance && (
                  <ResponsiveButtonPrimary
                    onClick={handleWithdrawClick}
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
                            {owner === account && JSBI.greaterThan(poolValue, JSBI.BigInt(0)) ? (
                              <ResponsiveButtonPrimary
                                onClick={handleSetValueClick}
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
                              {owner === account ? (
                                <ResponsiveButtonPrimary
                                  onClick={handleSetSpreadClick}
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
                              {owner === account ? (
                                <ResponsiveButtonPrimary
                                  onClick={handleSetLockupClick}
                                  height="1.1em"
                                  width="fit-content"
                                  fontSize={4}
                                  padding="6px 8px"
                                  $borderRadius="12px"
                                >
                                  <Trans>{lockup} seconds</Trans>
                                </ResponsiveButtonPrimary>
                              ) : (
                                <ThemedText.DeprecatedMain>
                                  <Trans>{lockup} seconds</Trans>
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
                                    <Trans>{decimals}</Trans>
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
              <AddressCard address={poolAddressFromUrl} chainId={chainId} label="Smart Pool" />
            </DarkCard>
          </AutoColumn>
          <AutoColumn>
            <DarkCard>
              <AddressCard address={owner} chainId={chainId} label="Pool Operator" />
            </DarkCard>
          </AutoColumn>
        </AutoColumn>
      </PageWrapper>
      <SwitchLocaleLink />
    </>
  )
}
