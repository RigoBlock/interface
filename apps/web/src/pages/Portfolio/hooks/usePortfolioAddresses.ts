import { useActiveAddresses } from 'features/accounts/store/hooks'
import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { useActiveSmartPool } from 'state/application/hooks'

// This is the address used for the disconnected demo view.  It is only used in the disconnected state for the portfolio page.
const DEMO_WALLET_ADDRESS = '0x8796207d877194d97a2c360c041f13887896FC79'

export function usePortfolioAddresses(): { evmAddress: Address | undefined; svmAddress: Address | undefined } {
  const { evmAddress, svmAddress } = useActiveAddresses()
  const activeSmartPool = useActiveSmartPool()
  const [searchParams] = useSearchParams()

  // Get address from URL parameters (for viewing specific address portfolios)
  const addressParam = searchParams.get('address')

  return useMemo(() => {
    // if there are no connected addresses, return the demo address
    if (!evmAddress && !svmAddress) {
      return {
        evmAddress: DEMO_WALLET_ADDRESS,
        svmAddress: undefined,
      }
    }

    return {
      evmAddress: addressParam || activeSmartPool.address || evmAddress,
      svmAddress: addressParam || activeSmartPool.address ? undefined : svmAddress, // Disable SVM for address views
    }
  }, [evmAddress, svmAddress, activeSmartPool.address, addressParam])
}
