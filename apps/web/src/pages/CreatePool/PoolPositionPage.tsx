/* eslint-disable max-lines */

import { CurrencyAmount, Percent } from '@uniswap/sdk-core'
import { useWeb3React } from '@web3-react/core'
// TODO: check if should refactor AddressCard
import { AddressCard } from '~/components/AddressCard'
import BuyModal from '~/components/createPool/BuyModal'
import SellModal from '~/components/createPool/SellModal'
import SetLockupModal from '~/components/createPool/SetLockupModal'
import SetSpreadModal from '~/components/createPool/SetSpreadModal'
import SetValueModal from '~/components/createPool/SetValueModal'
import UpgradeModal from '~/components/createPool/UpgradeModal'
import HarvestYieldModal from '~/components/earn/HarvestYieldModal'
import MoveStakeModal from '~/components/earn/MoveStakeModal'
import UnstakeModal from '~/components/earn/UnstakeModal'
import { SwitchLocaleLink } from '~/components/SwitchLocaleLink'
import DelegateModal from '~/components/vote/DelegateModal'
import { useCurrency } from '~/hooks/Tokens'
import { useAccount } from '~/hooks/useAccount'
import useSelectChain from '~/hooks/useSelectChain'
import { UserAccount, useImplementation, useSmartPoolFromAddress, useUserPoolBalance } from '~/hooks/useSmartPools'
// TODO: this import is from node modules
import JSBI from 'jsbi'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Trans } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { PoolInfo } from '~/state/buy/hooks'
import { useCurrencyBalancesMultipleAccounts } from '~/state/connection/hooks'
import { usePoolIdByAddress } from '~/state/governance/hooks'
import { useFreeStakeBalance, useUnclaimedRewards } from '~/state/stake/hooks'
import { ZERO_ADDRESS } from 'uniswap/src/constants/misc'
import { nativeOnChain } from 'uniswap/src/constants/tokens'
import { NetworkLogo } from 'uniswap/src/components/CurrencyLogo/NetworkLogo'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { useLocalizationContext } from 'uniswap/src/features/language/LocalizationContext'
import { NumberType } from 'utilities/src/format/types'
import { Button, Flex, styled, Text } from 'ui/src'

const NAV_SIMULATE_DEPLOYMENT_BYTECODE =
  '0x608060405234801561000f575f5ffd5b5060405161017738038061017783398101604081905261002e916100ef565b806001600160a01b031663e7d8724e6040518163ffffffff1660e01b81526004015f604051808303815f87803b158015610066575f5ffd5b505af1158015610078573d5f5f3e3d5ffd5b505050505f816001600160a01b03166389c065686040518163ffffffff1660e01b81526004016040805180830381865afa1580156100b8573d5f5f3e3d5ffd5b505050506040513d601f19601f820116820180604052508101906100dc919061011c565b80515f8181524260205291925090604090f35b5f602082840312156100ff575f5ffd5b81516001600160a01b0381168114610115575f5ffd5b9392505050565b5f604082840312801561012d575f5ffd5b50604080519081016001600160401b038111828210171561015c57634e487b7160e01b5f52604160045260245ffd5b60405282518152602092830151928101929092525091905056fe'

const PageWrapper = styled(Flex, {
  width: '100%',
  maxWidth: 960,
  mx: 'auto',
  paddingTop: 68,
  paddingBottom: '$spacing24',
  paddingHorizontal: '$spacing12',

  $md: {
    paddingTop: 48,
  },

  $sm: {
    paddingTop: '$spacing20',
  },
})

const DataCard = styled(Flex, {
  backgroundColor: '$surface2',
  borderRadius: '$rounded20',
  padding: '$spacing16',
  gap: '$spacing16',
  width: '100%',
})

const DataRow = styled(Flex, {
  row: true,
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '$spacing12',
  width: '100%',
})

const BackLink = styled(Text, {
  color: '$neutral2',
  hoverStyle: {
    color: '$neutral1',
  },
})

