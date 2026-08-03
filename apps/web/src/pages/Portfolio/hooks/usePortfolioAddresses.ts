import { useMemo } from 'react'
import { usePortfolioRoutes } from '~/pages/Portfolio/Header/hooks/usePortfolioRoutes'
import { useResolvedAddresses } from '~/pages/Portfolio/hooks/useResolvedAddresses'
import { useActiveSmartPool } from '~/state/application/hooks'

/**
 * Returns portfolio addresses with priority: URL address > active smart pool > connected user wallet.
 * For pool operators, the active smart pool is displayed by default when no explicit address is in the URL,
 * so the portfolio page stays consistent with the pool-centric context used elsewhere in the app.
 * When no wallet is connected and no smart pool is active, the hook returns undefined addresses and the
 * page's existing connect-wallet banner takes over.
 */
export function usePortfolioAddresses(): {
  evmAddress: Address | undefined
  svmAddress: Address | undefined
  isExternalWallet: boolean
} {
  const resolved = useResolvedAddresses()
  const portfolioRoutes = usePortfolioRoutes()
  const hasExplicitUrlAddress = !!portfolioRoutes.externalAddress
  const activeSmartPool = useActiveSmartPool()

  return useMemo(() => {
    // 1. URL address (external wallet, smart pool from earn page, or any address in path)
    if (resolved.isExternalWallet || hasExplicitUrlAddress) {
      return resolved
    }

    // 2. Active smart pool (only for operators who have one selected)
    if (activeSmartPool.address) {
      return {
        evmAddress: activeSmartPool.address,
        svmAddress: undefined,
        isExternalWallet: true,
      }
    }

    // 3. Connected user wallet (may be undefined; connect-wallet banner handles the disconnected state)
    return resolved
  }, [resolved, hasExplicitUrlAddress, activeSmartPool.address])
}
