/* eslint-disable max-lines */

import { Currency, CurrencyAmount, Percent, Token } from '@uniswap/sdk-core'
import { BigNumber } from '@ethersproject/bignumber'
// TODO: this import is from node modules
import JSBI from 'jsbi'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Trans } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'
import { Button, Flex, FlexLoader, Skeleton, styled, Text } from 'ui/src'
import { Edit } from 'ui/src/components/icons/Edit'
import { NetworkLogo } from 'uniswap/src/components/CurrencyLogo/NetworkLogo'
import { ZERO_ADDRESS } from 'uniswap/src/constants/misc'
import { GRG, nativeOnChain } from 'uniswap/src/constants/tokens'
import { useEnabledChains } from 'uniswap/src/features/chains/hooks/useEnabledChains'
import { UniverseChainId, EVMUniverseChainId } from 'uniswap/src/features/chains/types'
import { getChainLabel, getPrimaryStablecoin, isBackendSupportedChainId } from 'uniswap/src/features/chains/utils'
import { useLocalizationContext } from 'uniswap/src/features/language/LocalizationContext'
import { NumberType } from 'utilities/src/format/types'
import { normalizeTokenAddressForCache } from 'uniswap/src/data/cache'
import { areAddressesEqual } from 'uniswap/src/utils/addresses'
// TODO: check if should refactor AddressCard
import { AddressCard } from '~/components/AddressCard'
import BuyModal from '~/components/createPool/BuyModal'
import SellModal from '~/components/createPool/SellModal'
import SetLockupModal from '~/components/createPool/SetLockupModal'
import SetSpreadModal from '~/components/createPool/SetSpreadModal'
import SetValueModal from '~/components/createPool/SetValueModal'
import UpgradeModal from '~/components/createPool/UpgradeModal'
import HarvestYieldModal, { HarvestChainOption } from '~/components/earn/HarvestYieldModal'
import MoveStakeModal from '~/components/earn/MoveStakeModal'
import RaceModal from '~/components/earn/RaceModal'
import UnstakeModal from '~/components/earn/UnstakeModal'
import { ChainPill } from '~/components/ChainPill'
import { ChainLogo } from '~/components/Logo/ChainLogo'
import { SwitchLocaleLink } from '~/components/SwitchLocaleLink'
import DelegateModal from '~/components/vote/DelegateModal'
import { RIGOBLOCK_SUPPORTED_CHAINS, RIGOBLOCK_TESTNET_CHAINS } from '~/constants/addresses'
import { RPC_PROVIDERS } from '~/constants/providers'
import { useCurrency } from '~/hooks/Tokens'
import { useAccount } from '~/hooks/useAccount'
import useSelectChain from '~/hooks/useSelectChain'
import { UserAccount, useImplementation, useSmartPoolFromAddress, useUserPoolBalance } from '~/hooks/useSmartPools'
import { PoolInfo } from '~/state/buy/hooks'
import { useCurrencyBalancesMultipleAccounts } from '~/state/connection/hooks'
import { usePoolIdByAddress } from '~/state/governance/hooks'
import { PoolRegisteredLog } from '~/state/pool/hooks'
import { StakingPoolData, useMultiChainAllPoolsData, useMultiChainStakingPools } from '~/state/pool/multichain'
import { useUnclaimedRewards } from '~/state/stake/hooks'
import { useMultiChainFreeStakeBalances, type FreeStakeBalanceByChain } from '~/state/stake/useMultiChainFreeStakeBalances'
import { useStakingEpochInfo } from '~/state/stake/useStakingEpochInfo'
import { assume0xAddress } from '~/utils/wagmi'

const NAV_SIMULATE_DEPLOYMENT_BYTECODE =
  '0x608060405234801561000f575f5ffd5b5060405161017738038061017783398101604081905261002e916100ef565b806001600160a01b031663e7d8724e6040518163ffffffff1660e01b81526004015f604051808303815f87803b158015610066575f5ffd5b505af1158015610078573d5f5f3e3d5ffd5b505050505f816001600160a01b03166389c065686040518163ffffffff1660e01b81526004016040805180830381865afa1580156100b8573d5f5f3e3d5ffd5b505050506040513d601f19601f820116820180604052508101906100dc919061011c565b80515f8181524260205291925090604090f35b5f602082840312156100ff575f5ffd5b81516001600160a01b0381168114610115575f5ffd5b9392505050565b5f604082840312801561012d575f5ffd5b50604080519081016001600160401b038111828210171561015c57634e487b7160e01b5f52604160045260245ffd5b60405282518152602092830151928101929092525091905056fe'