export default function PoolPositionPage() {
  const {
    chainId: chainIdFromUrl,
    poolAddress: poolAddressFromUrl,
    returnPage: originFromUrl,
    poolStake: poolStakeFromUrl,
    apr: aprFromUrl,
    poolOwnStake: poolOwnStakeFromUrl,
    irr: irrFromUrl,
  } = useParams<{
    chainId: string
    poolAddress: string
    returnPage: string
    poolStake: string
    apr: string
    poolOwnStake: string
    irr: string
  }>()
  const account = useAccount()
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

  // Use chainId from URL if available, otherwise fall back to account.chainId
  const chainId = useMemo(
    () => (chainIdFromUrl ? parseInt(chainIdFromUrl, 10) : account.chainId),
    [chainIdFromUrl, account.chainId],
  )

  // TODO: check how can reduce number of calls by limit update of poolStorage
  //  id is stored in registry so we could save rpc call by using storing in state?
  const poolStorage = useSmartPoolFromAddress(poolAddressFromUrl, chainId)
  // TODO: user account also stores activation
  const userAccount: UserAccount | undefined = useUserPoolBalance(poolAddressFromUrl, account.address, chainId)

  const { name, symbol, decimals, owner, baseToken } = poolStorage?.poolInitParams || {}
  const { minPeriod, spread, transactionFee } = poolStorage?.poolVariables || {}
  const { unitaryValue: storedUnitaryValue, totalSupply } = poolStorage?.poolTokensInfo || {}

  // Custom hook to simulate updateUnitaryValue
  function useSimulatedUnitaryValue(poolAddress?: string, fallbackValue?: string) {
    const { provider } = useWeb3React()
    const [simulatedValue, setSimulatedValue] = useState<string>()

    useEffect(() => {
      if (!poolAddress || !provider) {
        return
      }

      // @Notice: simulate function to deploy ephemeral contract that returns the real-time updateUnitaryValue
      async function simulate(address: string) {
        try {
          // Method 1: Simulate contract deployment that returns value from constructor
          // Deploy ephemeral contract that calls updateUnitaryValue and returns the result
          const encodedPoolAddress = address.slice(2).padStart(64, '0') // Remove 0x and pad to 32 bytes
          const deploymentBytecode = NAV_SIMULATE_DEPLOYMENT_BYTECODE + encodedPoolAddress

          const tx = {
            data: deploymentBytecode,
          }

          // eth_call simulates the deployment without actually deploying
          const result = await provider?.call(tx)

          if (result && result !== '0x' && result.length <= 150) {
            // Extract first 32 bytes (uint256) from the 64-byte return value
            const unitaryValueHex = result.slice(0, 66) // '0x' + 64 hex chars = 66 chars
            // Convert hex to decimal string for JSBI compatibility
            const unitaryValue = BigInt(unitaryValueHex).toString()

            // Sanity check: if the simulated value is unreasonably large (> 10^30) or zero when we have a fallback,
            // the NAV calculation likely failed (e.g., missing price feed, token not in active array).
            // In this case, fall back to the stored value which is more reliable.
            const MAX_REASONABLE_VALUE = BigInt('1000000000000000000000000000000') // 10^30 (1 trillion with 18 decimals)
            const parsedValue = BigInt(unitaryValue)

            if (parsedValue > MAX_REASONABLE_VALUE) {
              // Value is unreasonably large - NAV simulation likely returned garbage
              setSimulatedValue(fallbackValue)
              return
            }

            // If simulated value is 0 but we have a non-zero fallback, prefer fallback
            // (NAV simulation may have failed silently)
            if (parsedValue === BigInt(0) && fallbackValue && BigInt(fallbackValue) > BigInt(0)) {
              setSimulatedValue(fallbackValue)
              return
            }

            setSimulatedValue(unitaryValue)
            return
          } else {
            setSimulatedValue(fallbackValue)
            return
          }
        } catch {
          setSimulatedValue(fallbackValue)
        }
      }

      simulate(poolAddress)
    }, [poolAddress, provider, fallbackValue])

    return simulatedValue
  }

  // Default unitary value is 1e18 (1 with 18 decimals) for uninitialized pools
  const DEFAULT_UNITARY_VALUE = '1000000000000000000'
  const simulatedOrStoredValue =
    useSimulatedUnitaryValue(poolAddressFromUrl, storedUnitaryValue?.toString()) ?? storedUnitaryValue
  // Use default value of 1e18 when the pool is uninitialized (null/undefined/zero unitary value).
  // A simulated value of '0' can be returned for uninitialized/upgraded pools whose storage slot
  // has been cleared, so we fall back to the default NAV in that case.
  const unitaryValue =
    simulatedOrStoredValue && simulatedOrStoredValue !== '0' ? simulatedOrStoredValue : DEFAULT_UNITARY_VALUE

  let base = useCurrency({ address: baseToken !== ZERO_ADDRESS ? baseToken : undefined, chainId })
  if (baseToken === ZERO_ADDRESS) {
    base = nativeOnChain(chainId ?? UniverseChainId.Mainnet)
  }

  const pool = useCurrency({ address: poolAddressFromUrl ?? undefined, chainId })
  const amount = JSBI.BigInt(String(unitaryValue))
  const poolPrice = pool ? CurrencyAmount.fromRawAmount(pool, amount) : undefined
  const userPoolBalance = useMemo(() => {
    if (!pool || userAccount?.userBalance === undefined) {
      return undefined
    }
    return CurrencyAmount.fromRawAmount(pool, JSBI.BigInt(String(userAccount.userBalance)))
  }, [pool, userAccount?.userBalance])
  const hasBalance = useMemo(() => {
    if (!userAccount?.userBalance) {
      return false
    }
    const balanceJSBI = JSBI.BigInt(String(userAccount.userBalance))
    return JSBI.greaterThan(balanceJSBI, JSBI.BigInt(0))
  }, [userAccount])
  const baseTokenSymbol = base?.symbol ?? ''

  const poolValue = useMemo(() => {
    try {
      const unitaryBigInt = JSBI.BigInt(String(unitaryValue))
      const supplyBigInt = JSBI.BigInt(String(totalSupply ?? 0))
      const decimalsBigInt = JSBI.BigInt(String(decimals ?? 18))
      const divisor = JSBI.exponentiate(JSBI.BigInt(10), decimalsBigInt)
      return JSBI.divide(JSBI.multiply(unitaryBigInt, supplyBigInt), divisor)
    } catch {
      return undefined
    }
  }, [unitaryValue, totalSupply, decimals])

  // Create CurrencyAmount safely - handles edge cases where base.decimals might be invalid
  const poolValueAmount = useMemo(() => {
    if (!base || !poolValue || typeof base.decimals !== 'number') {
      return undefined
    }
    try {
      return CurrencyAmount.fromRawAmount(base, poolValue)
    } catch {
      return undefined
    }
  }, [base, poolValue])

  const lockup = (Number(String(minPeriod)) / 86400).toLocaleString()

  // TODO: check if should move definitions in custom hook
  //const poolInfo= usePoolInfo(poolAddressFromUrl)
  // TODO: pass recipient as optional parameter to check currency balance hook
  const poolInfo =
    pool && account.address
      ? ({
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
          chainId,
        } as PoolInfo)
      : undefined

  // TODO: can use loadingBalances returned from the hook to show loading state
  const [baseTokenBalances] = useCurrencyBalancesMultipleAccounts(
    [account.address ?? undefined, poolAddressFromUrl ?? undefined],
    base ?? undefined,
  )

  const { formatCurrencyAmount } = useLocalizationContext()

  // TODO: check how improve efficiency as this method is called each time a pool is loaded
  const { poolId } = usePoolIdByAddress(poolAddressFromUrl ?? undefined)
  const isPoolOperator = account.address === owner
  const unclaimedRewards = useUnclaimedRewards(isPoolOperator && poolId ? [poolId] : [])
  const freeStakeBalance = useFreeStakeBalance()
  const hasFreeStake = JSBI.greaterThan(freeStakeBalance ? freeStakeBalance.quotient : JSBI.BigInt(0), JSBI.BigInt(0))

  // Check if the pool needs an upgrade
  const { implementations, isLoading: isLoadingImplementations } = useImplementation(
    poolAddressFromUrl ?? undefined,
    IMPLEMENTATION_SLOT,
    chainId,
  )
  const [currentImplementation, beaconImplementation] = implementations ?? [undefined, undefined]

  const needsUpgrade = useMemo(() => {
    const needs =
      currentImplementation &&
      beaconImplementation &&
      currentImplementation.toLowerCase() !== beaconImplementation.toLowerCase()

    return needs
  }, [
    currentImplementation,
    beaconImplementation,
    poolAddressFromUrl,
    chainId,
    chainIdFromUrl,
    isLoadingImplementations,
    owner,
    account.address,
  ])

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

  // Automatically switch to the pool's chain when viewing it
  const selectChain = useSelectChain()
  useEffect(() => {
    if (chainId && account.chainId && account.chainId !== chainId && account.isConnected) {
      // Auto-switch to the correct chain
      selectChain(chainId)
    }
  }, [chainId, account.chainId, account.isConnected, selectChain])

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

        <Flex gap="$spacing24" width="100%">
          <Flex gap="$spacing16" width="100%">
            <Flex
              row
              justifyContent="space-between"
              alignItems="center"
              $sm={{ flexDirection: 'column', alignItems: 'flex-start', gap: '$spacing12' }}
            >
              {originFromUrl && (
                <Link
                  data-cy="visit-pool"
                  style={{ textDecoration: 'none' }}
                  to={originFromUrl === 'manage' ? '/earn/manage' : '/earn'}
                >
                  <BackLink variant="body3">
                    <Trans>← Back to Smart Pools</Trans>
                  </BackLink>
                </Link>
              )}
              <Flex row gap="$spacing8" flexWrap="wrap" justifyContent="flex-end">
                {needsUpgrade && owner === account.address && (
                  <Button size="small" variant="branded" onPress={handleUpgradeClick}>
                    <Trans>Upgrade</Trans>
                  </Button>
                )}
                {unclaimedRewards?.[0]?.yieldAmount && (
                  <Button size="small" variant="branded" onPress={() => setShowHarvestYieldModal(true)}>
                    <Trans>
                      Harvest{' '}
                      {formatCurrencyAmount({ value: unclaimedRewards[0].yieldAmount, type: NumberType.TokenNonTx })}{' '}
                      GRG
                    </Trans>
                  </Button>
                )}
              </Flex>
            </Flex>

            <Flex
              row
              justifyContent="space-between"
              alignItems="center"
              $sm={{ flexDirection: 'column', alignItems: 'flex-start', gap: '$spacing12' }}
            >
              <Flex row gap="$spacing12" alignItems="center">
                <Text variant="heading3">
                  {name}&nbsp;|&nbsp;{symbol}
                </Text>
                <NetworkLogo chainId={chainId as UniverseChainId} size={24} />
              </Flex>
              <Flex row gap="$spacing8" alignItems="center" flexWrap="wrap">
                {poolAddressFromUrl && (
                  <Link to={`/portfolio/${poolAddressFromUrl}`} style={{ textDecoration: 'none' }}>
                    <Text variant="body3" color="$accent1">
                      <Trans>Smart Pool Portfolio →</Trans>
                    </Text>
                  </Link>
                )}
                <Button size="small" variant="branded" onPress={() => setShowBuyModal(true)}>
                  <Trans>Buy</Trans>
                </Button>
                {hasBalance && (
                  <Button size="small" variant="branded" onPress={() => setShowSellModal(true)}>
                    <Trans>Sell</Trans>
                  </Button>
                )}
              </Flex>
            </Flex>
          </Flex>

          <Flex row gap="$spacing16" width="100%" $lg={{ flexDirection: 'column' }}>
            <Flex flex={1} gap="$spacing16" width="100%">
              <DataCard>
                <Text variant="subheading2">
                  <Trans>Pool Values</Trans>
                </Text>
                <Flex gap="$spacing12" width="100%">
                  {poolValueAmount && (
                    <DataRow>
                      <Text variant="body3" color="$neutral2">
                        <Trans>Total Value</Trans>
                      </Text>
                      <Text variant="body3" color="$neutral1">
                        <Trans>
                          {formatCurrencyAmount({ value: poolValueAmount })}&nbsp;{baseTokenSymbol}
                        </Trans>
                      </Text>
                    </DataRow>
                  )}
                  {baseTokenSymbol && (
                    <DataRow>
                      <Text variant="body3" color="$neutral2">
                        <Trans>Unitary Value</Trans>
                      </Text>
                      <Flex row alignItems="center" gap="$spacing8">
                        {owner === account.address && poolValueAmount ? (
                          <Button
                            size="xxsmall"
                            variant="branded"
                            emphasis="secondary"
                            onPress={() => setShowSetValueModal(true)}
                          >
                            <Trans>
                              {formatCurrencyAmount({ value: poolPrice, type: NumberType.TokenNonTx })}&nbsp;
                              {baseTokenSymbol}
                            </Trans>
                          </Button>
                        ) : (
                          <Text variant="body3" color="$neutral1">
                            <Trans>
                              {formatCurrencyAmount({ value: poolPrice, type: NumberType.TokenNonTx })}&nbsp;
                              {baseTokenSymbol}
                            </Trans>
                          </Text>
                        )}
                      </Flex>
                    </DataRow>
                  )}
                </Flex>
              </DataCard>

              <DataCard>
                <Text variant="subheading2">
                  <Trans>Issuance Data</Trans>
                </Text>
                <Flex gap="$spacing12" width="100%">
                  {totalSupply && base && (
                    <DataRow>
                      <Text variant="body3" color="$neutral2">
                        <Trans>Total Supply</Trans>
                      </Text>
                      <Text variant="body3" color="$neutral1">
                        <Trans>
                          {formatCurrencyAmount({
                            value: CurrencyAmount.fromRawAmount(base, JSBI.BigInt(String(totalSupply))),
                            type: NumberType.TokenNonTx,
                          })}
                        </Trans>
                        &nbsp;{symbol}
                      </Text>
                    </DataRow>
                  )}
                </Flex>
              </DataCard>
            </Flex>

            <Flex flex={1} gap="$spacing16" width="100%">
              <DataCard>
                <Text variant="subheading2">
                  <Trans>Cost Factors</Trans>
                </Text>
                <Flex gap="$spacing12" width="100%">
                  {spread && (
                    <DataRow>
                      <Text variant="body3" color="$neutral2">
                        <Trans>Spread</Trans>
                      </Text>
                      <Flex row alignItems="center" gap="$spacing8">
                        {owner === account.address ? (
                          <Button
                            size="xxsmall"
                            variant="branded"
                            emphasis="secondary"
                            onPress={() => setShowSetSpreadModal(true)}
                          >
                            <Trans>{new Percent(String(spread), 10_000).toSignificant()}%</Trans>
                          </Button>
                        ) : (
                          <Text variant="body3" color="$neutral1">
                            <Trans>{new Percent(String(spread), 10_000).toSignificant()}%</Trans>
                          </Text>
                        )}
                      </Flex>
                    </DataRow>
                  )}
                  {transactionFee && transactionFee !== 0 ? (
                    <DataRow>
                      <Text variant="body3" color="$neutral2">
                        <Trans>Distribution Fee</Trans>
                      </Text>
                      <Text variant="body3" color="$neutral1">
                        <Trans>{new Percent(String(transactionFee), 10_000).toSignificant()}%</Trans>
                      </Text>
                    </DataRow>
                  ) : null}
                  {lockup && (
                    <DataRow>
                      <Text variant="body3" color="$neutral2">
                        <Trans>Lockup</Trans>
                      </Text>
                      <Flex row alignItems="center" gap="$spacing8">
                        {owner === account.address ? (
                          <Button
                            size="xxsmall"
                            variant="branded"
                            emphasis="secondary"
                            onPress={() => setShowSetLockupModal(true)}
                          >
                            <Trans>{lockup} days</Trans>
                          </Button>
                        ) : (
                          <Text variant="body3" color="$neutral1">
                            <Trans>{lockup} days</Trans>
                          </Text>
                        )}
                      </Flex>
                    </DataRow>
                  )}
                </Flex>
              </DataCard>

              <DataCard>
                <Text variant="subheading2">
                  <Trans>Pool Constants</Trans>
                </Text>
                <Flex gap="$spacing12" width="100%">
                  {decimals && decimals !== 0 && (
                    <DataRow>
                      <Text variant="body3" color="$neutral2">
                        <Trans>Decimals</Trans>
                      </Text>
                      <Text variant="body3" color="$neutral1">
                        <Trans i18nKey="smartPool.decimals" values={{ decimals }} />
                      </Text>
                    </DataRow>
                  )}
                </Flex>
              </DataCard>
            </Flex>
          </Flex>

          <Flex row gap="$spacing16" width="100%" $lg={{ flexDirection: 'column' }}>
            <Flex flex={1} width="100%">
              <AddressCard address={poolAddressFromUrl} chainId={chainId} label="Smart Pool" />
            </Flex>
            <Flex flex={1} width="100%">
              <AddressCard address={owner} chainId={chainId} label="Pool Operator" />
            </Flex>
          </Flex>

          <Flex row gap="$spacing8" flexWrap="wrap" width="100%">
            <Button size="small" variant="branded" onPress={() => setShowStakeModal(true)}>
              <Trans>Stake</Trans>
            </Button>
            <Button size="small" variant="branded" onPress={handleMoveStakeClick}>
              <Trans>Switch</Trans>
            </Button>
            <Button size="small" variant="branded" onPress={handleDeactivateStakeClick}>
              <Trans>Disable</Trans>
            </Button>
            {owner === account.address && hasFreeStake && (
              <Button size="small" variant="branded" onPress={() => setShowUnstakeModal(true)}>
                <Trans>Unstake</Trans>
              </Button>
            )}
          </Flex>
        </Flex>
      </PageWrapper>
      <SwitchLocaleLink />
    </>
  )
}
