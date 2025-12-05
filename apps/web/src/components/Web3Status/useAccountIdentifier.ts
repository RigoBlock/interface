import { useLocation } from 'react-router'
import { useActiveSmartPool } from 'state/application/hooks'
import { useUnitagsAddressQuery } from 'uniswap/src/data/apiClients/unitagsApi/useUnitagsAddressQuery'
import { useActiveAddresses } from 'uniswap/src/features/accounts/store/hooks'
import { shortenAddress } from 'utilities/src/addresses'
import { useEnsName } from 'wagmi'

// Returns an identifier for the current or recently connected account, prioritizing unitag -> ENS name -> address
export function useAccountIdentifier() {
  const { evmAddress, svmAddress } = useActiveAddresses()
  const activeSmartPool = useActiveSmartPool()
  const { pathname: page } = useLocation()

  // display user address if user does not have an operated smart vault
  const address =
    activeSmartPool.address && activeSmartPool.address !== '' && page !== '/send' ? activeSmartPool.address : evmAddress
  const { data: unitagResponse } = useUnitagsAddressQuery({
    params: evmAddress ? { address: address ?? evmAddress } : undefined,
  })
  const unitag = unitagResponse?.username
  const { data: ensName } = useEnsName({ address: evmAddress })

  const accountIdentifier = unitag ?? ensName ?? shortenAddress({ address: address ?? evmAddress ?? svmAddress })

  return {
    accountIdentifier,
    hasUnitag: Boolean(unitag),
  }
}
