import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import { Protocol } from '@uniswap/router-sdk'
import ms from 'ms'
import {
  ClassicAPIConfig,
  GetQuoteArgs,
  INTERNAL_ROUTER_PREFERENCE_PRICE,
  QuoteIntent,
  QuoteMethod,
  QuoteState,
  RouterPreference,
  RoutingConfig,
  TradeResult,
  URAQuoteResponse,
  URAQuoteType,
  UniswapXConfig,
  UniswapXPriorityOrdersConfig,
  UniswapXv2Config,
} from 'state/routing/types'
import { isExactInput, transformQuoteToTrade } from 'state/routing/utils'
import { trace } from 'tracing/trace'
import { InterfaceEventNameLocal } from 'uniswap/src/features/telemetry/constants'
import { sendAnalyticsEvent } from 'uniswap/src/features/telemetry/send'
import { logSwapQuoteFetch } from 'uniswap/src/features/transactions/swap/analytics'
import { logger } from 'utilities/src/logger/logger'

const UNISWAP_GATEWAY_DNS_URL = process.env.REACT_APP_UNISWAP_GATEWAY_DNS
if (UNISWAP_GATEWAY_DNS_URL === undefined) {
  throw new Error(`UNISWAP_GATEWAY_DNS_URL must be defined environment variables`)
}

const CLIENT_PARAMS = {
  protocols: [Protocol.V2, Protocol.V3, Protocol.MIXED],
}

const protocols: Protocol[] = [Protocol.V2, Protocol.V3, Protocol.MIXED]

// routing API quote query params: https://github.com/Uniswap/routing-api/blob/main/lib/handlers/quote/schema/quote-schema.ts
const DEFAULT_QUERY_PARAMS = {
  // this should be removed once BE fixes issue where enableUniversalRouter is required for fees to work
  enableUniversalRouter: false,
}

function getRoutingAPIConfig(args: GetQuoteArgs): RoutingConfig {
  const {
    account,
    uniswapXForceSyntheticQuotes,
    routerPreference,
    protocolPreferences,
    isXv2,
    priceImprovementBps,
    forceOpenOrders,
    deadlineBufferSecs,
    isXv2Arbitrum,
    isPriorityOrder,
    isUniswapXSupportedChain,
  } = args

  const uniswapX: UniswapXConfig = {
    useSyntheticQuotes: uniswapXForceSyntheticQuotes,
    swapper: account,
    routingType: URAQuoteType.DUTCH_V1,
  }

  const uniswapXPriorityOrders: UniswapXPriorityOrdersConfig = {
    routingType: URAQuoteType.PRIORITY,
    swapper: account,
  }

  const uniswapXv2: UniswapXv2Config = {
    useSyntheticQuotes: uniswapXForceSyntheticQuotes || isXv2Arbitrum,
    swapper: account,
    routingType: URAQuoteType.DUTCH_V2,
    ...(isXv2Arbitrum
      ? {
          priceImprovementBps,
          forceOpenOrders,
          deadlineBufferSecs,
        }
      : {}),
  }

  const classic: ClassicAPIConfig = {
    ...DEFAULT_QUERY_PARAMS,
    protocols: protocolPreferences && protocolPreferences.length > 0 ? protocolPreferences : protocols,
    routingType: URAQuoteType.CLASSIC,
    recipient: account,
    enableFeeOnTransferFeeFetching: true,
  }

  if (
    // If the user has opted out of UniswapX during the opt-out transition period, we should respect that preference and only request classic quotes.
    routerPreference === RouterPreference.API ||
    routerPreference === INTERNAL_ROUTER_PREFERENCE_PRICE ||
    !isUniswapXSupportedChain
  ) {
    return [classic]
  }

  return [isPriorityOrder ? uniswapXPriorityOrders : isXv2 || isXv2Arbitrum ? uniswapXv2 : uniswapX, classic]
}

