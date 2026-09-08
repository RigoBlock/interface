import { useMemo } from 'react'
import { USDC_HYPEREVM } from 'uniswap/src/constants/tokens'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { erc20Abi } from 'viem'
import { useReadContract } from 'wagmi'
import { assume0xAddress } from '~/utils/wagmi'

const HL_USDC_BALANCE_POLLING_INTERVAL_MS = 15_000
/** Native USDC on HyperEVM has 6 decimals. */
const HL_USDC_DECIMALS = 6

/**
 * On-chain HyperEVM USDC (6-decimal ERC20) balance for an address — used for the
 * deposit side of the Hyperliquid transfer flow (the vault's bridgeable USDC).
 */
export function useHyperEvmUsdcBalance(address?: string): {
  balanceUsd: number
  balanceRaw: bigint | undefined
  isLoading: boolean
} {
  const { data, isLoading } = useReadContract({
    address: assume0xAddress(USDC_HYPEREVM.address),
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [assume0xAddress(address)] : undefined,
    chainId: UniverseChainId.HyperEvm,
    query: { enabled: !!address, refetchInterval: HL_USDC_BALANCE_POLLING_INTERVAL_MS },
  })

  return useMemo(() => {
    const balanceRaw = typeof data === 'bigint' ? data : undefined
    return {
      balanceUsd: balanceRaw !== undefined ? Number(balanceRaw) / 10 ** HL_USDC_DECIMALS : 0,
      balanceRaw,
      isLoading,
    }
  }, [data, isLoading])
}
