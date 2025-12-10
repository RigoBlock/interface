import { CurrencyAmount, Token } from '@uniswap/sdk-core'
import { STAKING_PROXY_ADDRESSES } from 'constants/addresses'
import JSBI from 'jsbi'
import { usePortfolioAddresses } from 'pages/Portfolio/hooks/usePortfolioAddresses'
import { usePortfolioStaking } from 'pages/Portfolio/hooks/usePortfolioStaking'
import { useMemo } from 'react'
import { useActiveSmartPool } from 'state/application/hooks'
import { useMultichainContext } from 'state/multichain/useMultichainContext'
import { usePoolIdByAddress } from 'state/governance/hooks'
import { useTotalStakeBalances, useUnclaimedRewards, useUserStakeBalances } from 'state/stake/hooks'
import { Flex, Shine, Text, useMedia } from 'ui/src'
import { TokenLogo } from 'uniswap/src/components/CurrencyLogo/TokenLogo'
import { GRG } from 'uniswap/src/constants/tokens'
import { getChainInfo } from 'uniswap/src/features/chains/chainInfo'
import { useEnabledChains } from 'uniswap/src/features/chains/hooks/useEnabledChains'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { isTestnetChain } from 'uniswap/src/features/chains/utils'
import { useLocalizationContext } from 'uniswap/src/features/language/LocalizationContext'
import { useUSDCValue } from 'uniswap/src/features/transactions/hooks/useUSDCPrice'
import { NumberType } from 'utilities/src/format/types'

interface ChainStakingRowProps {
  chainId: UniverseChainId
  chainName: string
  userFreeStake?: CurrencyAmount<Token>
  userDelegatedStake?: CurrencyAmount<Token>
  smartPoolTotalStake?: CurrencyAmount<Token>
  isLoading?: boolean
}

function ChainStakingRow({
  chainId,
  chainName,
  userFreeStake,
  userDelegatedStake,
  smartPoolTotalStake,
  isLoading,
}: ChainStakingRowProps) {
  const { convertFiatAmountFormatted, formatNumberOrString } = useLocalizationContext()
  const media = useMedia()

  // Calculate total stake for this chain
  const totalStake = useMemo(() => {
    if (!userFreeStake && !userDelegatedStake && !smartPoolTotalStake) return undefined

    const grg = GRG[chainId]
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!grg) return undefined

    let total = JSBI.BigInt(0)
    if (userFreeStake) total = JSBI.add(total, userFreeStake.quotient)
    if (userDelegatedStake) total = JSBI.add(total, userDelegatedStake.quotient)
    if (smartPoolTotalStake) total = JSBI.add(total, smartPoolTotalStake.quotient)

    return CurrencyAmount.fromRawAmount(grg, total)
  }, [chainId, userFreeStake, userDelegatedStake, smartPoolTotalStake])

  // Get USD value for the total
  // Get USD value using mainnet GRG for consistent pricing across chains
  const mainnetGRG = GRG[UniverseChainId.Mainnet]
  const usdValue = useUSDCValue(
    totalStake
      ? CurrencyAmount.fromRawAmount(mainnetGRG, totalStake.quotient) 
      : totalStake
  )
  const usdFormatted = convertFiatAmountFormatted(usdValue?.toExact(), NumberType.PortfolioBalance)

  const hasAnyStake =
    (userFreeStake && userFreeStake.greaterThan(0)) || 
    (userDelegatedStake && userDelegatedStake.greaterThan(0)) || 
    (smartPoolTotalStake && smartPoolTotalStake.greaterThan(0))

  if (!hasAnyStake) return null

  const formatAmount = (amount?: CurrencyAmount<Token>) => {
    return amount && amount.greaterThan(0) ? formatNumberOrString({ value: amount.toSignificant(6) }) : '—'
  }

  const formatTotal = (amount?: CurrencyAmount<Token>) => {
    return amount && amount.greaterThan(0) ? `${formatNumberOrString({ value: amount.toSignificant(6) })} GRG` : '—'
  }

  return (
    <Flex
      backgroundColor="$surface1"
      borderRadius="$rounded12"
      flexDirection="row"
      alignItems="center"
      justifyContent="space-between"
      hoverStyle={{ backgroundColor: '$surface2' }}
      px="$spacing16"
      py="$spacing12"
      gap="$spacing12"
    >
      {/* Chain Name */}
      <Flex row alignItems="center" gap="$spacing8" width={120}>
        <TokenLogo chainId={chainId} name="RigoBlock" symbol="GRG" size={24} />
        <Text variant="body2" color="$neutral1" numberOfLines={1}>
          {chainName}
        </Text>
      </Flex>

      {/* Free Stake */}
      <Flex alignItems="center" width={100}>
        <Shine disabled={!isLoading}>
          <Text variant="body2" color="$neutral2" textAlign="right">
            {formatAmount(userFreeStake)}
          </Text>
        </Shine>
      </Flex>

      {/* Delegated Stake */}
      <Flex alignItems="center" width={100}>
        <Shine disabled={!isLoading}>
          <Text variant="body2" color="$neutral2" textAlign="right">
            {formatAmount(userDelegatedStake || smartPoolTotalStake)}
          </Text>
        </Shine>
      </Flex>

      {/* Total */}
      <Flex alignItems="center" width={120}>
        <Shine disabled={!isLoading}>
          <Text variant="body2" color="$neutral1" textAlign="right">
            {formatTotal(totalStake)}
          </Text>
        </Shine>
      </Flex>

      {/* Value (USD) */}
      <Flex alignItems="center" width={100}>
        <Shine disabled={!isLoading}>
          <Text variant={media.sm ? 'body3' : 'body2'} color="$neutral1" textAlign="right">
            {usdFormatted || '—'}
          </Text>
        </Shine>
      </Flex>
    </Flex>
  )
}

