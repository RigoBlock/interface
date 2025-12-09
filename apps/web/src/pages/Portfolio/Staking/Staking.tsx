import { CurrencyAmount, Token } from '@uniswap/sdk-core'
import { useMemo } from 'react'
import { useActiveSmartPool } from 'state/application/hooks'
import { usePoolIdByAddress } from 'state/governance/hooks'
import { useUnclaimedRewards, useUserStakeBalances, useTotalStakeBalance } from 'state/stake/hooks'
import { Flex, Text } from 'ui/src'
import { useActiveAddresses } from 'uniswap/src/features/accounts/store/hooks'
import { useEnabledChains } from 'uniswap/src/features/chains/hooks/useEnabledChains'
import { getChainInfo } from 'uniswap/src/features/chains/chainInfo'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { isTestnetChain } from 'uniswap/src/features/chains/utils'
import { STAKING_PROXY_ADDRESSES } from 'constants/addresses'
import { GRG } from 'uniswap/src/constants/tokens'
import JSBI from 'jsbi'

interface StakingRowProps {
  label: string
  amount?: CurrencyAmount<Token>
  isLoading?: boolean
}

function StakingRow({ label, amount, isLoading }: StakingRowProps) {
  return (
    <Flex row justifyContent="space-between" alignItems="center" py="$spacing12">
      <Text variant="body2" color="$neutral2">
        {label}
      </Text>
      <Text variant="body2" color="$neutral1">
        {isLoading ? 'Loading...' : amount ? `${amount.toSignificant(6)} ${amount.currency.symbol}` : '0.00 GRG'}
      </Text>
    </Flex>
  )
}

interface PoolStakingInfoProps {
  poolAddress: string
  poolId: string
  stakingPoolExists: boolean
}

