/* eslint-disable max-lines */
import { Interface } from '@ethersproject/abi'
import { BigNumber } from '@ethersproject/bignumber'
import { parseBytes32String } from '@ethersproject/strings'
import { RB_REGISTRY_ADDRESSES, STAKING_PROXY_ADDRESSES } from 'constants/addresses'
import { getBackupRpcProvider } from 'constants/providers'
import { useAccount } from 'hooks/useAccount'
import JSBI from 'jsbi'
import { useEffect, useMemo, useState } from 'react'
import { PoolRegisteredLog } from 'state/pool/hooks'
import RB_REGISTRY_ABI from 'uniswap/src/abis/rb-registry.json'
import STAKING_ABI from 'uniswap/src/abis/staking-impl.json'
import { GRG } from 'uniswap/src/constants/tokens'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { assume0xAddress } from 'utils/wagmi'
import type { Abi } from 'viem'
import { useReadContracts } from 'wagmi'

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
  try {
    const provider = getBackupRpcProvider(chainId)
    const registryAddress = RB_REGISTRY_ADDRESSES[chainId]
    if (!registryAddress) {
      return pools
    }

    const fromBlock = getRegistryStartBlock(chainId)
    const registeredTopic = RegistryInterface.getEventTopic('Registered')

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
    console.error(`Failed to fetch pools for chain ${chainId}:`, e)
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
export function useMultiChainAllPoolsData(chains: number[]): { data?: PoolRegisteredLog[] } {
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

interface StakingPoolData {
  id: string
  operatorShare: number
  apr: number
  irr?: number
  delegatedStake: BigNumber
  poolOwnStake: BigNumber
  currentEpochReward: string
  userHasStake: boolean
}

interface UseStakingPools {
  loading: boolean
  stakingPools?: StakingPoolData[]
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

/**
 * Fetches staking data for pools across multiple chains using wagmi's useReadContracts.
 *
 * This hook builds ALL contract calls (across ALL chains) upfront and lets wagmi group them
 * by chainId into separate multicalls — one per chain. TanStack Query (under the hood)
 * handles caching, deduplication, and StrictMode double-mount robustness automatically.
 *
 * Results include APR, IRR, delegated stake, pool own stake, the current epoch's collected
 * fees, and whether the connected user has an active stake, for each pool.
 */
export function useMultiChainStakingPools(pools: PoolRegisteredLog[]): UseStakingPools {
  const account = useAccount()

  const CALLS_PER_POOL = account.address ? 5 : 4

  // Build the flat array of contract calls, plus metadata to reconstruct per-pool results.
  const { contracts, chainMeta } = useMemo(() => {
    if (pools.length === 0) {
      return { contracts: [] as any[], chainMeta: [] as { chainId: number; poolIndices: number[]; baseOffset: number; supplyOffset: number }[] }
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
    const meta: { chainId: number; poolIndices: number[]; baseOffset: number; supplyOffset: number }[] = []

    for (const [chainId, entries] of poolsByChain) {
      const stakingAddr = assume0xAddress(STAKING_PROXY_ADDRESSES[chainId])
      const grg = GRG[chainId]
      const baseOffset = allContracts.length

      for (const entry of entries) {
        const pool = entry.pool
        allContracts.push(
          { address: stakingAddr, abi: STAKING_ABI as Abi, functionName: 'getStakingPool', args: [pool.id], chainId },
          { address: stakingAddr, abi: STAKING_ABI as Abi, functionName: 'getTotalStakeDelegatedToPool', args: [pool.id], chainId },
          { address: stakingAddr, abi: STAKING_ABI as Abi, functionName: 'getOwnerStakeByStatus', args: [pool.pool, 1], chainId },
          { address: stakingAddr, abi: STAKING_ABI as Abi, functionName: 'getStakingPoolStatsThisEpoch', args: [pool.id], chainId },
        )
        if (account.address) {
          allContracts.push({
            address: stakingAddr, abi: STAKING_ABI as Abi, functionName: 'getStakeDelegatedToPoolByOwner',
            args: [account.address, pool.id], chainId,
          })
        }
      }

      const supplyOffset = allContracts.length
      allContracts.push({
        address: assume0xAddress(grg.address),
        abi: ERC20_TOTAL_SUPPLY_ABI_VIEM as Abi,
        functionName: 'totalSupply',
        chainId,
      })

      meta.push({
        chainId,
        poolIndices: entries.map((e) => e.index),
        baseOffset,
        supplyOffset,
      })
    }

    return { contracts: allContracts, chainMeta: meta }
  }, [pools, account.address, CALLS_PER_POOL])

  const { data: rawData, isLoading } = useReadContracts({
    contracts,
    query: {
      enabled: contracts.length > 0,
      staleTime: 30_000,
      gcTime: 5 * 60_000,
    },
  })

  // Process raw multicall results into per-pool staking data with APR/IRR calculation.
  const stakingPools = useMemo(() => {
    if (!rawData || rawData.length === 0 || contracts.length === 0) {
      return undefined
    }

    const results = new Array<StakingPoolData>(pools.length)

    for (const cm of chainMeta) {
      // Parse GRG totalSupply for this chain
      const supplyResult = rawData[cm.supplyOffset]
      const totalSupply = supplyResult?.result
        ? parseFloat(BigNumber.from(supplyResult.result.toString()).toString())
        : 0

      // Per-chain totals for reward ratio
      let totalDelegatedStake = BigNumber.from(0)
      let totalPoolsOwnStake = BigNumber.from(0)

      cm.poolIndices.forEach((_, i) => {
        const baseIndex = cm.baseOffset + i * CALLS_PER_POOL
        const delegated = (rawData[baseIndex + 1]?.result as any)?.nextEpochBalance
        const ownStake = (rawData[baseIndex + 2]?.result as any)?.nextEpochBalance
        totalDelegatedStake = totalDelegatedStake.add(delegated ? BigNumber.from(delegated) : BigNumber.from(0))
        totalPoolsOwnStake = totalPoolsOwnStake.add(ownStake ? BigNumber.from(ownStake) : BigNumber.from(0))
      })

      const totalRewardPool = totalSupply * 0.02
      const tds = parseFloat(totalDelegatedStake.toString())
      const tps = parseFloat(totalPoolsOwnStake.toString())

      cm.poolIndices.forEach((originalIndex, i) => {
        const baseIndex = cm.baseOffset + i * CALLS_PER_POOL
        const operatorShare = Number((rawData[baseIndex]?.result as any)?.operatorShare ?? 0)
        const delegated = (rawData[baseIndex + 1]?.result as any)?.nextEpochBalance
        const ownStake = (rawData[baseIndex + 2]?.result as any)?.nextEpochBalance
        const delegatedBN = delegated ? BigNumber.from(delegated) : BigNumber.from(0)
        const ownStakeBN = ownStake ? BigNumber.from(ownStake) : BigNumber.from(0)

        const epochStats = rawData[baseIndex + 3]?.result as any
        const currentEpochReward = epochStats?.feesCollected?.toString() ?? '0'

        let userHasStake = false
        if (account.address && CALLS_PER_POOL === 5) {
          const userStake = (rawData[baseIndex + 4]?.result as any)?.nextEpochBalance
          if (userStake) {
            userHasStake = JSBI.greaterThan(JSBI.BigInt(String(userStake)), JSBI.BigInt(0))
          }
        }

        const pds = parseFloat(delegatedBN.toString())
        const pos = parseFloat(ownStakeBN.toString())

        const rewardRatio =
          tds > 0 && tps > 0
            ? Math.pow(pos / tps, 2 / 3) * Math.pow(pds / tds, 1 / 3)
            : 0

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
        }
      })
    }

    return results
  }, [rawData, chainMeta, contracts.length, pools, account.address, CALLS_PER_POOL])

  return { loading: isLoading, stakingPools }
}
