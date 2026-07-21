import { Contract } from '@ethersproject/contracts'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { normalizeTokenAddressForCache } from 'uniswap/src/data/cache'
import { RPC_PROVIDERS } from '~/constants/providers'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { logger } from 'utilities/src/logger/logger'

const ERC20_DECIMALS_ABI = ['function decimals() view returns (uint8)']

/**
 * Decimals for common Arbitrum tokens (lowercased address), avoiding RPC calls.
 * Same static map approach as the agentic-operator (src/services/gmxTrading.ts).
 */
const STATIC_DECIMALS: Record<string, number> = {
  '0x82af49447d8a07e3bd95bd0d56f35241523fbab1': 18, // WETH
  '0xaf88d065e77c8cc2239327c5edb3a432268e5831': 6, // USDC
  '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8': 6, // USDC.e
  '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': 6, // USDT
  '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f': 8, // WBTC
  '0x912ce59144191c1204e64559fe8253a0e49e6548': 18, // ARB
  '0xf97f4df75e6c8e0ce7fec36ad7c4e12f3a1c33d8': 18, // LINK
  '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1': 18, // DAI
  '0xfa7f8980b0f1e64a2062791cc3b0871572f1f7f0': 18, // UNI
  '0x2bcc6d6cdbbdc0a4071e48bb3b969b06b3330c07': 18, // SOL
  '0x40461291347e1ecbb09499f3371d3f17f10d7159': 18, // XAUT
}

export function getStaticTokenDecimals(address?: string): number | undefined {
  return address ? STATIC_DECIMALS[normalizeTokenAddressForCache(address)] : undefined
}

/**
 * Reads ERC20 decimals for tokens not in the static map, via the standard Arbitrum
 * RPC provider used by the interface (Alchemy/Infura/Quicknode). The backup logs
 * provider does not support eth_call, so it cannot be used here.
 * Times out after 10s so the modal never gets stuck on a hanging RPC call.
 */
async function fetchDecimalsOnChain(addresses: string[]): Promise<Record<string, number>> {
  const provider = RPC_PROVIDERS[UniverseChainId.ArbitrumOne]
  const results = await Promise.all(
    addresses.map(async (address) => {
      try {
        const contract = new Contract(address, ERC20_DECIMALS_ABI, provider)
        const decimals = (await Promise.race([
          contract.decimals(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('decimals timeout')), 10_000)),
        ])) as number
        return [normalizeTokenAddressForCache(address), decimals] as const
      } catch {
        return [normalizeTokenAddressForCache(address), 18] as const
      }
    }),
  )
  return Object.fromEntries(results)
}

/**
 * Resolves decimals for the GMX market's index and collateral tokens on Arbitrum:
 * instant from the static map for common tokens, on-chain fallback otherwise.
 * Resolution failures are logged (previously they failed silently, leaving the
 * order modal stuck in its loading state forever).
 */
export function useGmxTokenDecimals({
  indexToken,
  collateralToken,
  enabled,
}: {
  indexToken?: string
  collateralToken?: string
  enabled: boolean
}): { indexDecimals?: number; collateralDecimals?: number; isLoading: boolean; isError: boolean } {
  const staticIndex = getStaticTokenDecimals(indexToken)
  const staticCollateral = getStaticTokenDecimals(collateralToken)

  const missingAddresses = useMemo(() => {
    if (!enabled) {
      return []
    }
    const missing: string[] = []
    if (indexToken && staticIndex === undefined) {
      missing.push(indexToken)
    }
    if (collateralToken && staticCollateral === undefined) {
      missing.push(collateralToken)
    }
    return [...new Set(missing)]
  }, [enabled, indexToken, collateralToken, staticIndex, staticCollateral])

  const { data: onChainDecimals, isError } = useQuery({
    queryKey: ['gmxTokenDecimals', missingAddresses],
    queryFn: () => fetchDecimalsOnChain(missingAddresses),
    enabled: enabled && missingAddresses.length > 0,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 2,
  })

  if (isError) {
    logger.error(new Error(`Failed to read token decimals on-chain for: ${missingAddresses.join(', ')}`), {
      tags: { file: 'useGmxTokenDecimals', function: 'fetchDecimalsOnChain' },
    })
  }

  const indexDecimals = indexToken
    ? (staticIndex ?? onChainDecimals?.[normalizeTokenAddressForCache(indexToken)] ?? 18)
    : undefined
  const collateralDecimals = collateralToken
    ? (staticCollateral ?? onChainDecimals?.[normalizeTokenAddressForCache(collateralToken)] ?? 18)
    : undefined

  return {
    indexDecimals,
    collateralDecimals,
    // Never block the order modal: common tokens resolve instantly from the static map,
    // and unknown tokens fall back to 18 decimals while the on-chain lookup proceeds.
    isLoading: false,
    isError,
  }
}
