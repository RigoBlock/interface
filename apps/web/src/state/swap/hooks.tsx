import { Currency } from '@uniswap/sdk-core'
import { useMemo } from 'react'
import { useReadContract } from 'wagmi'
import { assume0xAddress } from '~/chains'
import { usePoolExtendedContract } from '~/state/pool/hooks'

export function useIsTokenOwnable(poolAddress?: string, token?: Currency): boolean | undefined {
  const extendedPool = usePoolExtendedContract(poolAddress)
  const { data: isTokenOwnable } = useReadContract({
    address: assume0xAddress(extendedPool?.address),
    abi: extendedPool?.abi,
    functionName: 'hasPriceFeed',
    args: token?.isToken ? [token.address] : undefined,
    query: { enabled: Boolean(extendedPool && token?.isToken) },
  })

  return useMemo(() => (token?.isToken ? (isTokenOwnable as boolean) : true), [token, isTokenOwnable])
}