function ChainStakingRowWithData({
  chainId,
  chainName,
  address,
  smartPoolAddress,
  cachedData,
}: {
  chainId: UniverseChainId
  chainName: string
  address?: string
  smartPoolAddress?: string
  cachedData?: any // StakingData from new hook
}) {
  // Check if we have valid cached data from the new hook structure
  const shouldUseCachedData = cachedData && 
    !cachedData.isLoading && 
    !cachedData.error &&
    (cachedData.userFreeStake !== undefined || 
     cachedData.userDelegatedStake !== undefined ||
     cachedData.smartPoolFreeStake !== undefined ||
     cachedData.smartPoolDelegatedStake !== undefined)
  
  // Get staking data for this specific chain (only if no cached data)
  const hookData = useTotalStakeBalances({
    address: shouldUseCachedData ? undefined : address,
    smartPoolAddress: shouldUseCachedData ? undefined : smartPoolAddress, 
    chainId,
  })
  
  // Use cached data or hook data
  const { userFreeStake, userDelegatedStake, smartPoolFreeStake, smartPoolDelegatedStake } = shouldUseCachedData
    ? {
        // Use data directly from StakingData interface (already deserialized CurrencyAmount objects)
        userFreeStake: cachedData.userFreeStake,
        userDelegatedStake: cachedData.userDelegatedStake,
        smartPoolFreeStake: cachedData.smartPoolFreeStake,
        smartPoolDelegatedStake: cachedData.smartPoolDelegatedStake,
      }
    : hookData

  // For smart pool context, show the smart pool's total stake as "delegated"
  const displayedDelegatedStake = smartPoolAddress
    ? smartPoolFreeStake && smartPoolDelegatedStake
      ? CurrencyAmount.fromRawAmount(
          smartPoolFreeStake.currency,
          JSBI.add(smartPoolFreeStake.quotient, smartPoolDelegatedStake.quotient),
        )
      : smartPoolFreeStake || smartPoolDelegatedStake
    : userDelegatedStake

  // When viewing smart pool context, don't show user's free stake (since it's not relevant to the smart pool)
  const displayedFreeStake = smartPoolAddress ? undefined : userFreeStake

  return (
    <ChainStakingRow
      chainId={chainId}
      chainName={chainName}
      userFreeStake={displayedFreeStake}
      userDelegatedStake={displayedDelegatedStake}
      smartPoolTotalStake={undefined}
    />
  )
}

