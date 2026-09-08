/* eslint-disable max-lines */
import { AbiCoder, Interface } from '@ethersproject/abi'
import { getAddress } from '@ethersproject/address'
import { BigNumber } from '@ethersproject/bignumber'
import { keccak256 } from '@ethersproject/keccak256'
import { parseBytes32String } from '@ethersproject/strings'
import { keepPreviousData } from '@tanstack/react-query'
import { CurrencyAmount, Token } from '@uniswap/sdk-core'
import { areAddressesEqual } from 'uniswap/src/utils/addresses'
import { Platform } from 'uniswap/src/features/platforms/types/Platform'
import { useEnabledChains } from 'uniswap/src/features/chains/hooks/useEnabledChains'
import JSBI from 'jsbi'
import { useEffect, useMemo, useState } from 'react'
import { logger } from 'utilities/src/logger/logger'
import RB_REGISTRY_ABI from 'uniswap/src/abis/rb-registry.json'
import STAKING_ABI from 'uniswap/src/abis/staking-impl.json'
import { GRG } from 'uniswap/src/constants/tokens'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import type { Abi } from 'viem'
import { useReadContracts } from 'wagmi'
import { RB_REGISTRY_ADDRESSES, RIGOBLOCK_SUPPORTED_CHAINS, RIGOBLOCK_TESTNET_CHAINS, STAKING_PROXY_ADDRESSES } from '~/constants/addresses'
import { getBackupRpcProvider } from '~/constants/providers'
import { useAccount } from '~/hooks/useAccount'
import { PoolRegisteredLog } from '~/state/pool/hooks'
import { assume0xAddress } from '~/utils/wagmi'

const RegistryInterface = new Interface(RB_REGISTRY_ABI)

function getRegistryStartBlock(chainId: number): number {
  switch (chainId) {
    case UniverseChainId.Mainnet:
      return 15834693
    case UniverseChainId.Sepolia:
      return 7707806
    case UniverseChainId.ArbitrumOne:
      return 35439804
    case UniverseChainId.Optimism:
      return 34629059
    case UniverseChainId.Polygon:
      return 35228892
    case UniverseChainId.Base:
      return 2565256
    case UniverseChainId.Bnb:
      return 25549625
    case UniverseChainId.Unichain:
      return 16121684
    default:
      return 1000
  }
}

// ─── Multi-chain Pool Discovery ────────────────────────────────────────────

/** Module-level cache to persist across component mounts */
let multiChainPoolsCache: PoolRegisteredLog[] | undefined = undefined
let fetchingPromise: Promise<PoolRegisteredLog[]> | null = null
let cachedChainsKey = ''

async function fetchChainPools(chainId: number): Promise<PoolRegisteredLog[]> {
  const pools: PoolRegisteredLog[] = []
  const registryAddress = RB_REGISTRY_ADDRESSES[chainId]
  if (!registryAddress) {
    return pools
  }

  const fromBlock = getRegistryStartBlock(chainId)
  const registeredTopic = RegistryInterface.getEventTopic('Registered')

  try {
    const provider = getBackupRpcProvider(chainId)
    const logs = await provider.getLogs({
      address: registryAddress,
      topics: [registeredTopic],
      fromBlock,
    })

    for (const log of logs) {
      const parsed = RegistryInterface.parseLog(log).args
      pools.push({
        group: parsed.group,
        pool: parsed.pool,
        name: parseBytes32String(parsed.name),
        symbol: parseBytes32String(parsed.symbol),
        id: parsed.id,
        chainId,
      })
    }
  } catch (e) {
    logger.debug('multichain', 'fetchChainPools', `Failed to fetch pools for chain ${chainId}`, e)
  }

  return pools
}

/**
 * Fetches registered pools from ALL supported chains.
 * The connected chain is fetched first for faster perceived loading.
 * No delay needed — the API endpoint handles concurrent log requests fine.
 */
