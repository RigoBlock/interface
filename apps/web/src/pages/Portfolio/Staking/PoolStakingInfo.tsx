import { useMemo, useState } from 'react'
import { Trans } from 'react-i18next'
import { Button, Flex, Text } from 'ui/src'
import { TokenLogo } from 'uniswap/src/components/CurrencyLogo/TokenLogo'
import { getChainInfo } from 'uniswap/src/features/chains/chainInfo'
import { useLocalizationContext } from 'uniswap/src/features/language/LocalizationContext'
import { Platform } from 'uniswap/src/features/platforms/types/Platform'
import { areAddressesEqual } from 'uniswap/src/utils/addresses'
import HarvestYieldModal from '~/components/earn/HarvestYieldModal'
import { useAccount } from '~/hooks/useAccount'
import { useSmartPoolFromAddress } from '~/hooks/useSmartPools'
import { usePoolIdsByAddressAcrossChains } from '~/state/pool/multichain'
import { useUnclaimedRewards, type UnclaimedReward } from '~/state/stake/hooks'

function PoolRewardRow({
  reward,
  poolAddress,
  isOperator,
}: {
  reward: UnclaimedReward
  poolAddress: string
  isOperator: boolean
}) {
  const [showHarvestModal, setShowHarvestModal] = useState(false)
  const account = useAccount()
  const chainInfo = getChainInfo(reward.chainId)
  const { formatCurrencyAmount } = useLocalizationContext()

  // Harvest can only be executed on the currently connected chain.
  const canHarvest = isOperator && reward.chainId === account.chainId

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
        isPool={true}
        poolAddress={poolAddress}
        chains={[{ chainId: reward.chainId, yieldAmount: reward.yieldAmount, poolIds: [reward.poolId] }]}
        onDismiss={() => setShowHarvestModal(false)}
        title={<Trans>Harvest Pool Yield</Trans>}
      />
    </Flex>
  )
}

interface PoolStakingInfoProps {
  poolAddress: string
  stakingPoolExists: boolean
}

export function PoolStakingInfo({ poolAddress, stakingPoolExists }: PoolStakingInfoProps) {
  const poolEntries = usePoolIdsByAddressAcrossChains(poolAddress)
  const unclaimedRewards = useUnclaimedRewards({ farmer: poolAddress, pools: poolEntries })
  const account = useAccount()
  const poolStorage = useSmartPoolFromAddress(poolAddress, account.chainId)
  const isOperator = useMemo(
    () =>
      !!account.address &&
      !!poolStorage?.poolInitParams.owner &&
      areAddressesEqual({
        addressInput1: { address: account.address, platform: Platform.EVM },
        addressInput2: { address: poolStorage.poolInitParams.owner, platform: Platform.EVM },
      }),
    [account.address, poolStorage],
  )

  if (!stakingPoolExists) {
    return (
      <Flex gap="$spacing16">
        <Text variant="heading2" color="$neutral1">
          Pool Rewards
        </Text>
        <Flex p="$spacing16" borderRadius="$rounded16" backgroundColor="$surface2">
          <Text variant="body2" color="$neutral2">
            This smart pool ({poolAddress.slice(0, 6)}...{poolAddress.slice(-4)}) does not have a staking pool
            configured.
          </Text>
        </Flex>
      </Flex>
    )
  }

  if (!unclaimedRewards || unclaimedRewards.length === 0) {
    return (
      <Flex gap="$spacing16">
        <Text variant="heading2" color="$neutral1">
          Pool Rewards
        </Text>
        <Flex p="$spacing16" borderRadius="$rounded16" backgroundColor="$surface2">
          <Text variant="body2" color="$neutral2" textAlign="center">
            No pool rewards found
          </Text>
        </Flex>
      </Flex>
    )
  }

  return (
    <Flex gap="$spacing16">
      <Text variant="heading2" color="$neutral1">
        Pool Rewards
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
          <PoolRewardRow
            key={reward.chainId}
            reward={reward}
            poolAddress={poolAddress}
            isOperator={isOperator}
          />
        ))}
      </Flex>
    </Flex>
  )
}