// Selector of INavView.getNavDataView() — used on HyperEVM instead of the ephemeral
// deployment simulation, as it reads NAV without triggering the 2-minute NAV lock.
const HL_NAV_DATA_VIEW_SELECTOR = '0x5d7d86de'

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

type ChainEntry = {
  pool: PoolRegisteredLog
  staking: StakingPoolData | undefined
}

function useSimulatedUnitaryValue({
  poolAddress,
  fallbackValue,
  chainId,
}: {
  poolAddress?: string
  fallbackValue?: string
  chainId?: number
}): string | undefined {
  const [simulatedValue, setSimulatedValue] = useState<string>()

  useEffect(() => {
    if (!poolAddress || !chainId) {
      return
    }

    // Reset the previous chain's value so it is never shown for the newly selected chain
    setSimulatedValue(undefined)

    // Read-only calls must target the SELECTED chain, not the wallet's connected chain:
    // the same pool address exists on several chains, so simulating on the wallet chain
    // would read another chain's NAV (wrong decimals scale).
    const provider = RPC_PROVIDERS[chainId as EVMUniverseChainId]

    const MAX_REASONABLE_VALUE = BigInt('1000000000000000000000000000000') // 10^30 (1 trillion with 18 decimals)
    const isReasonable = (unitaryValue: string): boolean => {
      const parsedValue = BigInt(unitaryValue)
      if (parsedValue > MAX_REASONABLE_VALUE) {
        return false
      }
      // A zero simulated value with a non-zero fallback means the NAV calculation
      // likely failed silently (missing price feed, token not in active array)
      if (parsedValue === BigInt(0) && fallbackValue && BigInt(fallbackValue) > BigInt(0)) {
        return false
      }
      return true
    }

    // @Notice: on HyperEVM use INavView.getNavDataView() — it reads NAV via the
    // Hyperliquid balances helper and does not hit the 2-minute NAV lock that makes
    // the ephemeral updateUnitaryValue simulation revert there.
    async function fetchNavDataView(address: string) {
      try {
        const result = await provider.call({
          to: assume0xAddress(address),
          data: HL_NAV_DATA_VIEW_SELECTOR,
        })
        // abi-encoded (uint256 totalValue, uint256 unitaryValue, uint256 timestamp): word index 1
        if (result && result.length >= 130) {
          const unitaryValue = BigInt('0x' + result.slice(66, 130)).toString()
          setSimulatedValue(isReasonable(unitaryValue) ? unitaryValue : fallbackValue)
        } else {
          setSimulatedValue(fallbackValue)
        }
      } catch {
        // If the call reverts, fall back to the stored value — no extra calls.
        setSimulatedValue(fallbackValue)
      }
    }

    // @Notice: simulate function to deploy ephemeral contract that returns the real-time updateUnitaryValue
    async function simulate(address: string) {
      if (chainId === UniverseChainId.HyperEvm) {
        await fetchNavDataView(address)
        return
      }
      try {
        // Method 1: Simulate contract deployment that returns value from constructor
        // Deploy ephemeral contract that calls updateUnitaryValue and returns the result
        const encodedPoolAddress = address.slice(2).padStart(64, '0') // Remove 0x and pad to 32 bytes
        const deploymentBytecode = NAV_SIMULATE_DEPLOYMENT_BYTECODE + encodedPoolAddress

        const tx = {
          data: deploymentBytecode,
        }

        // eth_call simulates the deployment without actually deploying
        const result = await provider.call(tx)

        if (result && result !== '0x' && result.length <= 150) {
          // Extract first 32 bytes (uint256) from the 64-byte return value
          const unitaryValueHex = result.slice(0, 66) // '0x' + 64 hex chars = 66 chars
          // Convert hex to decimal string for JSBI compatibility
          const unitaryValue = BigInt(unitaryValueHex).toString()

          if (isReasonable(unitaryValue)) {
            setSimulatedValue(unitaryValue)
          } else {
            setSimulatedValue(fallbackValue)
          }
          return
        }
        setSimulatedValue(fallbackValue)
      } catch {
        // NAV calculations can legitimately revert (e.g. Rigoblock's 2-minute NAV lock
        // after a deposit/withdrawal) — no extra call: the fallback is the stored value.
        setSimulatedValue(fallbackValue)
      }
    }

    simulate(poolAddress)
    // chainId is intentionally included to re-simulate on chain switch
  }, [poolAddress, fallbackValue, chainId])

  return simulatedValue
}