async function fetchAllChainPools(chains: number[], connectedChainId?: number): Promise<PoolRegisteredLog[]> {
  const allPools: PoolRegisteredLog[] = []

  // Fetch connected chain first (if it's a supported chain)
  const orderedChains = [...chains]
  if (connectedChainId && orderedChains.includes(connectedChainId)) {
    const idx = orderedChains.indexOf(connectedChainId)
    orderedChains.splice(idx, 1)
    orderedChains.unshift(connectedChainId)
  }

  for (const chain of orderedChains) {
    const pools = await fetchChainPools(chain)
    allPools.push(...pools)
  }

  return allPools
}

/**
 * Fetches registered pools from the given chains.
 * Results are cached at module level to avoid refetching on navigation.
 * Chains are loaded sequentially with delays to avoid 429 rate-limiting.
 */
export function useMultiChainRegisteredPools(chains: number[]): PoolRegisteredLog[] | undefined {
  const account = useAccount()
  const chainsKey = chains.join(',')
  const [pools, setPools] = useState<PoolRegisteredLog[] | undefined>(
    cachedChainsKey === chainsKey ? multiChainPoolsCache : undefined,
  )

  useEffect(() => {
    // Invalidate cache if chains changed (e.g. testnet/mainnet switch)
    if (cachedChainsKey !== chainsKey) {
      multiChainPoolsCache = undefined
      fetchingPromise = null
      cachedChainsKey = chainsKey
    }

    if (multiChainPoolsCache) {
      setPools(multiChainPoolsCache)
      return
    }

    if (!fetchingPromise) {
      fetchingPromise = fetchAllChainPools(chains, account.chainId)
    }

    fetchingPromise.then((result) => {
      multiChainPoolsCache = result
      setPools(result)
    })
  }, [account.chainId, chains, chainsKey])

  return pools
}

/**
 * Returns deduplicated pool data from the given chains.
 */
export function useMultiChainAllPoolsData(chains: number[]): {
  data?: PoolRegisteredLog[]
} {
  const pools = useMultiChainRegisteredPools(chains)

  return useMemo(() => {
    if (!pools) {
      return { data: undefined }
    }

    const seen = new Set<string>()
    const uniquePools = pools.filter((p) => {
      const key = `${p.chainId}:${p.pool}`
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })

    return { data: uniquePools }
  }, [pools])
}

// ─── Multi-chain Staking Data ──────────────────────────────────────────────

export interface StakingPoolData {
  id: string
  operatorShare: number
  apr: number
  irr?: number
  delegatedStake: BigNumber
  poolOwnStake: BigNumber
  currentEpochReward: string
  userHasStake: boolean
  userIsOwner: boolean
  userBalance?: string
}

export interface MultiChainStakingResult {
  loading: boolean
  stakingPools?: StakingPoolData[]
  /** Free (undelegated) stake on the connected chain */
  freeStakeBalance?: CurrencyAmount<Token>
  /** Unclaimed rewards for pools across all chains where the user has staked. */
  unclaimedRewards: { poolId: string; amount: CurrencyAmount<Token>; chainId: number }[]
}

const ERC20_TOTAL_SUPPLY_ABI_VIEM = [
  {
    type: 'function' as const,
    name: 'totalSupply',
    stateMutability: 'view' as const,
    inputs: [],
    outputs: [{ type: 'uint256', name: '' }],
  },
]

// ─── Storage Slot Helpers (owner + user balance in one call per pool) ──────

const ACCOUNTS_SLOT = '0xfd7547127f88410746fb7969b9adb4f9e9d8d2436aa2d2277b1103542deb7b8e'
const POOLS_SLOT = '0xe48b9bb119adfc3bccddcc581484cc6725fe8d292ebfcec7d67b1f93138d8bd8'
const POOL_OWNER_SLOT = BigInt(POOLS_SLOT) + 1n

const STORAGE_SLOTS_ABI_VIEM = [
  {
    type: 'function' as const,
    name: 'getStorageSlotsAt',
    stateMutability: 'view' as const,
    inputs: [{ type: 'uint256[]', name: 'slots' }],
    outputs: [{ type: 'bytes', name: '' }],
  },
]

function getUserAccountSlot(userAddress: string): bigint {
  const coder = new AbiCoder()
  const encoded = coder.encode(['address', 'bytes32'], [userAddress, ACCOUNTS_SLOT])
  return BigInt(keccak256(encoded))
}

