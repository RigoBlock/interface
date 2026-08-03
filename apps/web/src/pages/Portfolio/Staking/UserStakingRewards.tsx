import { useMemo, useState } from 'react'
import { Trans } from 'react-i18next'
import { Button, Flex, Text } from 'ui/src'
import { TokenLogo } from 'uniswap/src/components/CurrencyLogo/TokenLogo'
import { getChainInfo } from 'uniswap/src/features/chains/chainInfo'
import { useEnabledChains } from 'uniswap/src/features/chains/hooks/useEnabledChains'
import { useLocalizationContext } from 'uniswap/src/features/language/LocalizationContext'
import HarvestYieldModal from '~/components/earn/HarvestYieldModal'
import { useAccount } from '~/hooks/useAccount'
import { RIGOBLOCK_SUPPORTED_CHAINS, RIGOBLOCK_TESTNET_CHAINS } from '~/constants/addresses'
import { useMultiChainAllPoolsData } from '~/state/pool/multichain'
import { useUnclaimedRewards, type UnclaimedReward } from '~/state/stake/hooks'

function UserRewardRow({ reward }: { reward: UnclaimedReward }) {
  const [showHarvestModal, setShowHarvestModal] = useState(false)
  const account = useAccount()
  const chainInfo = getChainInfo(reward.chainId)
  const { formatCurrencyAmount } = useLocalizationContext()

  const canHarvest = reward.chainId === account.chainId

  return (
    <Flex
      key={reward.chainId}
      backgroundColor="$surface1"
      borderRadius="$rounded12"
      flexDirection="row"
      alignItems="center"
      justifyContent="space-between"
      px="$spacing16"
      py="$spacing12"
      gap="$spacing12"
    >
      <Flex row alignItems="center" gap="$spacing8" width={120}>
        <TokenLogo chainId={reward.chainId} name="RigoBlock" symbol="GRG" size={24} />
        <Text variant="body2" color="$neutral1" numberOfLines={1}>
          {chainInfo.label}
        </Text>
      </Flex>

      <Flex alignItems="center" width={120}>
        <Text variant="body2" color="$neutral1" textAlign="right">
          {formatCurrencyAmount({ value: reward.yieldAmount })} GRG
        </Text>
      </Flex>

      {canHarvest ? (
        <Button size="small" variant="branded" fill={false} onPress={() => setShowHarvestModal(true)}>
          <Trans>Harvest</Trans>
        </Button>
      ) : (
        <Flex width={80} />
      )}

      <HarvestYieldModal
        isOpen={showHarvestModal}
        isPool={false}
        chains={[{ chainId: reward.chainId, yieldAmount: reward.yieldAmount, poolIds: [reward.poolId] }]}
        onDismiss={() => setShowHarvestModal(false)}
        title={<Trans>Harvest Your Yield</Trans>}
      />
    </Flex>
  )
}

interface UserStakingRewardsProps {
  farmer: string
}

export function UserStakingRewards({ farmer }: UserStakingRewardsProps) {
  const { isTestnetModeEnabled } = useEnabledChains()
  const chains = useMemo(
    () => (isTestnetModeEnabled ? RIGOBLOCK_TESTNET_CHAINS : RIGOBLOCK_SUPPORTED_CHAINS),
    [isTestnetModeEnabled],
  )
  const { data: allPools } = useMultiChainAllPoolsData(chains)
  const poolEntries = useMemo(
    () =>
      allPools
        ?.map((pool) => ({ poolId: pool.id, chainId: pool.chainId ?? 0 }))
        .filter((entry) => entry.chainId !== 0),
    [allPools],
  )
  const unclaimedRewards = useUnclaimedRewards({ farmer, pools: poolEntries })

  if (!unclaimedRewards || unclaimedRewards.length === 0) {
    return (
      <Flex gap="$spacing16">
        <Text variant="heading2" color="$neutral1">
          Your Rewards
        </Text>
        <Flex p="$spacing16" borderRadius="$rounded16" backgroundColor="$surface2">
          <Text variant="body2" color="$neutral2" textAlign="center">
            No unclaimed rewards
          </Text>
        </Flex>
      </Flex>
    )
  }

  return (
    <Flex gap="$spacing16">
      <Text variant="heading2" color="$neutral1">
        Your Rewards
      </Text>
      <Flex gap="$spacing4">
        <Flex
          flexDirection="row"
          alignItems="center"
          justifyContent="space-between"
          px="$spacing16"
          py="$spacing8"
          gap="$spacing12"
        >
          <Text variant="body3" color="$neutral3" width={120}>
            Chain
          </Text>
          <Text variant="body3" color="$neutral3" width={120} textAlign="right">
            Reward
          </Text>
          <Flex width={80} />
        </Flex>
        {unclaimedRewards.map((reward) => (
          <UserRewardRow key={reward.chainId} reward={reward} />
        ))}
      </Flex>
    </Flex>
  )
}