function usePoolChainEntries(
  poolAddressFromUrl: string | undefined,
  chainId: number | undefined,
): { chainEntries: ChainEntry[]; selectedChainStaking: StakingPoolData | undefined } {
  const { isTestnetModeEnabled } = useEnabledChains()
  const supportedChains = useMemo(
    () => (isTestnetModeEnabled ? RIGOBLOCK_TESTNET_CHAINS : RIGOBLOCK_SUPPORTED_CHAINS),
    [isTestnetModeEnabled],
  )
  const { data: allPools } = useMultiChainAllPoolsData(supportedChains)
  const { stakingPools } = useMultiChainStakingPools(allPools ?? [])

  // Preserve the last non-empty set of chain entries across chain switches so the
  // chain pills and name/symbol never flicker while the new chain's data reloads.
  const cachedEntriesRef = useRef<ChainEntry[]>([])

  const chainEntries = useMemo<ChainEntry[]>(() => {
    if (!allPools || !stakingPools || !poolAddressFromUrl) {
      return cachedEntriesRef.current
    }
    const entries = allPools
      .map((pool, index) => ({
        pool,
        staking: stakingPools[index] as StakingPoolData | undefined,
      }))
      .filter(
        ({ pool }) =>
          normalizeTokenAddressForCache(pool.pool) === normalizeTokenAddressForCache(poolAddressFromUrl),
      )
    if (entries.length > 0) {
      cachedEntriesRef.current = entries
    }
    return cachedEntriesRef.current
  }, [allPools, stakingPools, poolAddressFromUrl])

  const selectedChainStaking = useMemo(
    () => chainEntries.find(({ pool }) => pool.chainId === chainId)?.staking,
    [chainEntries, chainId],
  )

  return { chainEntries, selectedChainStaking }
}

function usePoolBaseValues({
  poolAddressFromUrl,
  chainId,
  poolStorage,
  userAccount,
}: {
  poolAddressFromUrl: string | undefined
  chainId: number | undefined
  poolStorage: ReturnType<typeof useSmartPoolFromAddress>
  userAccount: UserAccount | undefined
}) {
  const { name, symbol, decimals, owner, baseToken } = poolStorage?.poolInitParams || {}
  const { minPeriod, spread, transactionFee } = poolStorage?.poolVariables || {}
  const { unitaryValue: storedUnitaryValue, totalSupply } = poolStorage?.poolTokensInfo || {}

  // Default unitary value is 1e18 (1 with 18 decimals) for uninitialized pools
  const DEFAULT_UNITARY_VALUE = '1000000000000000000'
  const simulatedOrStoredValue =
    useSimulatedUnitaryValue({
      poolAddress: poolAddressFromUrl,
      fallbackValue: storedUnitaryValue?.toString(),
      chainId,
    }) ?? storedUnitaryValue
  // Use default value of 1e18 when the pool is uninitialized (null/undefined/zero unitary value).
  // A simulated value of '0' can be returned for uninitialized/upgraded pools whose storage slot
  // has been cleared, so we fall back to the default NAV in that case.
  const unitaryValue =
    simulatedOrStoredValue && simulatedOrStoredValue !== '0' ? simulatedOrStoredValue : DEFAULT_UNITARY_VALUE

  // Chains the GraphQL backend doesn't index (e.g. HyperEVM) can never resolve through
  // useCurrency — build the currencies from on-chain data instead. On HyperEVM the base
  // token is always USDC (Rigoblock constraint), so the chain's primary stablecoin is used.
  const isBackendSupported = chainId ? isBackendSupportedChainId(chainId as UniverseChainId) : true

  const onChainPoolToken = useMemo(() => {
    if (isBackendSupported || !chainId || !poolAddressFromUrl) {
      return undefined
    }
    return new Token(chainId, poolAddressFromUrl, decimals ?? 18, symbol ?? '', name ?? '')
  }, [isBackendSupported, chainId, poolAddressFromUrl, decimals, symbol, name])

  let base = useCurrency({
    address: baseToken !== ZERO_ADDRESS ? baseToken : undefined,
    chainId,
  })
  if (!isBackendSupported && chainId && baseToken !== ZERO_ADDRESS) {
    base = getPrimaryStablecoin(chainId as UniverseChainId)
  }
  if (baseToken === ZERO_ADDRESS) {
    base = nativeOnChain(chainId ?? UniverseChainId.Mainnet)
  }

  const gqlPool = useCurrency({
    address: poolAddressFromUrl ?? undefined,
    chainId,
  })
  const pool = isBackendSupported ? gqlPool : onChainPoolToken
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

  return {
    name,
    symbol,
    decimals,
    owner,
    baseToken,
    minPeriod,
    spread,
    transactionFee,
    totalSupply,
    unitaryValue,
    base,
    pool,
    poolPrice,
    userPoolBalance,
    hasBalance,
    baseTokenSymbol,
    poolStorageLoaded,
    poolValue,
    poolValueAmount,
    lockup,
  }
}

