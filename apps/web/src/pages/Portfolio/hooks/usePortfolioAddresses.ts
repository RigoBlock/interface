import { useMemo } from 'react'
import { usePortfolioRoutes } from '~/pages/Portfolio/Header/hooks/usePortfolioRoutes'
import { useResolvedAddresses } from '~/pages/Portfolio/hooks/useResolvedAddresses'
import { useActiveSmartPool } from '~/state/application/hooks'

// This is the address used for the disconnected demo view. It is only used in the disconnected state for the portfolio page.
const DEMO_WALLET_ADDRESS = '0x8796207d877194d97a2c360c041f13887896FC79'

/**
 * Returns portfolio addresses with priority: URL address > connected user wallet > active smart pool > demo wallet.
 * When a URL specifies an external address, that takes precedence.
 * When the user is connected, the connected wallet is always used; the active smart pool is only used
 * as a fallback when the user is disconnected and a pool has been explicitly selected.
 * Falls back to the demo wallet for the disconnected state when no smart pool is selected.
 */
export function usePortfolioAddresses(): {
  evmAddress: Address | undefined
  svmAddress: Address | undefined
  isExternalWallet: boolean
} {
  const resolved = useResolvedAddresses()
  const { address: smartPoolAddress } = useActiveSmartPool()
  const portfolioRoutes = usePortfolioRoutes()
  const hasExplicitUrlAddress = !!portfolioRoutes.externalAddress

  return useMemo(() => {
    // 1. URL address (external wallet from earn page, or any address in path — even user's own)
    //    When any address is explicitly in the URL, honour it. Do NOT apply smart pool fallback.
    if (resolved.isExternalWallet || hasExplicitUrlAddress) {
      return resolved
    }

    // 2. Connected user wallet always takes precedence over the active smart pool. This prevents
    //    a stale/selected pool from showing instead of the user's own portfolio.
    if (resolved.evmAddress || resolved.svmAddress) {
      return resolved
    }

    // 3. Active smart pool as fallback only when the user is disconnected AND a pool was explicitly selected
    if (smartPoolAddress) {
      return {
        evmAddress: smartPoolAddress as Address,
        svmAddress: undefined,
        isExternalWallet: true,
      }
    }

    // 4. Demo wallet for disconnected state
    return {
      evmAddress: DEMO_WALLET_ADDRESS,
      svmAddress: undefined,
      isExternalWallet: false,
    }
  }, [resolved, smartPoolAddress, hasExplicitUrlAddress])
}
