import { createPromiseClient } from '@connectrpc/connect'
import { DataApiService } from '@uniswap/client-data-api/dist/data/v1/api_connect'
import { getRbCloudflareApiBaseUrl, getTransport } from '@universe/api'
import type { RestPriceClient, TokenIdentifier, TokenPriceData } from '@universe/prices'
import { createPriceKey } from '@universe/prices'
import { BASE_UNISWAP_HEADERS } from 'uniswap/src/data/apiClients/createUniswapFetchClient'

// GetTokenPrices is on the Uniswap EGW, not the CF gateway.
// Route through the RigoBlock worker's /v2/entry-gateway/ proxy which forwards to EGW
// with Origin: app.uniswap.org — no client-side session cookies required.
const dataApiTransport = getTransport({
  getBaseUrl: () => `${getRbCloudflareApiBaseUrl()}/v2/entry-gateway`,
  getHeaders: () => BASE_UNISWAP_HEADERS,
})

const dataApiClient = createPromiseClient(DataApiService, dataApiTransport)

/**
 * Creates a RestPriceClient that uses the ConnectRPC DataApiService
 * to fetch token prices via POST /data.v1.DataApiService/GetTokenPrices.
 *
 * @param options.preferQuotePrices - When true, the backend returns TAPI quote
 *   prices (with Aurora as fallback) and logs the comparison. Used during the
 *   metrics collection phase to validate Aurora data quality before full rollout.
 */
export function createRestPriceClient(options?: { preferQuotePrices?: boolean }): RestPriceClient {
  const preferQuotePrices = options?.preferQuotePrices ?? false

  return {
    async getTokenPrices(tokens: TokenIdentifier[]): Promise<Map<string, TokenPriceData>> {
      const response = await dataApiClient.getTokenPrices({
        tokens: tokens.map((t) => ({
          chainId: t.chainId,
          address: t.address.toLowerCase(),
        })),
        preferQuotePrices,
      })

      const result = new Map<string, TokenPriceData>()

      for (const tp of response.tokenPrices) {
        if (tp.priceUsd != null) {
          const key = createPriceKey(tp.chainId, tp.address)
          result.set(key, {
            price: tp.priceUsd,
            timestamp: tp.updatedAt ? new Date(tp.updatedAt).getTime() : Date.now(),
          })
        }
      }

      return result
    },
  }
}
