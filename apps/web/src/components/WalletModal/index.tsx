import { FeatureFlags, useFeatureFlag } from '@universe/gating'
import { Platform } from 'uniswap/src/features/platforms/types/Platform'
import { MenuStateVariant, useSetMenuCallback } from '~/components/AccountDrawer/menuState'
import { EmbeddedWalletConnectionsModal } from '~/components/WalletModal/EmbeddedWalletModal'
import { StandardWalletModal } from '~/components/WalletModal/StandardWalletModal'
import { SwitchWalletModal } from '~/components/WalletModal/SwitchWalletModal'

// PrivyProvider is only mounted when PRIVY_APP_ID is set and the hostname is app.uniswap.org.
// Without it, Privy hooks crash. Mirror the same condition used in index.tsx.
const isPrivyProviderMounted = !!process.env.PRIVY_APP_ID && window.location.hostname === 'app.uniswap.org'

export default function WalletModal({ connectOnPlatform }: { connectOnPlatform?: Platform | 'any' }) {
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
