import { CurrencyAmount, Token } from '@uniswap/sdk-core'
import { useAccountDrawer } from 'components/AccountDrawer/MiniPortfolio/hooks'
import { ButtonPrimary } from 'components/Button/buttons'
import CreateModal from 'components/createPool/CreateModal'
import { AutoColumn } from 'components/deprecated/Column'
import { RowBetween } from 'components/deprecated/Row'
import HarvestYieldModal from 'components/earn/HarvestYieldModal'
import RaceModal from 'components/earn/RaceModal'
import { CardBGImage, CardNoise, CardSection, DataCard } from 'components/earn/styled'
import UnstakeModal from 'components/earn/UnstakeModal'

import PoolPositionList from 'components/PoolPositionList'
import { RIGOBLOCK_SUPPORTED_CHAINS, RIGOBLOCK_TESTNET_CHAINS } from 'constants/addresses'
import { useAccount } from 'hooks/useAccount'
import { useModalState } from 'hooks/useModalState'
import JSBI from 'jsbi'
import styled from 'lib/styled-components'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Trans } from 'react-i18next'

import { useLocation, useNavigate } from 'react-router'
import { PoolRegisteredLog } from 'state/pool/hooks'
import {
  useMultiChainAllPoolsData,
  useMultiChainStakingPools,
} from 'state/pool/multichain'
import { ThemedText } from 'theme/components/text'
import { Flex, SegmentedControl, SegmentedControlOption } from 'ui/src'
import { NetworkFilter } from 'uniswap/src/components/network/NetworkFilter'
import { useEnabledChains } from 'uniswap/src/features/chains/hooks/useEnabledChains'
import { GRG } from 'uniswap/src/constants/tokens'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { ElementName, InterfaceEventName, InterfacePageName, ModalName } from 'uniswap/src/features/telemetry/constants'
import Trace from 'uniswap/src/features/telemetry/Trace'

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

const MainContentWrapper = styled.main`
  background-color: ${({ theme }) => theme.surface1};
  border: 1px solid ${({ theme }) => theme.surface3};
  padding: 0;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  box-shadow: 0px 0px 1px rgba(0, 0, 0, 0.01), 0px 4px 8px rgba(0, 0, 0, 0.04), 0px 16px 24px rgba(0, 0, 0, 0.04),
    0px 24px 32px rgba(0, 0, 0, 0.01);
`

/** Fixed-height action bar so tabs don't shift when buttons appear/disappear */
const ActionBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-height: 40px;
  gap: 8px;
