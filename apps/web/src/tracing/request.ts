import { isTracing, trace } from 'tracing/trace'
import { TraceContext } from 'tracing/types'
import { Chain } from 'uniswap/src/data/graphql/uniswap-data-api/__generated__/types-and-hooks'
import { getChainIdByInfuraPrefix, toGraphQLChain } from 'uniswap/src/features/chains/utils'

export function patchFetch(api: Pick<typeof globalThis, 'fetch'>) {
  const apiFetch = api.fetch
  api.fetch = tracedFetch

  function tracedFetch(input: RequestInfo, init?: RequestInit): Promise<Response>
  function tracedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
  function tracedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    let url
    try {
      // Hot-module reload passes a relative path to a local file, which is a technically malformed URL.
      url = new URL(typeof input === 'string' ? input : 'url' in input ? input.url : input)
    } catch {
      return apiFetch(input, init)
    }

    const traceContext = getTraceContext(url, init, isTracing())
    if (traceContext) {
      return trace(traceContext, async (trace) => {
        const response = await apiFetch(input, init)
        trace.setHttpStatus(response.status)
        if (is2xx(response.status)) {
          try {
            // Check for 200 responses which wrap an error
            const json = await response.clone().json()
            const error = json.error ?? json.errors
            if (error) {
              trace.setError(error)
            }
          } catch {
            // ignore the error
          }
        } else {
          try {
            const text = await response.clone().text()
            try {
              // Try to set a structured error, if possible.
              trace.setError(JSON.parse(text))
            } catch (e) {
              trace.setError(text)
            }
          } catch {
            trace.setError(response.statusText)
          }
        }
        return response
      })
    } else {
      return apiFetch(input, init)
    }
  }
}

function is2xx(status: number) {
  return status >= 200 && status < 300
}

export function getTraceContext(url: URL, init?: RequestInit, force = false): TraceContext | false {
  if (url.host.endsWith('gateway.rigoblock.com')) {
    if (url.pathname.endsWith('graphql')) {
      let operation: string | undefined
      let chain: Chain | undefined
      let address: string | undefined
      try {
        const body = JSON.parse(init?.body as string) as {
          operationName: string
          variables: { chain?: Chain; address?: string }
        }
        operation = body.operationName
        chain = body.variables?.chain
        address = body.variables?.address
      } catch {
        // ignore the error
      }
      return {
        name: `${url.host} ${operation}`,
        op: 'http.graphql.query',
        tags: { host: url.host, operation, chain, address },
      }
    } else {
      return {
        name: `${url.host} ${url.pathname}`,
        op: 'http.client',
        tags: { host: url.host },
        data: { path: url.pathname },
      }
    }
  } else if (url.host.endsWith('.infura.io') || url.host.endsWith('.quiknode.pro')) {
    let method: string | undefined
    let chain: Chain | undefined
    try {
      const body = JSON.parse(Buffer.from(init?.body as Uint8Array).toString())
      method = body.method

      const chainId = getChainIdByInfuraPrefix(url.host.split('.')[0])
      if (chainId) {
        chain = toGraphQLChain(chainId)
      }
    } catch {
      // ignore the error
    }
    return { name: `${url.host} ${method}`, op: 'http.json_rpc', tags: { host: url.host, method, chain } }
  } else if (force) {
    return {
      name: `${url.host} ${url.pathname}`,
      op: 'http.client',
      tags: { host: url.host },
      data: { path: url.pathname },
    }
  } else {
    return false
  }
}
