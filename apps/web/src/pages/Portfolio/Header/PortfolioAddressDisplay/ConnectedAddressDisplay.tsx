import { Platform } from '@universe/chains'
import { Flex, iconSizes } from '@universe/mycelium'
import { useMemo } from 'react'
import { HEADER_TRANSITION } from '~/components/StickyCollapsibleHeader/constants'
import { MultiBlockchainAddressDisplay } from '~/features/wallet/components/AccountDetails/MultiBlockchainAddressDisplay'
import { StatusIcon } from '~/features/wallet/components/StatusIcon'
import { usePortfolioAddresses } from '~/pages/Portfolio/hooks/usePortfolioAddresses'

interface ConnectedAddressDisplayProps {
  isCompact: boolean
}

export function ConnectedAddressDisplay({ isCompact }: ConnectedAddressDisplayProps) {
  // RigoBlock invariant: URL address > active smart pool > connected wallet. usePortfolioAddresses
  // carries the smart-pool fallback; useResolvedAddresses (URL/connected wallet only) regressed
  // the header to the user's EOA on plain /portfolio while the tabs' data used the vault.
  const { evmAddress, svmAddress, isExternalWallet } = usePortfolioAddresses()

  const primaryAddress = evmAddress ?? svmAddress

  const externalAddress = useMemo(() => {
    if (!isExternalWallet || !primaryAddress) {
      return undefined
    }
    return {
      address: primaryAddress,
      platform: evmAddress ? Platform.EVM : Platform.SVM,
    }
  }, [isExternalWallet, primaryAddress, evmAddress])

  if (!primaryAddress) {
    return null
  }

  const iconSize = isCompact ? iconSizes.icon24 : iconSizes.icon48

  return (
    <Flex row alignItems="center" gap="$spacing12" shrink>
      <StatusIcon address={primaryAddress} size={iconSize} showMiniIcons={false} transition={HEADER_TRANSITION} />
      <MultiBlockchainAddressDisplay hideAddressInSubtitle={isCompact} externalAddress={externalAddress} />
    </Flex>
  )
}