function usePoolStakingInfo({
  chainId,
  account,
  selectedChainStaking,
  epochInfo,
}: {
  chainId: number | undefined
  account: ReturnType<typeof useAccount>
  selectedChainStaking: StakingPoolData | undefined
  epochInfo: ReturnType<typeof useStakingEpochInfo>['data']
}) {
  const { formatCurrencyAmount } = useLocalizationContext()
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

  return { grg, formatGrgAmount, stakingAprString, stakingIrrString, canEnrollForRewards }
}

function usePoolInfo({
  pool,
  account,
  owner,
  userAccount,
  userPoolBalance,
  poolPrice,
  spread,
  selectedChainStaking,
  poolStakeFromUrl,
  aprFromUrl,
  poolOwnStakeFromUrl,
  irrFromUrl,
  chainId,
}: {
  pool: Currency | undefined
  account: ReturnType<typeof useAccount>
  owner: string | undefined
  userAccount: UserAccount | undefined
  userPoolBalance: CurrencyAmount<Currency> | undefined
  poolPrice: CurrencyAmount<Currency> | undefined
  spread: number | undefined
  selectedChainStaking: StakingPoolData | undefined
  poolStakeFromUrl: string | undefined
  aprFromUrl: string | undefined
  poolOwnStakeFromUrl: string | undefined
  irrFromUrl: string | undefined
  chainId: number | undefined
}): PoolInfo | undefined {
  return useMemo(() => {
    if (!pool || !account.address) {
      return undefined
    }
    return {
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
    } as PoolInfo
  }, [
    pool,
    account.address,
    owner,
    userPoolBalance,
    poolPrice,
    spread,
    selectedChainStaking,
    poolStakeFromUrl,
    aprFromUrl,
    poolOwnStakeFromUrl,
    irrFromUrl,
    chainId,
    userAccount?.activation,
  ])
}

function usePoolUpgradeStatus(poolAddressFromUrl: string | undefined, chainId: number | undefined) {
  const IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'
  const { implementations, isLoading: isLoadingImplementations } = useImplementation(
    poolAddressFromUrl ?? undefined,
    IMPLEMENTATION_SLOT,
    chainId,
  )
  const [currentImplementation, beaconImplementation] = implementations ?? [undefined, undefined]

  const needsUpgrade = useMemo(() => {
    if (!currentImplementation || !beaconImplementation) {
      return false
    }
    const chainIdForComparison = (chainId ?? UniverseChainId.Mainnet) as UniverseChainId
    return !areAddressesEqual({
      addressInput1: { address: currentImplementation, chainId: chainIdForComparison },
      addressInput2: { address: beaconImplementation, chainId: chainIdForComparison },
    })
  }, [currentImplementation, beaconImplementation, chainId])

  return { needsUpgrade, currentImplementation, beaconImplementation, isLoadingImplementations }
}

