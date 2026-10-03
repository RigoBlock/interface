import { createFetchClient } from '@universe/api/src/clients/base/createFetchClient'
import type { FetchClient, FetchClientContext } from '@universe/api/src/clients/base/types'

/**
 * Context for a Trading API `FetchClient`. The session deps (`getSession`,
 * `source`) and request wiring (`getBaseUrl`, `getHeaders`) are required because
 * every trading endpoint is session-gated; `defaultOptions` is owned by the
 * factory.
 */
export type TradingApiFetchClientContext = Omit<FetchClientContext, 'baseUrl' | 'defaultOptions'> &
  Required<Pick<FetchClientContext, 'getBaseUrl' | 'getHeaders' | 'getSession' | 'source'>>

/**
 * Builds the `FetchClient` used by every trading API client. Upstream sets
 * `credentials: 'include'` so web requests carry the HttpOnly session cookie
 * (scoped to `uniswap.org`) to the cross-origin trading backend; mobile and
 * extension authenticate via the `x-session-id` header.
 *
 * RigoBlock fork: the CF gateway returns Access-Control-Allow-Origin: *, which
 * browsers reject for credentialed requests, and RigoBlock does not use Uniswap
 * session cookies — so credentials are omitted (same rationale as
 * provideSessionService.web.ts).
 */
export function createTradingApiFetchClient(ctx: TradingApiFetchClientContext): FetchClient {
  return createFetchClient({
    ...ctx,
    defaultOptions: {
      // RigoBlock fork: see doc comment above — omit credentials (gateway ACAO: *).
      credentials: 'omit',
    },
  })
}
