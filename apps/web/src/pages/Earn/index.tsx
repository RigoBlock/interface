import { CurrencyAmount, Token } from '@uniswap/sdk-core'
import JSBI from 'jsbi'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Trans } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router'
import { Button, Flex, SegmentedControl, SegmentedControlOption } from 'ui/src'
import { Plus } from 'ui/src/components/icons/Plus'
import { NetworkFilter } from 'uniswap/src/components/network/NetworkFilter'
import { GRG } from 'uniswap/src/constants/tokens'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { useEnabledChains } from 'uniswap/src/features/chains/hooks/useEnabledChains'
import { InterfacePageName, ModalName } from 'uniswap/src/features/telemetry/constants'
import Trace from 'uniswap/src/features/telemetry/Trace'
import CreateModal from '~/components/createPool/CreateModal'
import { AutoColumn } from '~/components/deprecated/Column'
import HarvestYieldModal, { HarvestChainOption } from '~/components/earn/HarvestYieldModal'
import PoolPositionList from '~/components/PoolPositionList'
import { RIGOBLOCK_SUPPORTED_CHAINS, RIGOBLOCK_TESTNET_CHAINS } from '~/constants/addresses'
import { useAccount } from '~/hooks/useAccount'
import { useModalState } from '~/hooks/useModalState'
import styled from '~/lib/deprecated-styled'
import { PoolRegisteredLog } from '~/state/pool/hooks'
import { useMultiChainAllPoolsData, useMultiChainStakingPools } from '~/state/pool/multichain'

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

const MainContentWrapper = styled.main`
  background-color: ${({ theme }) => theme.surface1};
  border: 1px solid ${({ theme }) => theme.surface3};
  padding: 0;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  box-shadow:
    0px 0px 1px rgba(0, 0, 0, 0.01),
    0px 4px 8px rgba(0, 0, 0, 0.04),
    0px 16px 24px rgba(0, 0, 0, 0.04),
    0px 24px 32px rgba(0, 0, 0, 0.01);
`

enum EarnTab {
  AllPools = 'all',
  MyPools = 'my',
}

function biggestOwnStakeFirst(a: any, b: any) {
  return b.poolOwnStake - a.poolOwnStake
}

