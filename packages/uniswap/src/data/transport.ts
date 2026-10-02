import { Transport } from '@connectrpc/connect'
import { ConnectTransportOptions } from '@connectrpc/connect-web'
import { getEntryGatewayUrl, getTransport } from '@universe/api'
import { Environment } from '@universe/environment'
import { type Session } from '@universe/sessions'
import { config } from 'uniswap/src/config'
import { getUniswapServiceUrls } from 'uniswap/src/constants/urls'
import { BASE_UNISWAP_HEADERS } from 'uniswap/src/data/apiClients/createUniswapFetchClient'

export function createConnectTransportWithDefaults({
  options = {},
  getBaseUrlOverride,
  getSession,
  source,
}: {
  options?: Partial<ConnectTransportOptions>
  getBaseUrlOverride?: () => string
  getSession?: () => Session | null
  /** Telemetry identifier for the gate's emitted events. */
  source?: string
}): Transport {
  return getTransport({
    getBaseUrl: getBaseUrlOverride ?? ((): string => getUniswapServiceUrls(config).apiBaseUrlV2),
    getHeaders: () => BASE_UNISWAP_HEADERS,
    options,
    getSession,
    source,
  })
}

/**
 * Connectrpc transports for Uniswap REST BE service
 */
export const uniswapGetTransport = createConnectTransportWithDefaults({
  options: { useHttpGet: true },
})
export const uniswapPostTransport = createConnectTransportWithDefaults({})

// The string arg to pass to the BE for chainId to get data for all networks
export const ALL_NETWORKS_ARG = 'ALL_NETWORKS'

/**
 * ConnectRPC transport for services behind the entry-gateway.
 *
 * RigoBlock: credentials are omitted because the RigoBlock CF Worker returns
 * Access-Control-Allow-Origin: * which is incompatible with credentials: 'include'.
 * RigoBlock does not use Uniswap session cookies so omitting credentials is correct.
 */
export const entryGatewayPostTransport = createConnectTransportWithDefaults({
  options: { credentials: 'omit' },
  getBaseUrlOverride: getEntryGatewayUrl,
})

/**
 * Same as entryGatewayPostTransport, but always pins to the prod entry gateway
 * regardless of deployment. When the proxy is enabled, the env is encoded in
 * the proxy path (`/entry-gateway/prod`) so the BFF can forward to prod.
 */
export const entryGatewayProdPostTransport = createConnectTransportWithDefaults({
  // RigoBlock: credentials omitted (CF worker ACAO:*) — no Uniswap session cookies.
  options: { credentials: 'omit' },
  getBaseUrlOverride: () => getEntryGatewayUrl({ env: Environment.Production }),
})