function PoolStakingInfo({ poolAddress, poolId, stakingPoolExists }: PoolStakingInfoProps) {
  // Get unclaimed rewards for this specific pool
  const unclaimedRewards = useUnclaimedRewards([poolId])
  const poolRewards = unclaimedRewards?.[0]?.yieldAmount

  // Get user's stake delegated to this pool
  const userStakeBalances = useUserStakeBalances([poolId])
  const userStake = userStakeBalances?.[0]?.stake

  if (!stakingPoolExists) {
    return (
      <Flex p="$spacing16" borderRadius="$rounded16" backgroundColor="$surface2">
        <Text variant="heading3" mb="$spacing12" color="$neutral1">
          Smart Pool Staking
        </Text>
        <Text variant="body2" color="$neutral2">
          This smart pool ({poolAddress.slice(0, 6)}...{poolAddress.slice(-4)}) does not have a staking pool configured.
        </Text>
      </Flex>
    )
  }

  return (
    <Flex gap="$spacing16">
      <Flex p="$spacing16" borderRadius="$rounded16" backgroundColor="$surface2">
        <Text variant="heading3" mb="$spacing12" color="$neutral1">
          Smart Pool Staking
        </Text>
        <Text variant="body3" mb="$spacing16" color="$neutral2">
          Pool: {poolAddress.slice(0, 6)}...{poolAddress.slice(-4)} (ID: {poolId})
        </Text>
        
        <StakingRow 
          label="Your Delegated Stake" 
          amount={userStake} 
        />
        <StakingRow 
          label="Unclaimed Rewards" 
          amount={poolRewards} 
        />
      </Flex>
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

function useMultiChainStakingData(address?: string, smartPoolAddress?: string): ChainStakingData[] {
  const { chains, isTestnetModeEnabled } = useEnabledChains()
  
  // Filter to only chains that have staking contracts
  const stakingChains = useMemo(() => {
    return chains.filter(chainId => {
      const hasStakingContract = STAKING_PROXY_ADDRESSES[chainId]
      const isTestnet = isTestnetChain(chainId)
      return hasStakingContract && (isTestnet === isTestnetModeEnabled)
    })
  }, [chains, isTestnetModeEnabled])
  
  // Get staking data for each chain
  const stakingDataMap = useMemo(() => {
    const results: ChainStakingData[] = []
    
    stakingChains.forEach(chainId => {
      const chainInfo = getChainInfo(chainId)
      const grg = GRG[chainId]
      
      if (!grg) return
      
      const data: ChainStakingData = {
        chainId,
        chainName: chainInfo.label,
        userFreeStake: undefined,
        userDelegatedStake: undefined,
        smartPoolFreeStake: undefined,
        smartPoolDelegatedStake: undefined,
        smartPoolTotalStake: undefined,
      }
      
      results.push(data)
    })
    
    return results
  }, [stakingChains])
  
  return stakingDataMap
}

function ChainStakingRow({ 
  data, 
  address, 
  smartPoolAddress, 
  showSmartPoolStake 
}: { 
  data: ChainStakingData
  address?: string
  smartPoolAddress?: string
  showSmartPoolStake?: boolean 
}) {
  const { userFreeStake, userDelegatedStake, smartPoolFreeStake, smartPoolDelegatedStake } = useTotalStakeBalance({
    address, 
    smartPoolAddress,
    chainId: data.chainId
  })
  
  const grg = useMemo(() => GRG[data.chainId], [data.chainId])
  const smartPoolTotalStake = useMemo(() => {
    if (!showSmartPoolStake || !smartPoolFreeStake || !smartPoolDelegatedStake || !grg) return undefined
    
    const total = JSBI.add(smartPoolFreeStake.quotient, smartPoolDelegatedStake.quotient)
    return CurrencyAmount.fromRawAmount(grg, total)
  }, [showSmartPoolStake, smartPoolFreeStake, smartPoolDelegatedStake, grg])
  
  const hasAnyStake = userFreeStake?.greaterThan(0) || 
                      userDelegatedStake?.greaterThan(0) || 
                      smartPoolTotalStake?.greaterThan(0)
  
  if (!hasAnyStake) return null
  
  return (
    <Flex p="$spacing12" borderRadius="$rounded12" backgroundColor="$surface3" gap="$spacing8">
      <Text variant="body1" fontWeight="600" color="$neutral1">
        {data.chainName}
      </Text>
      
      {userFreeStake?.greaterThan(0) && (
        <StakingRow label="Free Stake" amount={userFreeStake} />
      )}
      
      {userDelegatedStake?.greaterThan(0) && (
        <StakingRow label="Delegated Stake" amount={userDelegatedStake} />
      )}
      
      {showSmartPoolStake && smartPoolTotalStake?.greaterThan(0) && (
        <StakingRow label="Smart Pool Total Stake" amount={smartPoolTotalStake} />
      )}
    </Flex>
  )
}

function MultiChainStakingInfo({ address, smartPoolAddress }: { address?: string; smartPoolAddress?: string }) {
  const stakingData = useMultiChainStakingData(address, smartPoolAddress)
  
  if (stakingData.length === 0) {
    return (
      <Flex p="$spacing16" borderRadius="$rounded16" backgroundColor="$surface2">
        <Text variant="body2" color="$neutral2" textAlign="center">
          No staking contracts found on supported networks
        </Text>
      </Flex>
    )
  }
  
  return (
    <Flex p="$spacing16" borderRadius="$rounded16" backgroundColor="$surface2" gap="$spacing12">
      <Text variant="heading3" mb="$spacing12" color="$neutral1">
        {smartPoolAddress ? 'Smart Pool Staking by Chain' : 'Your Staking by Chain'}
      </Text>
      
      {stakingData.map(data => (
        <ChainStakingRow 
          key={data.chainId}
          data={data}
          address={address}
          smartPoolAddress={smartPoolAddress}
          showSmartPoolStake={!!smartPoolAddress}
        />
      ))}
    </Flex>
  )
}

export function PortfolioStaking() {
  const activeAddress = useActiveAddresses().evmAddress
  // TODO: if the url contains param "address", show staking info for that address
  const [paramAddress] = new URLSearchParams(window.location.search).getAll('address')
  const activeSmartPool = useActiveSmartPool()
  // TODO: the paramAddress could be the user address when coming from the account drawer, check if it's a smart pool address
  const smartPoolAddress = paramAddress || (activeSmartPool?.address ?? undefined)
  
  // Get pool ID if we're viewing from a smart pool context
  const { poolId, stakingPoolExists } = usePoolIdByAddress(smartPoolAddress || '')

  return (
    <Flex gap="$spacing24" p="$spacing16">
      <Text variant="heading1" color="$neutral1">
        Staking
      </Text>
      
      {!activeAddress ? (
        <Flex p="$spacing16" borderRadius="$rounded16" backgroundColor="$surface2" alignItems="center">
          <Text variant="body1" color="$neutral2">
            Connect your wallet to view staking information
          </Text>
        </Flex>
      ) : (
        <>
          <MultiChainStakingInfo 
            address={activeAddress} 
            smartPoolAddress={smartPoolAddress} 
          />
          
          {smartPoolAddress && poolId && (
            <PoolStakingInfo 
              poolAddress={smartPoolAddress}
              poolId={poolId}
              stakingPoolExists={stakingPoolExists}
            />
          )}

          {(!smartPoolAddress) && (
            <Flex p="$spacing16" borderRadius="$rounded16" backgroundColor="$surface3">
              <Text variant="body2" color="$neutral2" textAlign="center">
                Navigate to a smart pool to see pool-specific staking information, or view your general staking overview above.
              </Text>
            </Flex>
          )}
        </>
      )}
    </Flex>
  )
}