interface PoolPageContextValue {
  chainId: number | undefined
  poolAddressFromUrl: string | undefined
  originFromUrl: string | undefined
  account: ReturnType<typeof useAccount>
  poolStorage: ReturnType<typeof useSmartPoolFromAddress>
  userAccount: UserAccount | undefined
  poolStorageLoaded: boolean
  name: string | undefined
  symbol: string | undefined
  decimals: number | undefined
  owner: string | undefined
  baseToken: string | undefined
  minPeriod: BigNumber | undefined
  spread: number | undefined
  transactionFee: number | undefined
  totalSupply: BigNumber | undefined
  base: Currency | undefined
  pool: Currency | undefined
  poolPrice: CurrencyAmount<Currency> | undefined
  userPoolBalance: CurrencyAmount<Currency> | undefined
  hasBalance: boolean
  poolValueAmount: CurrencyAmount<Currency> | undefined
  lockup: string
  baseTokenSymbol: string
  chainEntries: ChainEntry[]
  selectedChainStaking: StakingPoolData | undefined
  stakingAprString: string
  stakingIrrString: string
  canEnrollForRewards: boolean
  grg: Token | undefined
  formatGrgAmount: (raw?: string) => string
  epochInfo: ReturnType<typeof useStakingEpochInfo>['data']
  poolId: string | undefined
  harvestChains: HarvestChainOption[]
  unstakeChains: FreeStakeBalanceByChain[]
  hasFreeStake: boolean
  harvestYieldString: string | undefined
  needsUpgrade: boolean
  currentImplementation: string | undefined
  beaconImplementation: string | undefined
  isLoadingImplementations: boolean
  baseTokenBalances: { [address: string]: CurrencyAmount<Currency> | undefined }
  formatCurrencyAmount: ReturnType<typeof useLocalizationContext>['formatCurrencyAmount']
  navigate: ReturnType<typeof useNavigate>
  showBuyModal: boolean
  setShowBuyModal: (value: boolean) => void
  showSellModal: boolean
  setShowSellModal: (value: boolean) => void
  showSetLockupModal: boolean
  setShowSetLockupModal: (value: boolean) => void
  showSetSpreadModal: boolean
  setShowSetSpreadModal: (value: boolean) => void
  showSetValueModal: boolean
  setShowSetValueModal: (value: boolean) => void
  showStakeModal: boolean
  setShowStakeModal: (value: boolean) => void
  showMoveStakeModal: boolean
  setShowMoveStakeModal: (value: boolean) => void
  showUnstakeModal: boolean
  setShowUnstakeModal: (value: boolean) => void
  showHarvestYieldModal: boolean
  setShowHarvestYieldModal: (value: boolean) => void
  showRaceModal: boolean
  setShowRaceModal: (value: boolean) => void
  showUpgradeModal: boolean
  setShowUpgradeModal: (value: boolean) => void
  deactivate: boolean
  setDeactivate: (value: boolean) => void
  handleMoveStakeClick: () => void
  handleDeactivateStakeClick: () => void
  handleUpgradeClick: () => void
  poolInfo: PoolInfo | undefined
}

const PoolPageContext = createContext<PoolPageContextValue | undefined>(undefined)

function usePoolPageContext(): PoolPageContextValue {
  const context = useContext(PoolPageContext)
  if (!context) {
    throw new Error('usePoolPageContext must be used within PoolPositionPage')
  }
  return context
}