interface PoolStakingInfoProps {
  poolAddress: string
  poolId: string
  stakingPoolExists: boolean
}

function PoolStakingInfo({ poolAddress, poolId, stakingPoolExists }: PoolStakingInfoProps) {
  // TODO: we should modify the hook to accept chainId as param, and run loop for the supported chains
  // Get unclaimed rewards for this specific pool
  const unclaimedRewards = useUnclaimedRewards([poolId])
  const poolRewards = unclaimedRewards?.[0]?.yieldAmount

  // Get user's stake delegated to this pool
  const userStakeBalances = useUserStakeBalances([poolId])
  const userStake = userStakeBalances?.[0]?.stake

  const { chainId } = useMultichainContext()
  const chainInfo = chainId && getChainInfo(chainId)

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

  const hasRewards = poolRewards?.greaterThan(0)
  const hasStake = userStake?.greaterThan(0)

  if (!hasRewards && !hasStake) {
    return (
      <Flex gap="$spacing16">
        <Text variant="heading2" color="$neutral1">
          Pool Rewards
        </Text>
        <Flex p="$spacing16" borderRadius="$rounded16" backgroundColor="$surface2">
          <Text variant="body2" color="$neutral2" textAlign="center">
            No stake or rewards found for this pool
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

      {chainId && chainInfo && (
        <Flex gap="$spacing8">
          {hasStake && (
            <ChainStakingRow
              chainId={chainId}
              chainName={chainInfo.label}
              userFreeStake={undefined}
              userDelegatedStake={userStake}
              smartPoolTotalStake={undefined}
            />
          )}
          {hasRewards && (
            <ChainStakingRow
              chainId={chainId}
              chainName={chainInfo.label}
              userFreeStake={poolRewards}
              userDelegatedStake={undefined}
              smartPoolTotalStake={undefined}
            />
          )}
        </Flex>
      )}
    </Flex>
  )
}

interface ChainStakingData {
  chainId: UniverseChainId
  chainName: string
  userFreeStake?: CurrencyAmount<Token>
  userDelegatedStake?: CurrencyAmount<Token>
  smartPoolFreeStake?: CurrencyAmount<Token>
  smartPoolDelegatedStake?: CurrencyAmount<Token>
  smartPoolTotalStake?: CurrencyAmount<Token>
}

function useMultiChainStakingData(address?: string, smartPoolAddress?: string) {
  const { chains: enabledChains, isTestnetModeEnabled } = useEnabledChains()

  // Filter to only chains that have staking contracts
  const stakingChains = useMemo(() => {
    return enabledChains.filter((chainId) => {
      const hasStakingContract = STAKING_PROXY_ADDRESSES[chainId]
      const isTestnet = isTestnetChain(chainId)
      return hasStakingContract && isTestnet === isTestnetModeEnabled
    })
  }, [enabledChains, isTestnetModeEnabled])

  // Get staking data for all supported chains
  const chainStakingData = useMemo(() => {
    return stakingChains
      .map((chainId) => {
        const chainInfo = getChainInfo(chainId)
        const grg = GRG[chainId]

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!grg) return null

        return {
          chainId,
          chainName: chainInfo.label,
          grg,
        }
      })
      .filter((chain): chain is { chainId: UniverseChainId; chainName: string; grg: Token } => chain !== null)
  }, [stakingChains])

  return chainStakingData
}

