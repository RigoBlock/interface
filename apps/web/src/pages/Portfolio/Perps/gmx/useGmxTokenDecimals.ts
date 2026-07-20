import { useMemo } from 'react'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import type { Abi } from 'viem'
import { useReadContracts } from 'wagmi'
import { assume0xAddress } from '~/utils/wagmi'

const ERC20_DECIMALS_ABI = [
  {
    type: 'function' as const,
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8', name: '' }],
  },
]

/**
 * Reads ERC20 decimals for the GMX market's index and collateral tokens on Arbitrum.
 * Needed to scale order amounts (USD prices use 10^(30-indexDecimals), collateral is raw).
 */
export function useGmxTokenDecimals({
  indexToken,
  collateralToken,
  enabled,
}: {
  indexToken?: string
  collateralToken?: string
  enabled: boolean
}): { indexDecimals?: number; collateralDecimals?: number; isLoading: boolean } {
  const contracts = useMemo((): any[] => {
    if (!indexToken || !collateralToken || !enabled) {
      return []
    }
    const abi = ERC20_DECIMALS_ABI as Abi
    return [
      { address: assume0xAddress(indexToken), abi, functionName: 'decimals', chainId: UniverseChainId.ArbitrumOne },
      {
        address: assume0xAddress(collateralToken),
        abi,
        functionName: 'decimals',
        chainId: UniverseChainId.ArbitrumOne,
      },
    ]
  }, [indexToken, collateralToken, enabled])

  const { data, isLoading } = useReadContracts({
    contracts,
    query: { enabled: contracts.length > 0, staleTime: Infinity, gcTime: Infinity },
  })

  return useMemo(() => {
    const indexResult = data?.[0]?.result
    const collateralResult = data?.[1]?.result
    return {
      indexDecimals: indexResult != null ? Number(indexResult) : undefined,
      collateralDecimals: collateralResult != null ? Number(collateralResult) : undefined,
      isLoading,
    }
  }, [data, isLoading])
}