function usePoolPageData(): PoolPageContextValue {
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
  const { chainEntries, selectedChainStaking } = usePoolChainEntries(poolAddressFromUrl, chainId)
  const { data: epochInfo } = useStakingEpochInfo(chainId)

  const baseValues = usePoolBaseValues({ poolAddressFromUrl, chainId, poolStorage, userAccount })
  const stakingInfo = usePoolStakingInfo({ chainId, account, selectedChainStaking, epochInfo })

  // TODO: can use loadingBalances returned from the hook to show loading state
  const [baseTokenBalances] = useCurrencyBalancesMultipleAccounts(
    [account.address ?? undefined, poolAddressFromUrl ?? undefined],
    baseValues.base ?? undefined,
  )

  const { formatCurrencyAmount } = useLocalizationContext()

  // TODO: check how improve efficiency as this method is called each time a pool is loaded
  const { poolId } = usePoolIdByAddress(poolAddressFromUrl ?? undefined)
  const isPoolOperator = account.address === baseValues.owner
  // Pool harvest is only meaningful for the operator: it claims the pool's own delegator rewards.
  // We check the pool address as delegator across every chain where this address is deployed.
  const rewardPoolEntries = useMemo(
    () => chainEntries.map((e) => ({ poolId: e.pool.id, chainId: e.pool.chainId ?? 0 })).filter((e) => e.chainId !== 0),
    [chainEntries],
  )
  const unclaimedRewards = useUnclaimedRewards({
    farmer: poolAddressFromUrl,
    pools: isPoolOperator ? rewardPoolEntries : [],
  })

  // Pool harvest is available on every chain where this pool has unclaimed rewards.
  const harvestChains: HarvestChainOption[] = useMemo(() => {
    if ((unclaimedRewards?.length ?? 0) === 0) {
      return []
    }
    const byChain = new Map<number, { yieldAmount: CurrencyAmount<Token>; poolIds: string[]; grg: Token }>()
    for (const reward of unclaimedRewards ?? []) {
      const grg = GRG[reward.chainId]
      const existing = byChain.get(reward.chainId)
      if (existing) {
        existing.yieldAmount = CurrencyAmount.fromRawAmount(grg, JSBI.add(existing.yieldAmount.quotient, reward.yieldAmount.quotient))
        existing.poolIds.push(reward.poolId)
      } else {
        byChain.set(reward.chainId, {
          yieldAmount: reward.yieldAmount,
          poolIds: [reward.poolId],
          grg,
        })
      }
    }
    return Array.from(byChain.entries()).map(([entryChainId, { yieldAmount, poolIds }]) => ({
      chainId: entryChainId,
      yieldAmount,
      poolIds,
    }))
  }, [unclaimedRewards])

  const harvestYieldString =
    harvestChains.length === 1
      ? formatCurrencyAmount({
          value: harvestChains[0].yieldAmount,
          type: NumberType.TokenNonTx,
        })
      : undefined

  // Free stake for the pool operator across every chain where this pool is deployed.
  const poolChainIds = useMemo(
    () => chainEntries.map((e) => e.pool.chainId ?? 0).filter((id) => id !== 0),
    [chainEntries],
  )
  const freeStakeBalances = useMultiChainFreeStakeBalances(false, poolChainIds)
  const hasFreeStake = (freeStakeBalances?.length ?? 0) > 0

  // The pool has one stake pool ID per chain, but we currently unstake the whole pool free stake
  // on a single selected chain via the modal chain selector.
  const unstakeChains = freeStakeBalances ?? []

  // Check if the pool needs an upgrade
  const upgradeInfo = usePoolUpgradeStatus(poolAddressFromUrl, chainId)

  const poolInfo = usePoolInfo({
    pool: baseValues.pool,
    account,
    owner: baseValues.owner,
    userAccount,
    userPoolBalance: baseValues.userPoolBalance,
    poolPrice: baseValues.poolPrice,
    spread: baseValues.spread,
    selectedChainStaking,
    poolStakeFromUrl,
    aprFromUrl,
    poolOwnStakeFromUrl,
    irrFromUrl,
    chainId,
  })

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
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)

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

  // Automatically switch to the pool's chain when viewing it.
  // HyperEVM is exempt: pool data there is read chain-scoped and does not require the wallet
  // to be on 999, and hijacking the wallet chain app-wide breaks other flows (e.g. Create Pool).
  const selectChain = useSelectChain()
  useEffect(() => {
    if (chainId && chainId !== UniverseChainId.HyperEvm && account.chainId && account.chainId !== chainId && account.isConnected) {
      // Auto-switch to the correct chain
      selectChain(chainId)
    }
  }, [chainId, account.chainId, account.isConnected, selectChain])

  return {
    chainId,
    poolAddressFromUrl,
    originFromUrl,
    account,
    poolStorage,
    userAccount,
    poolStorageLoaded: baseValues.poolStorageLoaded,
    name: baseValues.name,
    symbol: baseValues.symbol,
    decimals: baseValues.decimals,
    owner: baseValues.owner,
    baseToken: baseValues.baseToken,
    minPeriod: baseValues.minPeriod,
    spread: baseValues.spread,
    transactionFee: baseValues.transactionFee,
    totalSupply: baseValues.totalSupply,
    base: baseValues.base,
    pool: baseValues.pool,
    poolPrice: baseValues.poolPrice,
    userPoolBalance: baseValues.userPoolBalance,
    hasBalance: baseValues.hasBalance,
    poolValueAmount: baseValues.poolValueAmount,
    lockup: baseValues.lockup,
    baseTokenSymbol: baseValues.baseTokenSymbol,
    chainEntries,
    selectedChainStaking,
    stakingAprString: stakingInfo.stakingAprString,
    stakingIrrString: stakingInfo.stakingIrrString,
    canEnrollForRewards: stakingInfo.canEnrollForRewards,
    grg: stakingInfo.grg,
    formatGrgAmount: stakingInfo.formatGrgAmount,
    epochInfo,
    poolId,
    harvestChains,
    unstakeChains,
    hasFreeStake,
    harvestYieldString,
    needsUpgrade: upgradeInfo.needsUpgrade,
    currentImplementation: upgradeInfo.currentImplementation,
    beaconImplementation: upgradeInfo.beaconImplementation,
    isLoadingImplementations: upgradeInfo.isLoadingImplementations,
    baseTokenBalances,
    formatCurrencyAmount,
    navigate,
    showBuyModal,
    setShowBuyModal,
    showSellModal,
    setShowSellModal,
    showSetLockupModal,
    setShowSetLockupModal,
    showSetSpreadModal,
    setShowSetSpreadModal,
    showSetValueModal,
    setShowSetValueModal,
    showStakeModal,
    setShowStakeModal,
    showMoveStakeModal,
    setShowMoveStakeModal,
    showUnstakeModal,
    setShowUnstakeModal,
    showHarvestYieldModal,
    setShowHarvestYieldModal,
    showRaceModal,
    setShowRaceModal,
    showUpgradeModal,
    setShowUpgradeModal,
    deactivate,
    setDeactivate,
    handleMoveStakeClick,
    handleDeactivateStakeClick,
    handleUpgradeClick,
    poolInfo,
  }
}

