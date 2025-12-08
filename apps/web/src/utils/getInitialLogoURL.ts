import { CELO_LOGO, RIGOBLOCK_LOGO } from 'ui/src/assets'
import { GRG, nativeOnChain } from 'uniswap/src/constants/tokens'
import { getChainInfo } from 'uniswap/src/features/chains/chainInfo'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { isUniverseChainId } from 'uniswap/src/features/chains/utils'
import { getValidAddress } from 'uniswap/src/utils/addresses'

export function getInitialLogoUrl({
  address,
  chainId,
  backupImg,
}: {
  address?: string | null
  chainId?: number | null
  backupImg?: string | null
}) {
  const networkName = isUniverseChainId(chainId)
    ? (getChainInfo(chainId).assetRepoNetworkName ?? 'ethereum')
    : 'ethereum'
  const checksummedAddress = getValidAddress({
    address,
    chainId: isUniverseChainId(chainId) ? chainId : UniverseChainId.Mainnet,
    withEVMChecksum: true,
  })

  if (
    (address === GRG[UniverseChainId.Mainnet].address ||
      address === GRG[UniverseChainId.Sepolia].address ||
      address === GRG[UniverseChainId.ArbitrumOne].address ||
      address === GRG[UniverseChainId.Base].address ||
      address === GRG[UniverseChainId.Bnb].address ||
      address === GRG[UniverseChainId.Optimism].address ||
      address === GRG[UniverseChainId.Polygon].address ||
      address === GRG[UniverseChainId.Unichain].address) &&
    checksummedAddress
  ) {
    return RIGOBLOCK_LOGO
  }

  if (chainId === UniverseChainId.Celo && address === nativeOnChain(chainId).wrapped.address) {
    return CELO_LOGO
  }

  if (checksummedAddress) {
    return `https://raw.githubusercontent.com/Uniswap/assets/master/blockchains/${networkName}/assets/${checksummedAddress}/logo.png`
  } else {
    return backupImg ?? undefined
  }
}
