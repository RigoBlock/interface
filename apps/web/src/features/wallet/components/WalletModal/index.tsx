import { Platform } from '@universe/chains'
import { FeatureFlags, useFeatureFlag } from '@universe/gating'
import { EmbeddedWalletConnectionsModal } from '~/features/wallet/components/WalletModal/EmbeddedWalletModal'
import { StandardWalletModal } from '~/features/wallet/components/WalletModal/StandardWalletModal'
import { SwitchWalletModal } from '~/features/wallet/components/WalletModal/SwitchWalletModal'
import { MenuStateVariant, useSetMenuCallback } from '~/state/accountDrawer/menuState'
import { getPrivyAppId } from '~/config'

// PrivyProvider is only mounted when PRIVY_APP_ID is set and the hostname is app.uniswap.org.
// Without it, Privy hooks crash. Mirror the same condition used in index.tsx.
const isPrivyProviderMounted = !!getPrivyAppId() && window.location.hostname === 'app.uniswap.org'

export function WalletModal({ connectOnPlatform }: { connectOnPlatform?: Platform | 'any' }) {
  const isEmbeddedWalletEnabled = useFeatureFlag(FeatureFlags.EmbeddedWallet)
  const onClose = useSetMenuCallback(MenuStateVariant.MAIN)

  if (connectOnPlatform) {
    return <SwitchWalletModal connectOnPlatform={connectOnPlatform} onClose={onClose} />
  }

  return isEmbeddedWalletEnabled && isPrivyProviderMounted ? (
    <EmbeddedWalletConnectionsModal />
  ) : (
    <StandardWalletModal />
  )
}