function PoolModals(): JSX.Element | null {
  const {
    poolInfo,
    account,
    poolAddressFromUrl,
    baseTokenBalances,
    name,
    minPeriod,
    spread,
    baseTokenSymbol,
    needsUpgrade,
    beaconImplementation,
    harvestChains,
    unstakeChains,
    showBuyModal,
    setShowBuyModal,
    showSellModal,
    setShowSellModal,
    showSetLockupModal,
    setShowSetLockupModal,
    showSetSpreadModal,
    setShowSetSpreadModal,
    showSetValueModal,
    setShowSetValueModal,
    showStakeModal,
    setShowStakeModal,
    showMoveStakeModal,
    setShowMoveStakeModal,
    showUnstakeModal,
    setShowUnstakeModal,
    showHarvestYieldModal,
    setShowHarvestYieldModal,
    showRaceModal,
    setShowRaceModal,
    showUpgradeModal,
    setShowUpgradeModal,
    deactivate,
  } = usePoolPageContext()

  if (!poolInfo) {
    return null
  }

  return (
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
        chains={unstakeChains}
        onDismiss={() => setShowUnstakeModal(false)}
        title={<Trans>Withdraw</Trans>}
      />
      {harvestChains.length > 0 && poolAddressFromUrl && (
        <HarvestYieldModal
          isOpen={showHarvestYieldModal}
          isPool={true}
          poolAddress={poolAddressFromUrl}
          chains={harvestChains}
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
  )
}

function PoolHeader(): JSX.Element {
  const {
    originFromUrl,
    poolAddressFromUrl,
    name,
    symbol,
    chainId,
    chainEntries,
    account,
    needsUpgrade,
    owner,
    hasBalance,
    harvestChains,
    harvestYieldString,
    handleUpgradeClick,
    setShowBuyModal,
    setShowSellModal,
    setShowHarvestYieldModal,
    navigate,
  } = usePoolPageContext()

  return (
    <>
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
          {harvestChains.length > 0 && (
            <Button size="small" variant="branded" fill={false} onPress={() => setShowHarvestYieldModal(true)}>
              <Text>
                {harvestChains.length === 1 ? (
                  <Trans>
                    Harvest {harvestYieldString} GRG
                  </Trans>
                ) : (
                  <Trans>Harvest</Trans>
                )}
              </Text>
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
            <Link to={`/portfolio/${poolAddressFromUrl}`} style={{ textDecoration: 'none' }}>
              <Button size="xsmall" variant="branded" emphasis="secondary" fill={false}>
                <Trans i18nKey="smartPool.portfolioLink" />
              </Button>
            </Link>
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
    </>
  )
}

function PoolDataCards(): JSX.Element {
  const {
    poolStorageLoaded,
    owner,
    account,
    poolValueAmount,
    poolPrice,
    baseTokenSymbol,
    totalSupply,
    base,
    symbol,
    decimals,
    spread,
    transactionFee,
    lockup,
    setShowSetValueModal,
    setShowSetSpreadModal,
    setShowSetLockupModal,
    formatCurrencyAmount,
  } = usePoolPageContext()

  return (
    <Flex row flexWrap="wrap" gap="$spacing16" width="100%" alignItems="stretch">
      <DataCard flex={1} flexBasis="31%" $lg={{ flexBasis: '47%' }}>
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

      <DataCard flex={1} flexBasis="31%" $lg={{ flexBasis: '47%' }}>
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

      <DataCard flex={1} flexBasis="31%" $lg={{ flexBasis: '47%' }}>
        <Text variant="subheading2">
          <Trans>Issuance Data</Trans>
        </Text>
        <Flex gap="$spacing12" width="100%">
          <DataRow>
            <Text variant="body3" color="$neutral2">
              <Trans>Total Supply</Trans>
            </Text>
            {poolStorageLoaded ? (
              <Text variant="body3" color="$neutral1">
                {base
                  ? formatCurrencyAmount({
                      value: CurrencyAmount.fromRawAmount(base, JSBI.BigInt(String(totalSupply ?? 0))),
                      type: NumberType.TokenNonTx,
                    })
                  : '0'}
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
              <Trans i18nKey="smartPool.baseToken" />
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
  )
}

function PoolAddressCards(): JSX.Element {
  const { chainId, poolAddressFromUrl, owner } = usePoolPageContext()

  return (
    <Flex flex={1} gap="$spacing12">
      {poolAddressFromUrl && chainId ? (
        <AddressCard address={poolAddressFromUrl} chainId={chainId} label="Smart Pool" />
      ) : (
        <Skeleton>
          <FlexLoader borderRadius="$rounded16" height={66} opacity={0.3} width="100%" />
        </Skeleton>
      )}
      {owner && chainId ? (
        <AddressCard address={owner} chainId={chainId} label="Pool Operator" />
      ) : (
        <Skeleton>
          <FlexLoader borderRadius="$rounded16" height={66} opacity={0.3} width="100%" />
        </Skeleton>
      )}
    </Flex>
  )
}

function PoolStakingSection(): JSX.Element {
  const {
    chainId,
    canEnrollForRewards,
    setShowRaceModal,
    stakingAprString,
    selectedChainStaking,
    stakingIrrString,
    formatGrgAmount,
    owner,
    account,
    hasFreeStake,
    setShowStakeModal,
    setShowMoveStakeModal,
    handleDeactivateStakeClick,
    setShowUnstakeModal,
  } = usePoolPageContext()

  return (
    <Flex row gap="$spacing16" width="100%" alignItems="stretch" $lg={{ flexDirection: 'column' }}>
      <DataCard flex={1}>
        <Flex row justifyContent="space-between" alignItems="center" width="100%">
          <Flex row alignItems="center" gap="$spacing8">
            <Text variant="subheading2">
              <Trans i18nKey="smartPool.staking" />
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
              <Trans i18nKey="smartPool.enrollForRewards" />
            </Button>
          )}
        </Flex>
        <Flex gap="$spacing12" width="100%">
          <DataRow>
            <Text variant="body3" color="$neutral2">
              <Trans i18nKey="smartPool.apr" />
            </Text>
            <Text variant="body3" color="$neutral1">
              {stakingAprString}
            </Text>
          </DataRow>
          {selectedChainStaking?.userIsOwner && (
            <DataRow>
              <Text variant="body3" color="$neutral2">
                <Trans i18nKey="smartPool.irrOperator" />
              </Text>
              <Text variant="body3" color="$neutral1">
                {stakingIrrString}
              </Text>
            </DataRow>
          )}
          <DataRow>
            <Text variant="body3" color="$neutral2">
              <Trans i18nKey="smartPool.delegatedStake" />
            </Text>
            <Text variant="body3" color="$neutral1">
              {formatGrgAmount(selectedChainStaking?.delegatedStake.toString())} GRG
            </Text>
          </DataRow>
          <DataRow>
            <Text variant="body3" color="$neutral2">
              <Trans i18nKey="smartPool.poolOwnStake" />
            </Text>
            <Text variant="body3" color="$neutral1">
              {formatGrgAmount(selectedChainStaking?.poolOwnStake.toString())} GRG
            </Text>
          </DataRow>
        </Flex>
      </DataCard>

      <Flex flexBasis="33%" flexShrink={0} gap="$spacing12" $lg={{ flexBasis: 'auto' }} justifyContent="space-between">
        <PoolAddressCards />
        <Flex centered paddingTop="$spacing12">
          <Flex row gap="$spacing8" flexWrap="wrap" justifyContent="center">
            <Button size="small" variant="branded" fill={false} onPress={() => setShowStakeModal(true)}>
              <Trans>Stake</Trans>
            </Button>
            <Button size="small" variant="branded" fill={false} onPress={() => setShowMoveStakeModal(true)}>
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
      </Flex>
    </Flex>
  )
}

export default function PoolPositionPage() {
  const value = usePoolPageData()

  return (
    <PoolPageContext.Provider value={value}>
      <PageWrapper>
        <PoolModals />
        <Flex gap="$spacing24" width="100%">
          <Flex gap="$spacing16" width="100%">
            <PoolHeader />
          </Flex>
          <PoolDataCards />
          {/* Staking is not deployed on HyperEVM — hide the staking section there,
              but keep the pool/operator address cards visible on every chain. */}
          {value.chainId !== UniverseChainId.HyperEvm ? (
            <PoolStakingSection />
          ) : (
            <Flex row gap="$spacing16" width="100%" alignItems="stretch" $lg={{ flexDirection: 'column' }}>
              <Flex flexBasis="33%" flexShrink={0} $lg={{ flexBasis: 'auto' }}>
                <PoolAddressCards />
              </Flex>
            </Flex>
          )}
        </Flex>
      </PageWrapper>
      <SwitchLocaleLink />
    </PoolPageContext.Provider>
  )
}
