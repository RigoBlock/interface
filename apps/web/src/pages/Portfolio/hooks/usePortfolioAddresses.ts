import { useMemo } from 'react'
import { useActiveSmartPool } from '~/state/application/hooks'
import { useResolvedAddresses } from '~/pages/Portfolio/hooks/useResolvedAddresses'
import { usePortfolioRoutes } from '~/pages/Portfolio/Header/hooks/usePortfolioRoutes'

// This is the address used for the disconnected demo view. It is only used in the disconnected state for the portfolio page.
const DEMO_WALLET_ADDRESS = '0x8796207d877194d97a2c360c041f13887896FC79'

/**
 * Returns portfolio addresses with priority: URL address > active smart pool > user wallet > demo wallet.
 * When a URL specifies an external address, that takes precedence.
 * When no URL address is set but a smart pool is active, the smart pool address is used.
 * Falls back to the connected user wallet, then demo wallet for disconnected state.
 */
export function usePortfolioAddresses(): {
  evmAddress: Address | undefined
  svmAddress: Address | undefined
  isExternalWallet: boolean
} {
  const resolved = useResolvedAddresses()
  const { address: smartPoolAddress } = useActiveSmartPool()
  const { hasExplicitUrlAddress } = usePortfolioRoutes()

  return useMemo(() => {
    // 1. URL address (external wallet from earn page, or any address in path — even user's own)
    //    When any address is explicitly in the URL, honour it. Do NOT apply smart pool fallback.
    if (resolved.isExternalWallet || hasExplicitUrlAddress) {
      return resolved
    }

    // 2. Active smart pool as fallback only when NO address is in the URL
    if (smartPoolAddress) {
      return {
        evmAddress: smartPoolAddress as Address,
        svmAddress: undefined,
        isExternalWallet: true,
      }
    }

    // 3. Connected user wallet
    if (resolved.evmAddress || resolved.svmAddress) {
      return resolved
    }

    // 4. Demo wallet for disconnected state
    return {
      evmAddress: DEMO_WALLET_ADDRESS,
      svmAddress: undefined,
      isExternalWallet: false,
    }
  }, [resolved, smartPoolAddress, hasExplicitUrlAddress])
}
