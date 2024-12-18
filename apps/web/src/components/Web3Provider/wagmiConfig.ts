import { QueryClient } from '@tanstack/react-query'
import RIGOBLOCK_LOGO from 'assets/images/rigoblock-logo.png'
import { injectedWithFallback } from 'components/Web3Provider/injectedWithFallback'
import { WC_PARAMS, uniswapWalletConnect } from 'components/Web3Provider/walletConnect'
import { UNIVERSE_CHAIN_INFO } from 'uniswap/src/constants/chains'
import { UNISWAP_WEB_URL } from 'uniswap/src/constants/urls'
import { COMBINED_CHAIN_IDS, UniverseChainId } from 'uniswap/src/types/chains'
import { createClient } from 'viem'
import { createConfig, http } from 'wagmi'
import { connect } from 'wagmi/actions'
import { coinbaseWallet, injected, safe, walletConnect } from 'wagmi/connectors'

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig
  }
}

export const wagmiConfig = createConfig({
  chains: [
    UNIVERSE_CHAIN_INFO[UniverseChainId.Mainnet],
    ...COMBINED_CHAIN_IDS.map((chainId) => UNIVERSE_CHAIN_INFO[chainId]),
  ],
  connectors: [
    injectedWithFallback(),
    walletConnect(WC_PARAMS),
    uniswapWalletConnect(),
    coinbaseWallet({
      appName: 'Rigoblock',
      // CB SDK doesn't pass the parent origin context to their passkey site
      // Flagged to CB team and can remove UNISWAP_WEB_URL once fixed
      appLogoUrl: `${UNISWAP_WEB_URL}${RIGOBLOCK_LOGO}`,
      reloadOnDisconnect: false,
      enableMobileWalletLink: true,
    }),
    safe(),
  ],
  client({ chain }) {
    // TODO: modify this to inject rpc provider other than infura
    //const rpcUrl = chain.id === UniverseChainId.Bnb
    //  ? process.env.REACT_APP_BNB_RPC_URL
    //  : chain.backendChain.chain === UniverseChainId.Base
    //  ? process.env.REACT_APP_BASE_MAINNET_RPC_URL
    //  : chain.rpcUrls.appOnly.http[0] 
    return createClient({
      chain,
      batch: { multicall: true },
      pollingInterval: 12_000,
      transport: http(chain.rpcUrls.appOnly.http[0]),
    })
  },
})

export const queryClient = new QueryClient()

// Automatically connect if running in Cypress environment
if ((window as any).Cypress?.eagerlyConnect) {
  connect(wagmiConfig, { connector: injected() })
}
