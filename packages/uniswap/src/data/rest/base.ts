import { Transport } from '@connectrpc/connect'
import { ConnectTransportOptions } from '@connectrpc/connect-web'
import { getEntryGatewayUrl, getTransport } from '@universe/api'
import { uniswapUrls } from 'uniswap/src/constants/urls'
import { BASE_UNISWAP_HEADERS } from 'uniswap/src/data/apiClients/createUniswapFetchClient'
import { Environment } from 'utilities/src/environment/getCurrentEnv'

export function createConnectTransportWithDefaults({
  options = {},
  getBaseUrlOverride,
}: {
  options?: Partial<ConnectTransportOptions>
  getBaseUrlOverride?: () => string
}): Transport {
  return getTransport({
    getBaseUrl: getBaseUrlOverride ?? ((): string => uniswapUrls.apiBaseUrlV2),
    getHeaders: () => BASE_UNISWAP_HEADERS,
    options,
  })
}

/**
 * Connectrpc transports for Uniswap REST BE service
 */
export const uniswapGetTransport = createConnectTransportWithDefaults({ options: { useHttpGet: true } })
export const uniswapPostTransport = createConnectTransportWithDefaults({})

// The string arg to pass to the BE for chainId to get data for all networks
export const ALL_NETWORKS_ARG = 'ALL_NETWORKS'

/**
 * To add a ConnectRPC hook for a new BE client service:
 * 1. Create a new file in the `data/rest` directory with a name matching the service
 * 2. Copy the below template replacing `newService` with the service name
 *   a. The client service, Request, and Response types are imported from the generated client
 *   b. You can use exploreStats as a reference for how to structure the hook
 * export function useNewServiceQuery(
    input?: PartialMessage<NewServiceRequest>,
  ): UseQueryResult<NewServiceResponse, ConnectError> {
    return useQuery(newService, input, { transport: uniswapGetTransport })
  }
 */

export const dataApiGetTransport = createConnectTransportWithDefaults({
  options: { useHttpGet: true },
  getBaseUrlOverride: () => uniswapUrls.dataApiBaseUrlV2,
})

export const dataApiPostTransport = createConnectTransportWithDefaults({
  getBaseUrlOverride: () => uniswapUrls.dataApiBaseUrlV2,
})

/**
 * ConnectRPC transport for services behind the entry-gateway (sessions-authenticated).
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
 * The same as entryGatewayPostTransport, but always uses the prod entry gateway URL
 */
export const entryGatewayProdPostTransport = createConnectTransportWithDefaults({
  options: { credentials: 'omit' },
  getBaseUrlOverride: () => getEntryGatewayUrl(Environment.PROD),
})
