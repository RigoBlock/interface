import { CONNECTION_PROVIDER_IDS } from 'uniswap/src/constants/web3'
import type { Register } from 'wagmi'
import { getConnectorsToReconnect, getInjectedMetaMaskConnector, hasInjectedMetaMaskProvider } from '~/connection/mountReconnect'

// The auto-connect helper intentionally no-ops under isTestEnv() — pretend we're in a real
// browser so the gating logic itself is exercised.
vi.mock('@universe/environment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@universe/environment')>()),
  isTestEnv: () => false,
}))

type WagmiConnector = Register['config']['connectors'][number]

function connector(id: string): WagmiConnector {
  return { id } as unknown as WagmiConnector
}

describe('getConnectorsToReconnect', () => {
  const metaMask = connector('metaMaskSDK')
  const safe = connector(CONNECTION_PROVIDER_IDS.SAFE_CONNECTOR_ID)
  const connectors = [metaMask, safe]

  it('reconnects nothing when there is no recentConnectorId and not in an iframe', () => {
    expect(getConnectorsToReconnect({ recentConnectorId: undefined, isIframe: false, connectors })).toEqual([])
  })

  it('reconnects exactly the recentConnectorId connector when present and not in an iframe', () => {
    expect(getConnectorsToReconnect({ recentConnectorId: 'metaMaskSDK', isIframe: false, connectors })).toEqual([
      metaMask,
    ])
  })

  it('reconnects nothing for an unknown/stale recentConnectorId (no matching connector, no throw)', () => {
    expect(
      getConnectorsToReconnect({ recentConnectorId: 'no-longer-registered', isIframe: false, connectors }),
    ).toEqual([])
  })

  it('reconnects the Safe connector when in an iframe with no recentConnectorId', () => {
    expect(getConnectorsToReconnect({ recentConnectorId: undefined, isIframe: true, connectors })).toEqual([safe])
  })

  it('reconnects both the recentConnectorId connector and Safe when in an iframe', () => {
    expect(getConnectorsToReconnect({ recentConnectorId: 'metaMaskSDK', isIframe: true, connectors })).toEqual([
      metaMask,
      safe,
    ])
  })

  it('does not duplicate the Safe connector when it is also the recentConnectorId in an iframe', () => {
    expect(
      getConnectorsToReconnect({
        recentConnectorId: CONNECTION_PROVIDER_IDS.SAFE_CONNECTOR_ID,
        isIframe: true,
        connectors,
      }),
    ).toEqual([safe])
  })
})

describe('getInjectedMetaMaskConnector (RigoBlock MetaMask-mobile auto-connect)', () => {
  const metaMask = connector(CONNECTION_PROVIDER_IDS.METAMASK_SDK_CONNECTOR_ID)
  const other = connector('walletConnect')
  const connectors = [other, metaMask]

  it('returns the MetaMask connector when a MetaMask provider is injected and not iframed', () => {
    expect(getInjectedMetaMaskConnector({ isIframe: false, connectors, hasMetaMaskProvider: true })).toBe(metaMask)
  })

  it('returns undefined without an injected MetaMask provider (desktop browsers stay on the connect flow)', () => {
    expect(getInjectedMetaMaskConnector({ isIframe: false, connectors, hasMetaMaskProvider: false })).toBeUndefined()
  })

  it('returns undefined inside an iframe (Safe sessions connect only via reconnect)', () => {
    expect(getInjectedMetaMaskConnector({ isIframe: true, connectors, hasMetaMaskProvider: true })).toBeUndefined()
  })

})

describe('hasInjectedMetaMaskProvider', () => {
  afterEach(() => {
    delete (window as { ethereum?: unknown }).ethereum
  })

  it('detects window.ethereum.isMetaMask (MetaMask mobile built-in browser)', () => {
    ;(window as { ethereum?: { isMetaMask?: boolean } }).ethereum = { isMetaMask: true }
    expect(hasInjectedMetaMaskProvider({} as Register['config'])).toBe(true)
  })

  it('is false without an injected provider', () => {
    expect(hasInjectedMetaMaskProvider({ _internal: {} } as Register['config'])).toBe(false)
  })
})
