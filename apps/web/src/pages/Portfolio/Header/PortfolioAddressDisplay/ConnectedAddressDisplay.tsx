/* eslint-disable-next-line no-restricted-imports, no-restricted-syntax */

import { useMemo } from 'react'
import { Flex } from 'ui/src'
import { iconSizes } from 'ui/src/theme/iconSizes'
import { Platform } from 'uniswap/src/features/platforms/types/Platform'
import { MultiBlockchainAddressDisplay } from '~/components/AccountDetails/MultiBlockchainAddressDisplay'
import StatusIcon from '~/components/StatusIcon'
import { usePortfolioRoutes } from '~/pages/Portfolio/Header/hooks/usePortfolioRoutes'
import { useResolvedAddresses } from '~/pages/Portfolio/hooks/useResolvedAddresses'
import { useActiveSmartPool } from '~/state/application/hooks'

interface ConnectedAddressDisplayProps {
  isCompact: boolean
}

export function ConnectedAddressDisplay({ isCompact }: ConnectedAddressDisplayProps) {
  const { evmAddress, svmAddress, isExternalWallet } = useResolvedAddresses()
  const { address: smartPoolAddress } = useActiveSmartPool()
  const { hasExplicitUrlAddress } = usePortfolioRoutes()

  // Priority: URL address > smart pool (only when no URL address) > connected wallet
  const useSmartPoolFallback = !hasExplicitUrlAddress && !!smartPoolAddress && !isExternalWallet
  const primaryAddress = isExternalWallet
    ? (evmAddress ?? svmAddress)
    : useSmartPoolFallback
      ? (smartPoolAddress as Address)
      : (evmAddress ?? svmAddress)
  const isExternal = isExternalWallet || useSmartPoolFallback

  const externalAddress = useMemo(() => {
    if (!isExternal || !primaryAddress) {
      return undefined
    }
    return {
      address: primaryAddress,
      platform: Platform.EVM,
    }
  }, [isExternal, primaryAddress])

  if (!primaryAddress) {
    return null
  }

  const iconSize = isCompact ? iconSizes.icon24 : iconSizes.icon48

  return (
    <Flex row alignItems="center" gap="$spacing12" shrink>
      <StatusIcon address={primaryAddress} size={iconSize} showMiniIcons={false} />
      <MultiBlockchainAddressDisplay hideAddressInSubtitle={isCompact} externalAddress={externalAddress} />
    </Flex>
  )
}