function safeBigNumber(value: unknown): BigNumber {
  if (typeof value === 'bigint' || typeof value === 'string' || typeof value === 'number') {
    try {
      return BigNumber.from(value.toString())
    } catch {
      return BigNumber.from(0)
    }
  }
  return BigNumber.from(0)
}

function extractStorageValues(storageValue?: unknown): {
  owner?: string
  userBalance?: string
} {
  if (typeof storageValue !== 'string' || !storageValue.startsWith('0x') || storageValue === '0x') {
    return {}
  }
  const hexRaw = storageValue.slice(2)
  const isSingleSlot = hexRaw.length <= 64
  const hex = hexRaw.padStart(128, '0')
  // First slot: [3 bytes pad][20 bytes owner][1 byte decimals][8 bytes symbol]
  const ownerHex = hex.slice(6, 46)
  let owner: string | undefined
  try {
    owner = getAddress('0x' + ownerHex)
  } catch {
    // invalid address
  }
  if (isSingleSlot) {
    return { owner }
  }
  // Second slot: [6 bytes epoch][26 bytes balance]
  const secondSlot = hex.slice(64, 128)
  const userBalanceHex = secondSlot.slice(12, 64)
  const userBalance = safeBigNumber('0x' + userBalanceHex).toString()
  return { owner, userBalance }
}

/**
 * Fetches ALL staking data for ALL pools across ALL chains in a SINGLE useReadContracts call.
 *
 * One TanStack Query — wagmi automatically groups the contracts by chainId and sends one
 * multicall RPC per chain. This avoids duplicate query subscriptions and extra blockNumber
 * polling that would occur with per-chain hooks.
 *
 * Includes per-pool staking stats (APR/IRR/delegatedStake/ownStake/userStake/epochFees),
 * plus unclaimed rewards across ALL chains, plus connected-chain free stake — all in one batch.
 */
