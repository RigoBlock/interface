import { isTestEnv } from '@universe/environment'
import { CONNECTION_PROVIDER_IDS } from 'uniswap/src/constants/web3'
import type { Register } from 'wagmi'

type WagmiConnector = Register['config']['connectors'][number]

/**
 * Which EVM connectors the app should reconnect on mount. Empty means reconnect nothing.
 * Gated on the app-owned recentConnectorId record (cleared by "clear site data"), plus a
 * Safe carve-out: Safe iframe sessions only ever connect via reconnect and never write a
 * recentConnectorId, so we reconnect the Safe connector whenever running framed.
 */
export function getConnectorsToReconnect(params: {
  recentConnectorId: string | undefined
  isIframe: boolean
  connectors: readonly WagmiConnector[]
}): WagmiConnector[] {
  const { recentConnectorId, isIframe, connectors } = params
  const result: WagmiConnector[] = []

  if (recentConnectorId) {
    const recent = connectors.find((connector) => connector.id === recentConnectorId)
    if (recent) {
      result.push(recent)
    }
  }

  if (isIframe) {
    const safe = connectors.find((connector) => connector.id === CONNECTION_PROVIDER_IDS.SAFE_CONNECTOR_ID)
    if (safe && !result.includes(safe)) {
      result.push(safe)
    }
  }

  return result
}

// Flips true once the mount reconnect attempt has run, so the accounts store can report the
// pending reconnect synchronously on the first render (before the effect fires) and then stop.
let settled = false
const listeners = new Set<() => void>()

export function getMountReconnectSettled(): boolean {
  return settled
}

export function subscribeMountReconnectSettled(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function settleMountReconnect(): void {
  if (settled) {
    return
  }
  settled = true
  listeners.forEach((listener) => listener())
}

/**
 * RigoBlock: inside an injected MetaMask (MetaMask extension or MetaMask mobile's built-in
 * browser), the user expects the app to use their wallet, not the demo wallet. Returns the
 * MetaMask connector to auto-connect on first visit (no stored recentConnectorId) when a
 * MetaMask provider is present; undefined otherwise (desktop without MetaMask, iframes,
 * tests) so the demo/connect-flow behavior is unchanged.
 */
export function getInjectedMetaMaskConnector(params: {
  isIframe: boolean
  connectors: readonly WagmiConnector[]
  hasMetaMaskProvider: boolean
}): WagmiConnector | undefined {
  const { isIframe, connectors, hasMetaMaskProvider } = params
  if (isIframe || isTestEnv() || !hasMetaMaskProvider) {
    return undefined
  }
  return connectors.find((connector) => connector.id === CONNECTION_PROVIDER_IDS.METAMASK_SDK_CONNECTOR_ID)
}

/** True when an injected MetaMask provider is visible (window.ethereum or an eip-6963 announcement). */
export function hasInjectedMetaMaskProvider(config: Register['config']): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  const ethereum = (window as { ethereum?: { isMetaMask?: boolean } }).ethereum
  return (
    Boolean(ethereum?.isMetaMask) ||
    Boolean(config._internal.mipd?.findProvider({ rdns: CONNECTION_PROVIDER_IDS.METAMASK_RDNS }))
  )
}
