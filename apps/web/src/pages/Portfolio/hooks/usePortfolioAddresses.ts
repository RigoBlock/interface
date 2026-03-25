import { useMemo } from 'react'
import { useActiveSmartPool } from '~/state/application/hooks'
import { useResolvedAddresses } from '~/pages/Portfolio/hooks/useResolvedAddresses'

// This is the address used for the disconnected demo view. It is only used in the disconnected state for the portfolio page.
const DEMO_WALLET_ADDRESS = '0x8796207d877194d97a2c360c041f13887896FC79'

/**
 * Returns portfolio addresses with demo wallet fallback for disconnected state.
 * When a smart pool (vault) is active, returns vault address instead of EOA.
 * Use useResolvedAddresses if you don't want the demo wallet fallback.
 */
export function usePortfolioAddresses(): {
  evmAddress: Address | undefined
  svmAddress: Address | undefined
  isExternalWallet: boolean
} {
  const resolved = useResolvedAddresses()
  const { address: smartPoolAddress } = useActiveSmartPool()

  return useMemo(() => {
    // If viewing an external wallet, always show that wallet's data
    if (resolved.isExternalWallet) {
      return resolved
    }

    // If a smart pool is active, show vault balances
    if (smartPoolAddress) {
      return {
        evmAddress: smartPoolAddress,
        svmAddress: undefined,
        isExternalWallet: false,
      }
    }

    // If we have resolved addresses (connected), return them
    if (resolved.evmAddress || resolved.svmAddress) {
      return resolved
    }

    // If not connected and not viewing external wallet, return demo address
    return {
      evmAddress: DEMO_WALLET_ADDRESS,
      svmAddress: undefined,
      isExternalWallet: false,
    }
  }, [resolved, smartPoolAddress])
}