export function useMultiChainStakingPools(pools: PoolRegisteredLog[]): MultiChainStakingResult {
  const account = useAccount()

  const STAKING_CALLS_PER_POOL = account.address ? 6 : 4

  // Build all contract calls plus metadata to decode results.
  const { contracts, chainMeta, freeStakeMeta, skippedIndices } = useMemo(() => {
    if (pools.length === 0) {
      return {
        contracts: [] as any[],
        chainMeta: [] as {
          chainId: number
          poolIndices: number[]
          baseOffset: number
          supplyOffset: number
          rewardBaseOffset: number
          rewardPoolIds: string[]
        }[],
        freeStakeMeta: { idx: -1, chainId: 0 },
        skippedIndices: [] as number[],
      }
    }

    // Group pools by chain, preserving original index
    const poolsByChain = new Map<number, { pool: PoolRegisteredLog; index: number }[]>()
    pools.forEach((pool, index) => {
      const cid = pool.chainId!
      if (!poolsByChain.has(cid)) {
        poolsByChain.set(cid, [])
      }
      poolsByChain.get(cid)!.push({ pool, index })
    })

    const allContracts: any[] = []
    const meta: {
      chainId: number
      poolIndices: number[]
      baseOffset: number
      supplyOffset: number
      rewardBaseOffset: number
      rewardPoolIds: string[]
    }[] = []
    // Pool indices on chains without staking deployments (e.g. HyperEVM). Staking
    // enrichment is optional, so these chains are skipped and their entries are
    // filled with zeroed StakingPoolData to stay aligned with the pools array.
    const skippedPoolIndices: number[] = []
    let freeStakeIdx = -1
    let freeStakeChainId = 0
    const userAccountSlot = account.address ? getUserAccountSlot(account.address) : 0n

    for (const [chainId, entries] of poolsByChain) {
      const stakingAddress = STAKING_PROXY_ADDRESSES[chainId]
      const grg = GRG[chainId]
      // oxlint-disable-next-line typescript/no-unnecessary-condition
      if (!stakingAddress || !grg) {
        for (const entry of entries) {
          skippedPoolIndices.push(entry.index)
        }
        continue
      }
      const stakingAddr = assume0xAddress(stakingAddress)
      const baseOffset = allContracts.length

      // ── Per-pool staking calls ──
      for (const entry of entries) {
        const pool = entry.pool
        allContracts.push(
          {
            address: stakingAddr,
            abi: STAKING_ABI as Abi,
            functionName: 'getStakingPool',
            args: [pool.id],
            chainId,
          },
          {
            address: stakingAddr,
            abi: STAKING_ABI as Abi,
            functionName: 'getTotalStakeDelegatedToPool',
            args: [pool.id],
            chainId,
          },
          {
            address: stakingAddr,
            abi: STAKING_ABI as Abi,
            functionName: 'getOwnerStakeByStatus',
            args: [pool.pool, 1],
            chainId,
          },
          {
            address: stakingAddr,
            abi: STAKING_ABI as Abi,
            functionName: 'getStakingPoolStatsThisEpoch',
            args: [pool.id],
            chainId,
          },
        )
        if (account.address) {
          allContracts.push({
            address: stakingAddr,
            abi: STAKING_ABI as Abi,
            functionName: 'getStakeDelegatedToPoolByOwner',
            args: [account.address, pool.id],
            chainId,
          })
          allContracts.push({
            address: assume0xAddress(pool.pool),
            abi: STORAGE_SLOTS_ABI_VIEM as Abi,
            functionName: 'getStorageSlotsAt',
            args: [[POOL_OWNER_SLOT, userAccountSlot]],
            chainId,
          })
        }
      }

      // ── GRG totalSupply ──
      const supplyOffset = allContracts.length
      allContracts.push({
        address: assume0xAddress(grg.address),
        abi: ERC20_TOTAL_SUPPLY_ABI_VIEM as Abi,
        functionName: 'totalSupply',
        chainId,
      })

      // ── Unclaimed rewards for this chain ──
      const rewardBaseOffset = account.address ? allContracts.length : -1
      const rewardPoolIds: string[] = []
      if (account.address) {
        for (const entry of entries) {
          rewardPoolIds.push(entry.pool.id)
          allContracts.push({
            address: stakingAddr,
            abi: STAKING_ABI as Abi,
            functionName: 'computeRewardBalanceOfDelegator',
            args: [entry.pool.id, account.address],
            chainId,
          })
        }
      }

      meta.push({
        chainId,
        poolIndices: entries.map((e) => e.index),
        baseOffset,
        supplyOffset,
        rewardBaseOffset,
        rewardPoolIds,
      })
    }

    // ── Connected-chain-only tail: free stake ──
    // Kept after the per-chain sections so per-chain offsets stay stable when the
    // wallet switches chain — previous (placeholder) results then remain aligned.
    if (account.address && account.chainId) {
      const connectedEntries = poolsByChain.get(account.chainId)
      const connectedStakingAddress = STAKING_PROXY_ADDRESSES[account.chainId]
      if (connectedEntries && connectedStakingAddress && connectedEntries.length > 0) {
        const stakingAddr = assume0xAddress(connectedStakingAddress)
        freeStakeIdx = allContracts.length
        freeStakeChainId = account.chainId
        allContracts.push({
          address: stakingAddr,
          abi: STAKING_ABI as Abi,
          functionName: 'getOwnerStakeByStatus',
          args: [account.address, 0], // 0 = UNDELEGATED
          chainId: account.chainId,
        })
      }
    }

    return {
      contracts: allContracts,
      chainMeta: meta,
      freeStakeMeta: { idx: freeStakeIdx, chainId: freeStakeChainId },
      skippedIndices: skippedPoolIndices,
    }
  }, [pools, account.address, account.chainId])

  const { data: rawData, isLoading } = useReadContracts({
    contracts,
    batchSize: 1024, // large batch size to get all data in one go; wagmi will split by chainId as needed
    query: {
      enabled: contracts.length > 0,
      staleTime: 5 * 60_000,
      gcTime: 5 * 60_000,
      retry: 5,
      retryDelay: (attempt: number) => Math.min(attempt > 1 ? 2 ** attempt * 1000 : 1000, 30_000),
      refetchOnWindowFocus: false,
      // Keep previous data while a chain switch rebuilds the query — it covers all
      // chains, so previous values stay valid and dependent UI (chain pills, lists) doesn't flicker
      placeholderData: keepPreviousData,
    },
  })

  // Process raw multicall results.
  const result: MultiChainStakingResult = useMemo(() => {
    const emptyRewards: { poolId: string; amount: CurrencyAmount<Token>; chainId: number }[] = []

    const results = new Array<StakingPoolData>(pools.length)

    // Pools on chains without staking deployments (e.g. HyperEVM) get zeroed
    // staking data so every pool still maps to a StakingPoolData entry.
    for (const index of skippedIndices) {
      results[index] = {
        id: pools[index].id,
        operatorShare: 0,
        apr: 0,
        delegatedStake: BigNumber.from(0),
        poolOwnStake: BigNumber.from(0),
        currentEpochReward: '0',
        userHasStake: false,
        userIsOwner: false,
      }
    }

    if (!rawData || rawData.length === 0 || contracts.length === 0) {
      // Every pool lives on a chain without staking: nothing to fetch, but still
      // report the zeroed entries so consumers don't wait on a batch that never comes.
      const onlySkippedPools = pools.length > 0 && skippedIndices.length === pools.length
      return {
        loading: isLoading,
        stakingPools: onlySkippedPools ? results : undefined,
        freeStakeBalance: undefined,
        unclaimedRewards: emptyRewards,
      }
    }

    for (const cm of chainMeta) {
      // GRG totalSupply for this chain — only accept numeric results
      // (a stale, differently-shaped query response may briefly hold a tuple here)
      const supplyRaw = rawData[cm.supplyOffset]?.result
      const totalSupply = parseFloat(safeBigNumber(supplyRaw).toString())

      // Per-chain totals for reward ratio
      let totalDelegatedStake = BigNumber.from(0)
      let totalPoolsOwnStake = BigNumber.from(0)

      cm.poolIndices.forEach((_, i) => {
        const baseIndex = cm.baseOffset + i * STAKING_CALLS_PER_POOL
        const delegated = (rawData[baseIndex + 1]?.result as any)?.nextEpochBalance
        const ownStake = (rawData[baseIndex + 2]?.result as any)?.nextEpochBalance
        totalDelegatedStake = totalDelegatedStake.add(safeBigNumber(delegated))
        totalPoolsOwnStake = totalPoolsOwnStake.add(safeBigNumber(ownStake))
      })

      const totalRewardPool = totalSupply * 0.02
      const tds = parseFloat(totalDelegatedStake.toString())
      const tps = parseFloat(totalPoolsOwnStake.toString())

      cm.poolIndices.forEach((originalIndex, i) => {
        const baseIndex = cm.baseOffset + i * STAKING_CALLS_PER_POOL
        const operatorShare = Number((rawData[baseIndex]?.result as any)?.operatorShare ?? 0)
        const delegated = (rawData[baseIndex + 1]?.result as any)?.nextEpochBalance
        const ownStake = (rawData[baseIndex + 2]?.result as any)?.nextEpochBalance
        const delegatedBN = safeBigNumber(delegated)
        const ownStakeBN = safeBigNumber(ownStake)

        const epochStats = rawData[baseIndex + 3]?.result as any
        const currentEpochReward = epochStats?.feesCollected?.toString() ?? '0'

        let userHasStake = false
        let userIsOwner = false
        let userBalance: string | undefined
        if (account.address && STAKING_CALLS_PER_POOL === 6) {
          const userStakeRaw = (rawData[baseIndex + 4]?.result as any)?.nextEpochBalance
          const userStakeBN = safeBigNumber(userStakeRaw)
          userHasStake = userStakeBN.gt(0)
          // Storage slot data: owner + user token balance (baseIndex + 5)
          const storageResult = rawData[baseIndex + 5]?.result
          if (typeof storageResult === 'string') {
            const { owner, userBalance: bal } = extractStorageValues(storageResult)
            if (owner && account.address) {
              const chainId = (pools[originalIndex].chainId ?? UniverseChainId.Mainnet) as UniverseChainId
              userIsOwner = areAddressesEqual({
                addressInput1: { address: owner, chainId },
                addressInput2: { address: account.address, chainId },
              })
            }
            userBalance = bal
          }
        }

        const pds = parseFloat(delegatedBN.toString())
        const pos = parseFloat(ownStakeBN.toString())

        const rewardRatio = tds > 0 && tps > 0 ? Math.pow(pos / tps, 2 / 3) * Math.pow(pds / tds, 1 / 3) : 0

        const totalReward = rewardRatio * totalRewardPool
        const apr = pds !== 0 ? (totalReward * ((1_000_000 - operatorShare) / 1_000_000)) / pds : 0
        const irr = pos !== 0 ? (totalReward * (operatorShare / 1_000_000)) / pos : 0

        results[originalIndex] = {
          id: pools[originalIndex].id,
          operatorShare,
          apr,
          irr,
          delegatedStake: delegatedBN,
          poolOwnStake: ownStakeBN,
          currentEpochReward,
          userHasStake,
          userIsOwner,
          userBalance,
        }
      })
    }

    // ── Free stake balance (connected chain only) ──
    let freeStakeBalance: CurrencyAmount<Token> | undefined
    if (freeStakeMeta.idx >= 0 && rawData[freeStakeMeta.idx]?.result) {
      const grg = GRG[freeStakeMeta.chainId]
      const res = rawData[freeStakeMeta.idx].result as any
      const currentEpoch = safeBigNumber(res.currentEpochBalance)
      const nextEpoch = safeBigNumber(res.nextEpochBalance)
      const lower = currentEpoch.gt(nextEpoch) ? nextEpoch : currentEpoch
      freeStakeBalance = CurrencyAmount.fromRawAmount(grg, JSBI.BigInt(lower.toString()))
    }

    // ── Unclaimed rewards across all chains ──
    const unclaimedRewards: {
      poolId: string
      amount: CurrencyAmount<Token>
      chainId: number
    }[] = []
    for (const cm of chainMeta) {
      if (cm.rewardBaseOffset < 0 || !account.address) {
        continue
      }
      const grg = GRG[cm.chainId]
      for (let i = 0; i < cm.rewardPoolIds.length; i++) {
        const rewardResult = rawData[cm.rewardBaseOffset + i]?.result
        const rewardAmount = safeBigNumber(rewardResult)
        if (rewardAmount.gt(0)) {
          const amount = CurrencyAmount.fromRawAmount(grg, JSBI.BigInt(rewardAmount.toString()))
          unclaimedRewards.push({ poolId: cm.rewardPoolIds[i], amount, chainId: cm.chainId })
        }
      }
    }

    return {
      loading: isLoading,
      stakingPools: results,
      freeStakeBalance,
      unclaimedRewards,
    }
  }, [
    rawData,
    chainMeta,
    contracts.length,
    pools,
    account.address,
    STAKING_CALLS_PER_POOL,
    isLoading,
    freeStakeMeta,
    skippedIndices,
  ])

  return result
}

/**
 * Returns the per-chain pool IDs for a given smart pool address across all Rigoblock chains.
 * Useful when you need to read/write chain-specific data (e.g. rewards) for a pool that may be
 * deployed on multiple chains.
 */
export function usePoolIdsByAddressAcrossChains(
  poolAddress: string | undefined,
): { poolId: string; chainId: number }[] | undefined {
  const { isTestnetModeEnabled } = useEnabledChains()
  const chains = useMemo(
    () => (isTestnetModeEnabled ? RIGOBLOCK_TESTNET_CHAINS : RIGOBLOCK_SUPPORTED_CHAINS),
    [isTestnetModeEnabled],
  )
  const { data: allPools } = useMultiChainAllPoolsData(chains)

  return useMemo(() => {
    if (!poolAddress || !allPools) {
      return undefined
    }
    return allPools
      .filter(
        (p) =>
          p.chainId != null &&
          areAddressesEqual({
            addressInput1: { address: p.pool, platform: Platform.EVM },
            addressInput2: { address: poolAddress, platform: Platform.EVM },
          }),
      )
      .map((p) => ({ poolId: p.id, chainId: p.chainId as number }))
  }, [allPools, poolAddress])
}