`

enum EarnTab {
  AllPools = 'all',
  MyPools = 'my',
}

function biggestOwnStakeFirst(a: any, b: any) {
  return b.poolOwnStake - a.poolOwnStake
}

export default function Earn() {
  const { isOpen: createModalOpen, closeModal: closeCreateModal, toggleModal: toggleCreateModal } = useModalState(ModalName.CreateVault)
  const [showHarvestYieldModal, setShowHarvestYieldModal] = useState(false)
  const [showUnstakeModal, setShowUnstakeModal] = useState(false)
  const [racePool, setRacePool] = useState<{ address: string; name: string } | null>(null)

  const onRaceClick = useCallback((poolAddress: string, poolName: string) => {
    setRacePool({ address: poolAddress, name: poolName })
  }, [])

  const account = useAccount()
  const accountDrawer = useAccountDrawer()
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
  // Includes freeStakeBalance + unclaimedRewards for the connected chain.
  const {
    stakingPools,
    freeStakeBalance,
    unclaimedRewards,
  } = useMultiChainStakingPools(allPools ?? [])

  const grg = useMemo(() => (account.chainId ? GRG[account.chainId] : undefined), [account.chainId])
  const hasFreeStake = JSBI.greaterThan(freeStakeBalance ? freeStakeBalance.quotient : JSBI.BigInt(0), JSBI.BigInt(0))

  // Yield amount for Harvest button
  const yieldAmount: CurrencyAmount<Token> | undefined = useMemo(() => {
    if (!grg || unclaimedRewards.length === 0) {
      return undefined
    }
    const yieldBigint = unclaimedRewards
      .map((r) => r.amount.quotient)
      .reduce((acc, value) => JSBI.add(acc, value))
    return CurrencyAmount.fromRawAmount(grg, yieldBigint)
  }, [grg, unclaimedRewards])

  const farmingPoolIds = useMemo(() => {
    const ids = unclaimedRewards.map((r) => r.poolId)
    return ids.length > 0 ? ids : undefined
  }, [unclaimedRewards])

  // Pools enriched with staking stats
  const poolsWithStats = useMemo(() => {
    if (!allPools || !stakingPools) {
      return undefined
    }
    return allPools
      .map((p, i) => {
        const s = stakingPools[i]
        return {
          ...p,
          irr: s.irr,
          apr: s.apr,
          poolOwnStake: s.poolOwnStake,
          poolDelegatedStake: s.delegatedStake,
          userHasStake: s.userHasStake,
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
      acc[p.userHasStake ? 1 : 0].push(p)
      return acc
    },
    [[], []],
  ) ?? [[], []]

  const orderedAllPools = useMemo(() => [...nonStakedPools, ...stakedPools], [stakedPools, nonStakedPools])

  // Apply chain filter
  const filteredOrderedPools = useMemo(() => {
    if (selectedChain === null) {
      return orderedAllPools
    }
    return orderedAllPools.filter((p) => p.chainId === selectedChain)
  }, [orderedAllPools, selectedChain])

  // "My Smart Pools": ALL pools (no own-stake filter — owner/holder needs access)
  const filteredMyPools = useMemo(() => {
    if (!poolsWithStats) {
      return undefined
    }
    if (selectedChain === null) {
      return poolsWithStats
    }
    return poolsWithStats.filter((p) => p.chainId === selectedChain)
  }, [poolsWithStats, selectedChain])

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
      navigate(tab === EarnTab.MyPools ? '/earn/manage' : '/earn', { replace: true })
    },
    [navigate],
  )

  // Whether to show the action bar (only when there are buttons)
  const showActionBar =
    !account.isConnected ||
    (selectedTab === EarnTab.AllPools && (!!yieldAmount || hasFreeStake))

  return (
    <Trace logImpression page={InterfacePageName.PoolPage}>
      <PageWrapper gap="lg" justify="center">
        <TopSection gap="md">
          <DataCard>
            <CardBGImage />
            <CardNoise />
            <CardSection>
              <AutoColumn gap="md">
                <RowBetween>
                  <ThemedText.DeprecatedWhite fontWeight={600}>
                    <Trans>Smart Pools</Trans>
                  </ThemedText.DeprecatedWhite>
                  {account.isConnected && (
                    <ButtonPrimary
                      style={{ width: 'fit-content', height: '36px', whiteSpace: 'nowrap' }}
                      padding="6px 12px"
                      $borderRadius="8px"
                      onClick={toggleCreateModal}
                    >
                      <Trans>Create</Trans>
                    </ButtonPrimary>
                  )}
                </RowBetween>
                <RowBetween>
                  <ThemedText.DeprecatedWhite fontSize={14}>
                    <Trans>Your smart interface with DeFi. Create, swap, earn on your tokens.</Trans>
                  </ThemedText.DeprecatedWhite>
                </RowBetween>{' '}
              </AutoColumn>
            </CardSection>
            <CardBGImage />
            <CardNoise />
          </DataCard>
        </TopSection>

        <AutoColumn gap="lg" style={{ width: '100%', maxWidth: '720px' }}>
          {/* Modals */}
          <CreateModal isOpen={createModalOpen} onDismiss={() => closeCreateModal()} title={<Trans>Create Smart Pool</Trans>} />
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
          <RaceModal
            isOpen={!!racePool}
            poolAddress={racePool?.address}
            poolName={racePool?.name}
            onDismiss={() => setRacePool(null)}
            title={<Trans>Race</Trans>}
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

          {/* Action buttons — only shown when relevant */}
          {showActionBar && <ActionBar>
            {account.isConnected ? (
              <>
                {selectedTab === EarnTab.AllPools && yieldAmount && (
                  <ButtonPrimary
                    style={{ width: 'fit-content', height: '40px' }}
                    padding="8px"
                    $borderRadius="8px"
                    onClick={() => setShowHarvestYieldModal(true)}
                  >
                    <Trans>Harvest</Trans>
                  </ButtonPrimary>
                )}
                {selectedTab === EarnTab.AllPools && hasFreeStake && (
                  <ButtonPrimary
                    style={{ width: 'fit-content', height: '40px' }}
                    padding="8px"
                    $borderRadius="8px"
                    onClick={() => setShowUnstakeModal(true)}
                  >
                    <Trans>Unstake</Trans>
                  </ButtonPrimary>
                )}
              </>
            ) : (
              <Trace
                logPress
                eventOnTrigger={InterfaceEventName.ConnectWalletButtonClicked}
                properties={{ received_swap_quote: false }}
                element={ElementName.ConnectWalletButton}
              >
                <ButtonPrimary
                  style={{ padding: '8px 16px' }}
                  onClick={accountDrawer.open}
                >
                  <Trans i18nKey="common.connectAWallet.button" />
                </ButtonPrimary>
              </Trace>
            )}
          </ActionBar>}

          <MainContentWrapper>
            {selectedTab === EarnTab.MyPools ? (
              <PoolPositionList positions={filteredMyPools} shouldFilterByUserPools={true} onRaceClick={onRaceClick} />
            ) : (
              <PoolPositionList positions={filteredOrderedPools.length > 0 ? filteredOrderedPools : undefined} onRaceClick={onRaceClick} />
            )}
          </MainContentWrapper>
        </AutoColumn>
      </PageWrapper>
    </Trace>
  )
}
