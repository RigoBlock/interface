/* eslint-disable max-lines */

import { CurrencyAmount, Percent } from '@uniswap/sdk-core'
import { useWeb3React } from '@web3-react/core'
// TODO: this import is from node modules
import JSBI from 'jsbi'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Trans } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'
import { Button, Flex, FlexLoader, Skeleton, styled, Text } from 'ui/src'
import { Edit } from 'ui/src/components/icons/Edit'
import { NetworkLogo } from 'uniswap/src/components/CurrencyLogo/NetworkLogo'
import { ZERO_ADDRESS } from 'uniswap/src/constants/misc'
import { GRG, nativeOnChain } from 'uniswap/src/constants/tokens'
import { useEnabledChains } from 'uniswap/src/features/chains/hooks/useEnabledChains'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { getChainLabel } from 'uniswap/src/features/chains/utils'
import { useLocalizationContext } from 'uniswap/src/features/language/LocalizationContext'
import { NumberType } from 'utilities/src/format/types'
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
import RaceModal from '~/components/earn/RaceModal'
import UnstakeModal from '~/components/earn/UnstakeModal'
import { ChainLogo } from '~/components/Logo/ChainLogo'
import { SwitchLocaleLink } from '~/components/SwitchLocaleLink'
import DelegateModal from '~/components/vote/DelegateModal'
import { RIGOBLOCK_SUPPORTED_CHAINS, RIGOBLOCK_TESTNET_CHAINS } from '~/constants/addresses'
import { useCurrency } from '~/hooks/Tokens'
import { useAccount } from '~/hooks/useAccount'
import useSelectChain from '~/hooks/useSelectChain'
import { UserAccount, useImplementation, useSmartPoolFromAddress, useUserPoolBalance } from '~/hooks/useSmartPools'
import { PoolInfo } from '~/state/buy/hooks'
import { useCurrencyBalancesMultipleAccounts } from '~/state/connection/hooks'
import { usePoolIdByAddress } from '~/state/governance/hooks'
import { StakingPoolData, useMultiChainAllPoolsData, useMultiChainStakingPools } from '~/state/pool/multichain'
import { useFreeStakeBalance, useUnclaimedRewards } from '~/state/stake/hooks'
import { useStakingEpochInfo } from '~/state/stake/useStakingEpochInfo'

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
  height: '100%',
})

const DataRow = styled(Flex, {
  row: true,
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '$spacing12',
  width: '100%',
})

const ChainPill = styled(Flex, {
  row: true,
  alignItems: 'center',
  gap: '$spacing4',
  paddingHorizontal: '$spacing8',
  paddingVertical: '$spacing4',
  borderRadius: '$rounded8',
  borderWidth: 1,
  borderColor: '$surface3',
  cursor: 'pointer',
  hoverStyle: {
    backgroundColor: '$surface2',
  },
  variants: {
    active: {
      true: {
        borderColor: '$accent1',
        backgroundColor: '$accent2',
      },
    },
  } as const,
})

const BackLink = styled(Text, {
  color: '$neutral2',
  hoverStyle: {
    color: '$neutral1',
  },
})

/**
 * Edit affordance for owner-editable pool values. Always rendered (invisible for
 * non-owners) so row heights are identical whether or not the pool is operated,
 * keeping the cards the same size across chains.
 */
function EditAffordance({ visible, onPress }: { visible: boolean; onPress: () => void }): JSX.Element {
  return (
    <Flex
      width={16}
      height={16}
      alignItems="center"
      justifyContent="center"
      cursor={visible ? 'pointer' : undefined}
      opacity={visible ? 1 : 0}
      pointerEvents={visible ? 'auto' : 'none'}
      onPress={visible ? onPress : undefined}
      hoverStyle={visible ? { opacity: 0.7 } : undefined}
    >
      <Edit size={16} color="$accent1" />
    </Flex>
  )
}

