import Loader from 'components/Icons/LoadingSpinner'
import { RowFixed } from 'components/deprecated/Row'
import PoolPositionListItem from 'components/PoolPositionListItem'
import { MouseoverTooltip } from 'components/Tooltip'
import { useAccount } from 'hooks/useAccount'
import { Trans } from 'react-i18next'
import { useMultipleContractSingleData } from 'lib/hooks/multicall'
import React, { useMemo, useEffect } from 'react'
import { AbiCoder } from '@ethersproject/abi'
import { BigNumber } from '@ethersproject/bignumber'
import { getAddress } from '@ethersproject/address'
import { keccak256 } from '@ethersproject/keccak256'
import { Info } from 'react-feather'
import { PoolInterface, useStakingPoolsRewards } from 'state/pool/hooks'
import styled from 'lib/styled-components'
import { MEDIA_WIDTHS } from 'theme'
import { PoolPositionDetails } from 'types/position'
import { Flex, Text } from 'ui/src'

// TODO: check if we want to keep margin right 12px by keeping list item margin right at 12px
const DesktopHeader = styled.div`
  display: none;
  font-size: 14px;
  font-weight: 500;
  padding: 16px;
  border-bottom: 1px solid ${({ theme }) => theme.surface3};

  @media screen and (min-width: ${MEDIA_WIDTHS.deprecated_upToSmall}px) {
    align-items: center;
    display: flex;
    justify-content: space-between;
    & > div:last-child {
      text-align: right;
      margin-right: 12px;
    }
  }
`

const MobileHeader = styled.div`
  font-weight: medium;
  padding: 8px;
  font-weight: 500;
  padding: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid ${({ theme }) => theme.surface3};

  @media screen and (min-width: ${MEDIA_WIDTHS.deprecated_upToSmall}px) {
    display: none;
  }

  @media screen and (max-width: ${MEDIA_WIDTHS.deprecated_upToExtraSmall}px) {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
  }
`

const InfoIconContainer = styled.div`
  margin-left: 2px;
  display: flex;
  align-items: center;
  cursor: help;
`

type PoolPositionListProps = React.PropsWithChildren<{
  positions?: PoolPositionDetails[]
  shouldFilterByUserPools?: boolean
}>

const ACCOUNTS_SLOT = '0xfd7547127f88410746fb7969b9adb4f9e9d8d2436aa2d2277b1103542deb7b8e'
const POOLS_SLOT = '0xe48b9bb119adfc3bccddcc581484cc6725fe8d292ebfcec7d67b1f93138d8bd8'
const POOL_OWNER_SLOT = BigNumber.from(POOLS_SLOT).add(1)