function MultiChainStakingInfo({ address, smartPoolAddress }: { address?: string; smartPoolAddress?: string }) {
  const { stakingData, stakingChains, hasAnyStake, isLoading, totalStakeUSD, isViewingOwnStakes } = usePortfolioStaking({ address })
  const { convertFiatAmountFormatted } = useLocalizationContext()

  if (!address || stakingChains.length === 0) {
    return (
      <Flex gap="$spacing16">
        <Text variant="heading2" color="$neutral1">
          {isViewingOwnStakes ? 'Your Stake' : 'Smart Pool Stake'}
        </Text>
        <Flex p="$spacing16" borderRadius="$rounded16" backgroundColor="$surface2">
          <Text variant="body2" color="$neutral2" textAlign="center">
            No staking contracts found for the current network mode.
          </Text>
        </Flex>
      </Flex>
    )
  }

  if (!hasAnyStake && !isLoading) {
    return (
      <Flex gap="$spacing16">
        <Text variant="heading2" color="$neutral1">
          {isViewingOwnStakes ? 'Your Stake' : 'Smart Pool Stake'}
        </Text>
        <Flex p="$spacing16" borderRadius="$rounded16" backgroundColor="$surface2">
          <Text variant="body2" color="$neutral2" textAlign="center">
            No staking balances found
          </Text>
        </Flex>
      </Flex>
    )
  }

  return (
    <Flex gap="$spacing16">
      {/* Total USD Value at top */}
      <Flex>
        {isLoading ? (
          <Text variant="heading1" color="$neutral3">
            {convertFiatAmountFormatted(0, NumberType.PortfolioBalance)}
          </Text>
        ) : (
          <Text variant="heading1" color="$neutral1">
            {convertFiatAmountFormatted(
              totalStakeUSD ? parseFloat(totalStakeUSD.toExact()) : 0,
              NumberType.PortfolioBalance
            )}
          </Text>
        )}
        <Text variant="subheading1" color="$neutral2" mt="$spacing8">
          {isViewingOwnStakes ? 'Your Stake' : 'Smart Pool Stake'}
        </Text>
      </Flex>

      <Flex gap="$spacing4">
        {/* Column Headers */}
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
          <Text variant="body3" color="$neutral3" width={100} textAlign="right">
            Free Stake
          </Text>
          <Text variant="body3" color="$neutral3" width={100} textAlign="right">
            Locked Stake
          </Text>
          <Text variant="body3" color="$neutral3" width={120} textAlign="right">
            Total
          </Text>
          <Text variant="body3" color="$neutral3" width={100} textAlign="right">
            Value
          </Text>
        </Flex>

        {/* Stake Rows */}
        {stakingChains.map((chainId) => {
          const chainInfo = getChainInfo(chainId)
          const data = stakingData[chainId]
          
          return (
            <ChainStakingRowWithData
              key={chainId}
              chainId={chainId}
              chainName={chainInfo.label}
              address={address}
              smartPoolAddress={smartPoolAddress}
              cachedData={data}
            />
          )
        })}
      </Flex>
    </Flex>
  )
}

export function PortfolioStaking() {
  const { evmAddress } = usePortfolioAddresses()
  const [paramAddress] = new URLSearchParams(window.location.search).getAll('address')
  const activeSmartPool = useActiveSmartPool()
  // TODO: the paramAddress could be the user address when coming from the account drawer, check if it's a smart pool address
  const smartPoolAddress = paramAddress || (activeSmartPool.address ?? undefined)

  // Get pool ID if we're viewing from a smart pool context
  const { poolId, stakingPoolExists } = usePoolIdByAddress(smartPoolAddress || '')

  return (
    <Flex gap="$spacing24" p="$spacing16">
      {!evmAddress ? (
        <Flex p="$spacing16" borderRadius="$rounded16" backgroundColor="$surface2" alignItems="center">
          <Text variant="body1" color="$neutral2">
            Connect your wallet to view staking information
          </Text>
        </Flex>
      ) : (
        <>
          <MultiChainStakingInfo address={evmAddress} smartPoolAddress={smartPoolAddress} />

          {smartPoolAddress && poolId && (
            <PoolStakingInfo poolAddress={smartPoolAddress} poolId={poolId} stakingPoolExists={stakingPoolExists} />
          )}

          {!smartPoolAddress && (
            <Flex p="$spacing16" borderRadius="$rounded16" backgroundColor="$surface3">
              <Text variant="body2" color="$neutral2" textAlign="center">
                Navigate to a smart pool to see pool-specific staking information, or view your general staking overview
                above.
              </Text>
            </Flex>
          )}
        </>
      )}
    </Flex>
  )
}