/** Inline loading placeholder that keeps the row at text height while chain data loads */
function LoadingValue({ width = 80 }: { width?: number }): JSX.Element {
  return (
    <Skeleton>
      <FlexLoader borderRadius="$rounded4" height={16} opacity={0.4} width={width} />
    </Skeleton>
  )
}

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
  const [showRaceModal, setShowRaceModal] = useState(false)

  const navigate = useNavigate()

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

  // Multichain staking data for this pool (same shared query as NavBar/Earn — one batch across all chains)
  const { isTestnetModeEnabled } = useEnabledChains()
  const supportedChains = useMemo(
    () => (isTestnetModeEnabled ? RIGOBLOCK_TESTNET_CHAINS : RIGOBLOCK_SUPPORTED_CHAINS),
    [isTestnetModeEnabled],
  )
  const { data: allPools } = useMultiChainAllPoolsData(supportedChains)
  const { stakingPools } = useMultiChainStakingPools(allPools ?? [])
  const chainEntries = useMemo(() => {
    if (!allPools || !stakingPools || !poolAddressFromUrl) {
      return []
    }
    return allPools
      .map((pool, index) => ({
        pool,
        staking: stakingPools[index] as StakingPoolData | undefined,
      }))
      .filter(({ pool }) => pool.pool.toLowerCase() === poolAddressFromUrl.toLowerCase())
  }, [allPools, stakingPools, poolAddressFromUrl])
  const selectedChainStaking = useMemo(
    () => chainEntries.find(({ pool }) => pool.chainId === chainId)?.staking,
    [chainEntries, chainId],
  )
  const { data: epochInfo } = useStakingEpochInfo(chainId)

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

      // Reset the previous chain's value so it is never shown for the newly selected chain
      setSimulatedValue(undefined)

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
      // oxlint-disable-next-line react/exhaustive-deps -- chainId is intentionally included to re-simulate on chain switch
    }, [poolAddress, provider, fallbackValue, chainId])

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

  let base = useCurrency({
    address: baseToken !== ZERO_ADDRESS ? baseToken : undefined,
    chainId,
  })
  if (baseToken === ZERO_ADDRESS) {
    base = nativeOnChain(chainId ?? UniverseChainId.Mainnet)
  }

  const pool = useCurrency({
    address: poolAddressFromUrl ?? undefined,
    chainId,
  })
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
  // False while the selected chain's pool storage is loading (e.g. right after a chain switch),
  // so fields render placeholders instead of stale or missing values
  const poolStorageLoaded = !!poolStorage

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
          // Prefer live staking data; URL params are only a fallback for legacy links
          poolStake: selectedChainStaking
            ? Number(selectedChainStaking.delegatedStake.toString()) / 1e18
            : Number(poolStakeFromUrl),
          apr: selectedChainStaking ? selectedChainStaking.apr * 100 : Number(aprFromUrl),
          poolOwnStake: selectedChainStaking
            ? Number(selectedChainStaking.poolOwnStake.toString()) / 1e18
            : Number(poolOwnStakeFromUrl),
          irr: selectedChainStaking?.irr != null ? selectedChainStaking.irr * 100 : Number(irrFromUrl),
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
  const harvestYieldString = unclaimedRewards?.[0]?.yieldAmount
    ? formatCurrencyAmount({ value: unclaimedRewards[0].yieldAmount, type: NumberType.TokenNonTx })
    : undefined

  // Staking card display data (selected chain)
  const grg = chainId ? GRG[chainId as UniverseChainId] : undefined
  const formatGrgAmount = useCallback(
    (raw?: string) => {
      if (!raw || !grg) {
        return '—'
      }
      try {
        return formatCurrencyAmount({
          value: CurrencyAmount.fromRawAmount(grg, JSBI.BigInt(raw)),
          type: NumberType.TokenNonTx,
        })
      } catch {
        return '—'
      }
    },
    [grg, formatCurrencyAmount],
  )
  const stakingAprString =
    selectedChainStaking && Number(selectedChainStaking.apr) > 0
      ? `${(Number(selectedChainStaking.apr) * 100).toFixed(1)}%`
      : '—'
  const stakingIrrString =
    selectedChainStaking?.irr != null && Number(selectedChainStaking.irr) > 0
      ? `${(Number(selectedChainStaking.irr) * 100).toFixed(1)}%`
      : '—'
  // A pool can be enrolled for the current epoch rewards once it has enough own stake and is not enrolled yet
  const canEnrollForRewards = useMemo(() => {
    if (!account.isConnected || !selectedChainStaking) {
      return false
    }
    if (Number(selectedChainStaking.currentEpochReward) > 0) {
      return false
    }
    try {
      const ownStake = BigInt(selectedChainStaking.poolOwnStake.toString())
      if (ownStake <= 0n) {
        return false
      }
      return epochInfo?.minimumPoolStake ? ownStake >= BigInt(epochInfo.minimumPoolStake) : true
    } catch {
      return false
    }
  }, [account.isConnected, selectedChainStaking, epochInfo?.minimumPoolStake])

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
            <RaceModal
              isOpen={showRaceModal}
              poolAddress={poolAddressFromUrl}
              poolName={name}
              onDismiss={() => setShowRaceModal(false)}
              title={<Trans>Race</Trans>}
            />
          </>
        )}

        <Flex gap="$spacing24" width="100%">
          <Flex gap="$spacing16" width="100%">
            <Flex
              row
              justifyContent="space-between"
              alignItems="center"
              $sm={{
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: '$spacing12',
              }}
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
                  <Button size="small" variant="branded" fill={false} onPress={handleUpgradeClick}>
                    <Trans>Upgrade</Trans>
                  </Button>
                )}
                {harvestYieldString && (
                  <Button size="small" variant="branded" fill={false} onPress={() => setShowHarvestYieldModal(true)}>
                    <Trans>Harvest {harvestYieldString} GRG</Trans>
                  </Button>
                )}
              </Flex>
            </Flex>

            <Flex
              row
              justifyContent="space-between"
              alignItems="center"
              gap="$spacing12"
              $sm={{
                flexDirection: 'column',
                alignItems: 'flex-start',
              }}
            >
              <Flex row gap="$spacing12" alignItems="center" flexShrink={1} minWidth={0}>
                {name || chainEntries[0]?.pool.name ? (
                  <Text variant="heading3" numberOfLines={1}>
                    {name ?? chainEntries[0]?.pool.name}&nbsp;|&nbsp;{symbol ?? chainEntries[0]?.pool.symbol}
                  </Text>
                ) : (
                  <Skeleton>
                    <FlexLoader borderRadius="$rounded8" height={28} opacity={0.4} width={180} />
                  </Skeleton>
                )}
                <NetworkLogo chainId={chainId as UniverseChainId} size={24} />
                {poolAddressFromUrl && (
                  <Flex marginLeft="$spacing16">
                    <Link to={`/portfolio/${poolAddressFromUrl}`} style={{ textDecoration: 'none' }}>
                      <Text variant="body2" color="$accent1" whiteSpace="nowrap">
                        <Trans>Portfolio →</Trans>
                      </Text>
                    </Link>
                  </Flex>
                )}
              </Flex>
              <Flex row gap="$spacing8" alignItems="center" flexShrink={0}>
                <Button size="small" variant="branded" fill={false} onPress={() => setShowBuyModal(true)}>
                  <Trans>Buy</Trans>
                </Button>
                {hasBalance && (
                  <Button size="small" variant="branded" fill={false} onPress={() => setShowSellModal(true)}>
                    <Trans>Sell</Trans>
                  </Button>
                )}
              </Flex>
            </Flex>

            {chainEntries.length > 1 && (
              <Flex row gap="$spacing8" flexWrap="wrap" width="100%">
                {chainEntries.map(({ pool: chainPool, staking: chainStaking }) => {
                  const entryChainId = chainPool.chainId as UniverseChainId
                  const entryAprString =
                    chainStaking && Number(chainStaking.apr) > 0
                      ? `${(Number(chainStaking.apr) * 100).toFixed(1)}%`
                      : '—'
                  return (
                    <ChainPill
                      key={entryChainId}
                      active={entryChainId === chainId}
                      onPress={() =>
                        entryChainId !== chainId &&
                        navigate(
                          `/smart-pool/${entryChainId}/${poolAddressFromUrl}${
                            originFromUrl ? `/${originFromUrl}` : ''
                          }`,
                        )
                      }
                    >
                      <ChainLogo chainId={entryChainId} size={14} />
                      <Text fontSize={12} fontWeight="600">
                        {getChainLabel(entryChainId)}
                      </Text>
                      <Text fontSize={11} color="$neutral2">
                        {entryAprString} APR
                      </Text>
                    </ChainPill>
                  )
                })}
              </Flex>
            )}
          </Flex>

          <Flex row flexWrap="wrap" gap="$spacing16" width="100%" alignItems="stretch">
            <DataCard flexBasis="31%" $lg={{ flexBasis: '47%' }}>
              <Text variant="subheading2">
                <Trans>Pool Values</Trans>
              </Text>
              <Flex gap="$spacing12" width="100%">
                <DataRow>
                  <Text variant="body3" color="$neutral2">
                    <Trans>Total Value</Trans>
                  </Text>
                  {poolValueAmount ? (
                    <Text variant="body3" color="$neutral1">
                      {formatCurrencyAmount({ value: poolValueAmount })}&nbsp;
                      {baseTokenSymbol}
                    </Text>
                  ) : (
                    <LoadingValue width={90} />
                  )}
                </DataRow>
                <DataRow>
                  <Text variant="body3" color="$neutral2">
                    <Trans>Unitary Value</Trans>
                  </Text>
                  <Flex row alignItems="center" gap="$spacing8">
                    {poolPrice && baseTokenSymbol ? (
                      <Text variant="body3" color="$neutral1">
                        {formatCurrencyAmount({
                          value: poolPrice,
                          type: NumberType.TokenNonTx,
                        })}
                        &nbsp;
                        {baseTokenSymbol}
                      </Text>
                    ) : (
                      <LoadingValue width={70} />
                    )}
                    <EditAffordance
                      visible={poolStorageLoaded && owner === account.address && !!poolValueAmount}
                      onPress={() => setShowSetValueModal(true)}
                    />
                  </Flex>
                </DataRow>
              </Flex>
            </DataCard>

            <DataCard flexBasis="31%" $lg={{ flexBasis: '47%' }}>
              <Text variant="subheading2">
                <Trans>Cost Factors</Trans>
              </Text>
              <Flex gap="$spacing12" width="100%">
                <DataRow>
                  <Text variant="body3" color="$neutral2">
                    <Trans>Spread</Trans>
                  </Text>
                  <Flex row alignItems="center" gap="$spacing8">
                    {poolStorageLoaded && spread ? (
                      <Text variant="body3" color="$neutral1">
                        <Trans>{new Percent(String(spread), 10_000).toSignificant()}%</Trans>
                      </Text>
                    ) : poolStorageLoaded ? (
                      <Text variant="body3" color="$neutral1">
                        0%
                      </Text>
                    ) : (
                      <LoadingValue width={48} />
                    )}
                    <EditAffordance
                      visible={poolStorageLoaded && owner === account.address}
                      onPress={() => setShowSetSpreadModal(true)}
                    />
                  </Flex>
                </DataRow>
                <DataRow>
                  <Text variant="body3" color="$neutral2">
                    <Trans>Distribution Fee</Trans>
                  </Text>
                  {poolStorageLoaded ? (
                    <Text variant="body3" color="$neutral1">
                      {transactionFee ? (
                        <Trans>{new Percent(String(transactionFee), 10_000).toSignificant()}%</Trans>
                      ) : (
                        '0%'
                      )}
                    </Text>
                  ) : (
                    <LoadingValue width={48} />
                  )}
                </DataRow>
                <DataRow>
                  <Text variant="body3" color="$neutral2">
                    <Trans>Lockup</Trans>
                  </Text>
                  <Flex row alignItems="center" gap="$spacing8">
                    {poolStorageLoaded ? (
                      <Text variant="body3" color="$neutral1">
                        <Trans>{lockup} days</Trans>
                      </Text>
                    ) : (
                      <LoadingValue width={64} />
                    )}
                    <EditAffordance
                      visible={poolStorageLoaded && owner === account.address}
                      onPress={() => setShowSetLockupModal(true)}
                    />
                  </Flex>
                </DataRow>
              </Flex>
            </DataCard>

            <DataCard flexBasis="31%" $lg={{ flexBasis: '47%' }}>
              <Text variant="subheading2">
                <Trans>Issuance Data</Trans>
              </Text>
              <Flex gap="$spacing12" width="100%">
                <DataRow>
                  <Text variant="body3" color="$neutral2">
                    <Trans>Total Supply</Trans>
                  </Text>
                  {totalSupply && base ? (
                    <Text variant="body3" color="$neutral1">
                      {formatCurrencyAmount({
                        value: CurrencyAmount.fromRawAmount(base, JSBI.BigInt(String(totalSupply))),
                        type: NumberType.TokenNonTx,
                      })}
                      &nbsp;{symbol}
                    </Text>
                  ) : (
                    <LoadingValue width={80} />
                  )}
                </DataRow>
                <DataRow>
                  <Text variant="body3" color="$neutral2">
                    <Trans>Decimals</Trans>
                  </Text>
                  {poolStorageLoaded && decimals ? (
                    <Text variant="body3" color="$neutral1">
                      <Trans i18nKey="smartPool.decimals" values={{ decimals }} />
                    </Text>
                  ) : poolStorageLoaded ? (
                    <Text variant="body3" color="$neutral1">
                      18
                    </Text>
                  ) : (
                    <LoadingValue width={32} />
                  )}
                </DataRow>
                <DataRow>
                  <Text variant="body3" color="$neutral2">
                    <Trans>Base Token</Trans>
                  </Text>
                  {baseTokenSymbol ? (
                    <Text variant="body3" color="$neutral1">
                      {baseTokenSymbol}
                    </Text>
                  ) : (
                    <LoadingValue width={56} />
                  )}
                </DataRow>
              </Flex>
            </DataCard>
          </Flex>

          <Flex row gap="$spacing16" width="100%" alignItems="stretch" $lg={{ flexDirection: 'column' }}>
            <DataCard flex={1}>
              <Flex row justifyContent="space-between" alignItems="center" width="100%">
                <Flex row alignItems="center" gap="$spacing8">
                  <Text variant="subheading2">
                    <Trans>Staking</Trans>
                  </Text>
                  {chainId && (
                    <Text variant="body3" color="$neutral2">
                      · {getChainLabel(chainId as UniverseChainId)}
                    </Text>
                  )}
                </Flex>
                {canEnrollForRewards && (
                  <Button
                    size="xxsmall"
                    variant="branded"
                    emphasis="secondary"
                    fill={false}
                    onPress={() => setShowRaceModal(true)}
                  >
                    <Trans>Enroll for rewards</Trans>
                  </Button>
                )}
              </Flex>
              <Flex gap="$spacing12" width="100%">
                <DataRow>
                  <Text variant="body3" color="$neutral2">
                    <Trans>APR</Trans>
                  </Text>
                  <Text variant="body3" color="$neutral1">
                    {stakingAprString}
                  </Text>
                </DataRow>
                {selectedChainStaking?.userIsOwner && (
                  <DataRow>
                    <Text variant="body3" color="$neutral2">
                      <Trans>IRR (operator)</Trans>
                    </Text>
                    <Text variant="body3" color="$neutral1">
                      {stakingIrrString}
                    </Text>
                  </DataRow>
                )}
                <DataRow>
                  <Text variant="body3" color="$neutral2">
                    <Trans>Delegated Stake</Trans>
                  </Text>
                  <Text variant="body3" color="$neutral1">
                    {formatGrgAmount(selectedChainStaking?.delegatedStake.toString())} GRG
                  </Text>
                </DataRow>
                <DataRow>
                  <Text variant="body3" color="$neutral2">
                    <Trans>Operator Own Stake</Trans>
                  </Text>
                  <Text variant="body3" color="$neutral1">
                    {formatGrgAmount(selectedChainStaking?.poolOwnStake.toString())} GRG
                  </Text>
                </DataRow>
              </Flex>
            </DataCard>

            <Flex flexBasis="24%">
              {poolAddressFromUrl && chainId ? (
                <AddressCard address={poolAddressFromUrl} chainId={chainId} label="Smart Pool" />
              ) : (
                <Skeleton>
                  <FlexLoader borderRadius="$rounded16" height={66} opacity={0.3} width="100%" />
                </Skeleton>
              )}
            </Flex>
            <Flex flexBasis="24%">
              {owner && chainId ? (
                <AddressCard address={owner} chainId={chainId} label="Pool Operator" />
              ) : (
                <Skeleton>
                  <FlexLoader borderRadius="$rounded16" height={66} opacity={0.3} width="100%" />
                </Skeleton>
              )}
            </Flex>
          </Flex>

          <Flex row gap="$spacing8" flexWrap="wrap" width="100%" justifyContent="center">
            <Button size="small" variant="branded" fill={false} onPress={() => setShowStakeModal(true)}>
              <Trans>Stake</Trans>
            </Button>
            <Button size="small" variant="branded" fill={false} onPress={handleMoveStakeClick}>
              <Trans>Switch</Trans>
            </Button>
            <Button size="small" variant="branded" fill={false} onPress={handleDeactivateStakeClick}>
              <Trans>Disable</Trans>
            </Button>
            {owner === account.address && hasFreeStake && (
              <Button size="small" variant="branded" fill={false} onPress={() => setShowUnstakeModal(true)}>
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