export const routingApi = createApi({
  reducerPath: 'routingApi',
  baseQuery: fetchBaseQuery(),
  endpoints: (build) => ({
    getQuote: build.query<TradeResult, GetQuoteArgs>({
      queryFn(args, _api, _extraOptions, fetch) {
        return trace({ name: 'Quote', op: 'quote', data: { ...args } }, async (trace) => {
          logSwapQuoteFetch({
            chainId: args.tokenInChainId,
            isUSDQuote: args.routerPreference === INTERNAL_ROUTER_PREFERENCE_PRICE,
          })
          const {
            tokenInAddress: tokenIn,
            tokenInChainId,
            tokenOutAddress: tokenOut,
            tokenOutChainId,
            amount,
            tradeType,
            sendPortionEnabled,
            arbitrumXV2SlippageTolerance,
          } = args

          const requestBody = {
            tokenInChainId,
            tokenIn,
            tokenOutChainId,
            tokenOut,
            amount,
            sendPortionEnabled,
            type: isExactInput(tradeType) ? 'EXACT_INPUT' : 'EXACT_OUTPUT',
            intent:
              args.routerPreference === INTERNAL_ROUTER_PREFERENCE_PRICE ? QuoteIntent.Pricing : QuoteIntent.Quote,
            configs: getRoutingAPIConfig(args),
            useUniswapX: args.routerPreference === RouterPreference.X,
            swapper: args.account,
            slippageTolerance: arbitrumXV2SlippageTolerance,
          }

          try {
            return trace.child({ name: 'Quote on server', op: 'quote.server' }, async () => {
              const response = await fetch({
                method: 'POST',
                url: `${UNISWAP_GATEWAY_DNS_URL}/quote`,
                body: JSON.stringify(requestBody),
                headers: {
                  'x-request-source': 'uniswap-web',
                },
              })

              if (response.error) {
                try {
                  // cast as any here because we do a runtime check on it being an object before indexing into .errorCode
                  const errorData = response.error.data as { errorCode?: string; detail?: string }
                  // NO_ROUTE should be treated as a valid response to prevent retries.
                  if (
                    typeof errorData === 'object' &&
                    (errorData?.errorCode === 'NO_ROUTE' || errorData?.detail === 'No quotes available')
                  ) {
                    sendAnalyticsEvent(InterfaceEventNameLocal.NoQuoteReceivedFromRoutingAPI, {
                      requestBody,
                      response,
                      routerPreference: args.routerPreference,
                    })
                    return {
                      data: { state: QuoteState.NOT_FOUND, latencyMs: trace.now() },
                    }
                  }
                } catch {
                  throw response.error
                }
              }

              const uraQuoteResponse = response.data as URAQuoteResponse
              const tradeResult = await transformQuoteToTrade(args, uraQuoteResponse, QuoteMethod.ROUTING_API)
              return { data: { ...tradeResult, latencyMs: trace.now() } }
            })
          } catch (error: any) {
            logger.warn(
              'routing/slice',
              'queryFn',
              `GetQuote failed on Unified Routing API, falling back to client: ${
                error?.message ?? error?.detail ?? error
              }`,
            )
          }

          try {
            return trace.child({ name: 'Quote on client', op: 'quote.client' }, async () => {
              const { getRouter, getClientSideQuote } = await import('lib/hooks/routing/clientSideSmartOrderRouter')
              const router = getRouter(args.tokenInChainId)
              const quoteResult = await getClientSideQuote(args, router, CLIENT_PARAMS)
              if (quoteResult.state === QuoteState.SUCCESS) {
                const trade = await transformQuoteToTrade(args, quoteResult.data, QuoteMethod.CLIENT_SIDE_FALLBACK)
                return {
                  data: { ...trade, latencyMs: trace.now() },
                }
              } else {
                return { data: { ...quoteResult, latencyMs: trace.now() } }
              }
            })
          } catch (error: any) {
            logger.warn('routing/slice', 'queryFn', `GetQuote failed on client: ${error}`)
            trace.setError(error)
            return {
              error: { status: 'CUSTOM_ERROR', error: error?.detail ?? error?.message ?? error },
            }
          }
        })
      },
      keepUnusedDataFor: ms(`10s`),
      extraOptions: {
        maxRetries: 0,
      },
    }),
  }),
})

export const { useGetQuoteQuery } = routingApi
export const useGetQuoteQueryState = routingApi.endpoints.getQuote.useQueryState
