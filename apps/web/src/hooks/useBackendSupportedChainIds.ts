import { type UniverseChainId } from '@universe/chains'
import { useMemo } from 'react'
import { useEnabledChains } from 'uniswap/src/features/chains/hooks/useEnabledChains'
import { isBackendSupportedChainId } from 'uniswap/src/features/chains/utils'

/**
 * Enabled chains restricted to those Uniswap's data API can serve.
 * Fork addition: the fork enables HyperEvm (999) app-wide for crosschain bridging, but the
 * data API rejects it with 400 "unrecognized chains". Data-API consumers (ListTokens,
 * ListPools, …) must use this instead of `useEnabledChains().chains` when building chainIds.
 */
export function useBackendSupportedChainIds(): UniverseChainId[] {
  const { chains } = useEnabledChains()
  return useMemo(() => chains.filter(isBackendSupportedChainId), [chains])
}