export default function Earn() {
  const {
    isOpen: createModalOpen,
    closeModal: closeCreateModal,
    toggleModal: toggleCreateModal,
  } = useModalState(ModalName.CreateVault)
  const [showHarvestYieldModal, setShowHarvestYieldModal] = useState(false)

  const account = useAccount()
  const location = useLocation()
  const navigate = useNavigate()
  const { isTestnetModeEnabled } = useEnabledChains()

  // Determine initial tab from URL path
  const isManagePath = location.pathname === '/earn/manage'

  // Use testnet or production chains based on mode
  const supportedChains = useMemo(
    () => (isTestnetModeEnabled ? RIGOBLOCK_TESTNET_CHAINS : RIGOBLOCK_SUPPORTED_CHAINS),
    [isTestnetModeEnabled],
  )

  // Chain filter state (null = all chains)
  const [selectedChain, setSelectedChain] = useState<UniverseChainId | null>(null)

  // Shared data: pool discovery from supported chains
  const { data: allPools } = useMultiChainAllPoolsData(supportedChains)

  // Single-batch staking data: one useReadContracts, wagmi splits into per-chain multicalls.
  // Includes unclaimedRewards across ALL chains, plus owner + userBalance via storage slot reads.
  const { stakingPools, unclaimedRewards } = useMultiChainStakingPools(allPools ?? [])

  // Unclaimed rewards grouped by chain. The user picks one chain at a time to harvest on.
  const harvestChains: HarvestChainOption[] = useMemo(() => {
    if (unclaimedRewards.length === 0) {
      return []
    }
    const byChain = new Map<number, { yieldAmount: JSBI; poolIds: string[]; grg: Token }>()
    for (const reward of unclaimedRewards) {
      const grg = GRG[reward.chainId]
      // Chains without GRG (e.g. HyperEVM, no staking) cannot harvest
      // oxlint-disable-next-line typescript/no-unnecessary-condition
      if (!grg) {
        continue
      }
      const existing = byChain.get(reward.chainId)
      if (existing) {
        existing.yieldAmount = JSBI.add(existing.yieldAmount, reward.amount.quotient)
        existing.poolIds.push(reward.poolId)
      } else {
        byChain.set(reward.chainId, {
          yieldAmount: reward.amount.quotient,
          poolIds: [reward.poolId],
          grg,
        })
      }
    }
    return Array.from(byChain.entries()).map(([chainId, { yieldAmount, poolIds, grg }]) => ({
      chainId,
      yieldAmount: CurrencyAmount.fromRawAmount(grg, yieldAmount),
      poolIds,
    }))
  }, [unclaimedRewards])

  // Pools enriched with staking stats + ownership + balance (all from the single staking batch)
  const poolsWithStats = useMemo(() => {
    if (!allPools || !stakingPools) {
      return undefined
    }
    return allPools.map((p, i) => {
      const s = stakingPools[i]
      return {
        ...p,
        irr: s.irr,
        apr: s.apr,
        poolOwnStake: s.poolOwnStake,
        poolDelegatedStake: s.delegatedStake,
        userHasStake: s.userHasStake,
        userIsOwner: s.userIsOwner,
        userBalance: s.userBalance,
        currentEpochReward: s.currentEpochReward,
      }
    })
  }, [allPools, stakingPools])

  // "Top Smart Pools": only pools with positive own stake, sorted biggest first
  const topPools = useMemo(() => {
    if (!poolsWithStats) {
      return undefined
    }
    return poolsWithStats
      .filter((p) => JSBI.greaterThan(JSBI.BigInt(p.poolOwnStake.toString()), JSBI.BigInt(0)))
      .sort(biggestOwnStakeFirst)
  }, [poolsWithStats])

  // Separate staked / non-staked pools, put user-staked first
  const [stakedPools, nonStakedPools] = topPools?.reduce<[PoolRegisteredLog[], PoolRegisteredLog[]]>(
    (acc, p) => {
      acc[p.userHasStake ? 0 : 1].push(p)
      return acc
    },
    [[], []],
  ) ?? [[], []]

  const orderedAllPools = useMemo(() => [...stakedPools, ...nonStakedPools], [stakedPools, nonStakedPools])

  // Apply chain filter
  const filteredOrderedPools = useMemo(() => {
    if (selectedChain === null) {
      return orderedAllPools
    }
    return orderedAllPools.filter((p) => p.chainId === selectedChain)
  }, [orderedAllPools, selectedChain])

  // "My Smart Pools": pools the user operates or holds tokens of only.
  // All data comes from the staking batch — zero additional RPC calls.
  const filteredMyPools = useMemo(() => {
    if (!account.address) {
      return undefined
    }
    // If no pools exist at all, the user has no pools to manage. Show the empty state instead of a loader.
    if (allPools && allPools.length === 0) {
      return []
    }
    if (!poolsWithStats) {
      return undefined
    }
    const myPools = poolsWithStats.filter((p) => {
      if (p.userIsOwner) {
        return true
      }
      if (p.userBalance) {
        try {
          return BigInt(p.userBalance) > 0n
        } catch {
          return false
        }
      }
      return false
    })
    if (selectedChain === null) {
      return myPools
    }
    return myPools.filter((p) => p.chainId === selectedChain)
  }, [allPools, poolsWithStats, account.address, selectedChain])

  // Tab options
  const tabOptions: SegmentedControlOption<EarnTab>[] = useMemo(
    () => [
      { value: EarnTab.AllPools, display: <Trans>Top Smart Pools</Trans> },
      { value: EarnTab.MyPools, display: <Trans>My Smart Pools</Trans> },
    ],
    [],
  )

  // Default tab: /earn/manage → My Pools, /earn → All Pools
  const [selectedTab, setSelectedTab] = useState<EarnTab>(isManagePath ? EarnTab.MyPools : EarnTab.AllPools)

  // Sync tab selection with URL changes (e.g. from navbar dropdown)
  useEffect(() => {
    setSelectedTab(isManagePath ? EarnTab.MyPools : EarnTab.AllPools)
  }, [isManagePath])

  // Update URL when tab changes
  const handleTabChange = useCallback(
    (tab: EarnTab) => {
      setSelectedTab(tab)
      navigate(tab === EarnTab.MyPools ? '/earn/manage' : '/earn', {
        replace: true,
      })
    },
    [navigate],
  )

  // The header action contains the Harvest button (when rewards are available)
  // followed by the Create button, so both tabs share the same layout.
  const headerAction = account.isConnected ? (
    <Flex row gap="$spacing8" alignItems="center">
      {harvestChains.length > 0 && (
        <Button
          size="xsmall"
          variant="branded"
          fill={false}
          onPress={() => setShowHarvestYieldModal(true)}
        >
          <Trans>Harvest</Trans>
        </Button>
      )}
      <Button
        size="xsmall"
        variant="branded"
        fill={false}
        icon={<Plus />}
        onPress={toggleCreateModal}
      >
        <Trans i18nKey="earn.create" />
      </Button>
    </Flex>
  ) : undefined

  return (
    <Trace logImpression page={InterfacePageName.PoolPage}>
      <PageWrapper gap="lg" justify="center">
        <AutoColumn gap="lg" style={{ width: '100%', maxWidth: '720px' }}>
          {/* Modals */}
          <CreateModal
            isOpen={createModalOpen}
            onDismiss={() => closeCreateModal()}
            title={<Trans>Create Smart Pool</Trans>}
          />
          <HarvestYieldModal
            isOpen={showHarvestYieldModal}
            chains={harvestChains}
            onDismiss={() => setShowHarvestYieldModal(false)}
            title={<Trans>Harvest</Trans>}
          />

          {/* Tab Selector + Chain Filter — always on one row */}
          <Flex row justifyContent="space-between" alignItems="center" gap="$spacing12">
            <Flex flex={1}>
              <SegmentedControl
                options={tabOptions}
                selectedOption={selectedTab}
                onSelectOption={handleTabChange}
                fullWidth
              />
            </Flex>
            <NetworkFilter
              includeAllNetworks
              selectedChain={selectedChain}
              onPressChain={setSelectedChain}
              chainIds={supportedChains}
              styles={{
                buttonPaddingY: '$spacing8',
              }}
            />
          </Flex>

          <MainContentWrapper>
            {selectedTab === EarnTab.MyPools ? (
              <PoolPositionList
                positions={filteredMyPools}
                allPositions={poolsWithStats}
                shouldFilterByUserPools={true}
                headerAction={headerAction}
              />
            ) : (
              <PoolPositionList
                positions={poolsWithStats === undefined ? undefined : filteredOrderedPools}
                allPositions={poolsWithStats}
                headerAction={headerAction}
              />
            )}
          </MainContentWrapper>
        </AutoColumn>
      </PageWrapper>
    </Trace>
  )
}