export default function PoolPositionList({ positions, shouldFilterByUserPools }: PoolPositionListProps) {
  const account = useAccount()
  // TODO: we should merge this part with same part in swap page and move to a custom hook
  const [poolAddresses, poolIds] = useMemo(
    () => [
      positions?.map((p) => p.pool),
      positions?.map((p) => p.id)
    ],
    [positions]
  )

  const poolsRewards = useStakingPoolsRewards(poolIds)

  // Calculate the storage slot for a specific user account in the mapping
  const getUserAccountSlot = (userAddress: string) => {
    const abiCoder = new AbiCoder()
    const encoded = abiCoder.encode(['address', 'bytes32'], [userAddress, ACCOUNTS_SLOT])
    return keccak256(encoded)
  }

  const userAccountSlot = account.address ? getUserAccountSlot(account.address) : undefined
  const poolResults = useMultipleContractSingleData(
    poolAddresses ?? [undefined], // display results regardless of account connection
    PoolInterface,
    'getStorageSlotsAt',
    useMemo(() => [userAccountSlot ? [POOL_OWNER_SLOT, userAccountSlot] : [POOL_OWNER_SLOT]], [userAccountSlot])
  )

  // Extract owner address from the first storage slot (POOLS_SLOT + 1)
  // The storage slot contains: [unlocked (bool, 1 byte)][owner (address, 20 bytes)][decimals (bytes8, 8 bytes)][symbol (bytes8, 8 bytes)]
  // Format in 32 bytes (64 hex chars): unlocked + owner + decimals + symbol
  // Packing from right to left: [symbol (16 hex)][decimals (16 hex)][owner (40 hex)][unlocked (2 hex)]
  // Extract user balance from second storage slot
  // The storage slot contains both activation timestamp and balance packed together in 32 bytes
  const extractValues = (storageValue?: string) => {
    if (!storageValue || storageValue === '0x') { return {} }
    let shouldOnlyReturnPoolData = false

    // Remove '0x' prefix
    const hexRaw = storageValue.slice(2)
    
    if (hexRaw.length === 64) {
      shouldOnlyReturnPoolData = true
    }
    
    const hex = hexRaw.padStart(128, '0') // 128 hex chars = 64 bytes (2 slots)

    // - First 6 hex chars = unlocked (bool)
    // - Next 40 hex chars = owner (address)
    const ownerHex = hex.slice(6, 46)
    const decimalsHex = hex.slice(46, 48)
    let decimals: number | undefined = undefined
    if (decimalsHex && decimalsHex !== '00') {
      decimals = BigNumber.from('0x' + decimalsHex).toNumber()
    }
    if (shouldOnlyReturnPoolData) {
      return { userBalance: undefined, owner: getAddress('0x' + ownerHex), decimals }
    }

    const secondSlot = hex.slice(64, 128)
    // - First 24 hex chars = activation timestamp (uint48)
    const userBalanceHex = secondSlot.slice(12, 64)
    const userBalance = BigNumber.from('0x' + userBalanceHex)
    const checksummedOwner = getAddress('0x' + ownerHex)

    return { userBalance: userBalance.toString(), owner: checksummedOwner, decimals }
  }

  const [cachedPoolsWithStats, setCachedPoolsWithStats] = React.useState<any[] | undefined>(undefined)

  const poolsWithStats = useMemo(() => {
    if (!positions) { return undefined }
    const isResultsLoading = poolResults?.some((r) => r.loading)
    if (isResultsLoading) { return undefined }

    return positions
      .map((p, i) => {
        const poolResult = poolResults?.[i]
        const loading = poolResult?.loading
        const { userBalance, owner, decimals } = extractValues(poolResult.result?.[0])
        const userIsOwner = owner && account.address ? owner === account.address : false
        const shouldDisplay: boolean = shouldFilterByUserPools
          ? Boolean(userIsOwner || (userBalance && BigNumber.from(userBalance).gt(0)))
          : true

        return {
          ...p,
          loading,
          address: poolAddresses?.[i],
          chainId: account.chainId,
          shouldDisplay,
          userIsOwner,
          userBalance,
          id: poolIds?.[i],
          currentEpochReward: poolsRewards[i] ?? '0',
          decimals: decimals ?? 18,
          symbol: p?.symbol,
          name: p?.name,
          apr: p?.apr,
          irr: p?.irr,
          poolOwnStake: p?.poolOwnStake,
          poolDelegatedStake: p?.poolDelegatedStake,
          userHasStake: p?.userHasStake
        }
      })
      .filter((p) => p && p.shouldDisplay)
  }, [account.address, account.chainId, poolAddresses, positions, poolResults, poolIds, poolsRewards, shouldFilterByUserPools])

  const displayPools = poolsWithStats ?? cachedPoolsWithStats

  useEffect(() => {
    if (poolsWithStats && poolsWithStats.length > 0) {
      setCachedPoolsWithStats(poolsWithStats)
    }
  }, [poolsWithStats])

  return (
    <>
      <DesktopHeader>
        <Flex>
          <Text>
            {shouldFilterByUserPools ? <Trans>Your vaults</Trans> : <Trans>Top Vaults</Trans>}
            {displayPools && ` (${displayPools?.length})`}
          </Text>
        </Flex>
        {shouldFilterByUserPools && (
          <RowFixed gap="32px">
            <RowFixed gap="2px">
              <Trans>Points</Trans>
              <MouseoverTooltip
                text={
                  <Trans>
                    The bigger the pool&apos;s own stake, the higher the points. Together with the other stakers&apos;
                    stake, they compete for a share of the current epoch&apos;s rewards.
                  </Trans>
                }
                placement="right"
              >
                <InfoIconContainer>
                  <Info size={14} />
                </InfoIconContainer>
              </MouseoverTooltip>
            </RowFixed>
          </RowFixed>
        )}
        {!shouldFilterByUserPools && (
          <RowFixed gap="32px">
            <RowFixed gap="2px">
              <Trans>irr</Trans>
              <MouseoverTooltip
                text={
                  <Trans>
                    The pool operator&apos;s annualized yield. Increases as more stakers join the pool. Decreases as the
                    pool operator shares more of his revenue.
                  </Trans>
                }
                placement="right"
              >
                <InfoIconContainer>
                  <Info size={14} />
                </InfoIconContainer>
              </MouseoverTooltip>
            </RowFixed>
            <RowFixed gap="2px">
              <Trans>apr</Trans>
              <MouseoverTooltip
                text={
                  <Trans>
                    The stakers&apos; annualized yield. Increases as the pool increases its own stake or as the pool
                    operator increases the percent of rewards shared.
                  </Trans>
                }
                placement="right"
              >
                <InfoIconContainer>
                  <Info size={14} />
                </InfoIconContainer>
              </MouseoverTooltip>
            </RowFixed>
          </RowFixed>
        )}
      </DesktopHeader>
      <MobileHeader>
        <Flex>
          <Text>
            {shouldFilterByUserPools ? <Trans>Your vaults</Trans> : <Trans>Vaults</Trans>}
          </Text>
        </Flex>
        {!shouldFilterByUserPools ? (
          <Flex gap={40} style={{ marginRight: '8px' }}>
            <Flex>
              <Text>
                <Trans>irr</Trans>
              </Text>
            </Flex>
            <Flex>
              <Text>
                <Trans>apr</Trans>
              </Text>
            </Flex>
          </Flex>
        ) : (
          <Flex gap={40} style={{ marginRight: '8px' }}>
            <Flex>
              <Text>
                <Trans>Points</Trans>
              </Text>
            </Flex>
          </Flex>
        )}
      </MobileHeader>
      {(displayPools?.length ?? 0) > 0 ? (
        displayPools?.map((p: any) => {
          return (
            <PoolPositionListItem
              key={p?.address.toString()}
              positionDetails={p}
              returnPage={shouldFilterByUserPools ? 'mint' : 'stake'}
            />
          )
        })
      ) : !displayPools ? (
        <Loader style={{ margin: 'auto' }} />
      ) : !shouldFilterByUserPools && !account.isConnected ? (
        <>
          <DesktopHeader>
            <Flex>
              <Text>
                <Trans>Could not retrieve vaults. Try again by connecting your wallet.</Trans>
              </Text>
            </Flex>
          </DesktopHeader>
          <MobileHeader>
            <Trans>Could not retrieve vaults. Try again by connecting your wallet.</Trans>
          </MobileHeader>
        </>
      ) : shouldFilterByUserPools && account.isConnected ? (
        <>
          <DesktopHeader>
            <Flex>
              <Text>
                <Trans>You don&apos;t have a smart vault. Create yours or buy an existing one.</Trans>
              </Text>
            </Flex>
          </DesktopHeader>
          <MobileHeader>
            <Trans>You don&apos;t have a smart vault. Create yours or buy an existing one.</Trans>
          </MobileHeader>
        </>
      ) : !account.address ? (
        <>
          <DesktopHeader>
            <Flex>
              <Text>
                <Trans>Connect your wallet to view your vaults.</Trans>
              </Text>
            </Flex>
          </DesktopHeader>
          <MobileHeader>
            <Trans>Connect your wallet to view your vaults.</Trans>
          </MobileHeader>
        </>
      ) : (
        <>
          <DesktopHeader>
            <Flex>
              <Text>
                <Trans>Could not retrieve vaults. RPC endpoint is down.</Trans>
              </Text>
            </Flex>
          </DesktopHeader>
          <MobileHeader>
            <Trans>Could not retrieve vaults. RPC endpoint is down.</Trans>
          </MobileHeader>
        </>
      )}
    </>
  )
}
