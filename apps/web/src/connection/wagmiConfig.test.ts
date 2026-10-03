import { mainnet } from 'viem/chains'
import { afterEach, beforeEach, vi } from 'vitest'
import { orderedTransportUrls, SAFE_ALLOWED_ORIGIN, buildUniRpcTransportFactoryForConfig } from '~/connection/wagmiConfig'

// A minimal type that matches the structure returned by getChainInfo().
type MockChain = {
  rpcUrls: {
    interface?: { http?: (string | undefined)[] }
    default?: { http?: (string | undefined)[] }
    public?: { http?: (string | undefined)[] }
    fallback?: { http?: (string | undefined)[] }
  }
}

describe('orderedTransportUrls', () => {
  it('returns URLs in correct order (interface > default > public > fallback) & removes duplicates', () => {
    const chain: MockChain = {
      rpcUrls: {
        interface: { http: ['https://main1.com', 'https://main2.com'] },
        default: { http: ['https://main2.com'] },
        public: { http: ['https://public.com'] },
        fallback: { http: ['https://fallback1.com', 'https://main1.com'] },
      },
    }

    const result = orderedTransportUrls(chain as any)
    // Explanation of expected behavior:
    // 1. interface: main1, main2
    // 2. default:   main2 (duplicate, skip)
    // 3. public:    public.com
    // 4. fallback:  fallback1, main1 (duplicate, skip)
    //
    // => final array: [main1, main2, public, fallback1]
    expect(result).toHaveLength(4)
    expect(result).toEqual(['https://main1.com', 'https://main2.com', 'https://public.com', 'https://fallback1.com'])
  })

  it('filters out undefined or empty strings', () => {
    const chain: MockChain = {
      rpcUrls: {
        interface: { http: ['https://interface.com', '', undefined] },
        default: { http: [undefined, ''] },
        public: { http: [] },
        fallback: { http: ['https://fallback.com'] },
      },
    }

    const result = orderedTransportUrls(chain as any)
    // Should remove empty/undefined entries
    expect(result).toEqual(['https://interface.com', 'https://fallback.com'])
  })

  it('handles scenario where some keys are missing', () => {
    const chain: MockChain = {
      rpcUrls: {
        // interface is missing
        default: { http: ['https://default.com'] },
        // public is missing
        fallback: { http: ['https://fallback.com'] },
      },
    }

    const result = orderedTransportUrls(chain as any)
    // Should gather from default, then fallback
    expect(result).toEqual(['https://default.com', 'https://fallback.com'])
  })

  it('returns empty array if everything is empty/undefined', () => {
    const chain: MockChain = {
      rpcUrls: {
        interface: { http: [] },
        default: { http: [] },
        public: { http: [] },
        fallback: { http: [] },
      },
    }

    const result = orderedTransportUrls(chain as any)
    expect(result).toEqual([])
  })

  it('deduplicates URLs across arrays', () => {
    const chain: MockChain = {
      rpcUrls: {
        interface: { http: ['https://common.com'] },
        default: { http: ['https://common.com'] },
        public: { http: ['https://common.com'] },
        fallback: { http: ['https://common.com'] },
      },
    }

    const result = orderedTransportUrls(chain as any)
    // All four arrays have the same URL => only one unique entry
    expect(result).toHaveLength(1)
    expect(result).toEqual(['https://common.com'])
  })
})

describe('SAFE_ALLOWED_ORIGIN', () => {
  it('matches the canonical Safe web app origin', () => {
    expect(SAFE_ALLOWED_ORIGIN.test('https://app.safe.global')).toBe(true)
  })
  it('rejects subdomain spoofing', () => {
    expect(SAFE_ALLOWED_ORIGIN.test('https://evil.app.safe.global')).toBe(false)
  })

  it('rejects suffix spoofing', () => {
    expect(SAFE_ALLOWED_ORIGIN.test('https://app.safe.global.evil.com')).toBe(false)
  })

  it('rejects http scheme downgrade', () => {
    expect(SAFE_ALLOWED_ORIGIN.test('http://app.safe.global')).toBe(false)
  })

  it('rejects origin with path appended', () => {
    expect(SAFE_ALLOWED_ORIGIN.test('https://app.safe.global/path')).toBe(false)
  })

  it('rejects arbitrary attacker origin', () => {
    expect(SAFE_ALLOWED_ORIGIN.test('https://attacker.com')).toBe(false)
  })

  it('rejects origin with port', () => {
    expect(SAFE_ALLOWED_ORIGIN.test('https://app.safe.global:8080')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(SAFE_ALLOWED_ORIGIN.test('')).toBe(false)
  })

  it('rejects null origin', () => {
    expect(SAFE_ALLOWED_ORIGIN.test('null')).toBe(false)
  })
})


describe('buildUniRpcTransportFactoryForConfig — RigoBlock header session auth', () => {
  // Unique origins: the rate-limit gate keeps module-scoped state and these
  // tests must not interfere with each other.
  let originCounter = 0
  function uniqueRpcUrl(): string {
    originCounter += 1
    return `https://wagmi-header-auth-test-${originCounter}.invalid/rpc/1`
  }

  let lastInit: RequestInit | undefined
  let lastUrl: string | undefined

  beforeEach(() => {
    lastInit = undefined
    lastUrl = undefined
    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      lastUrl = String(url)
      lastInit = init
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x2328' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as unknown as typeof fetch
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function sendRequest(rpcConfig: {
    rpcUrl: string
    headers?: Record<string, string>
    getRequestHeaders?: () => Promise<Record<string, string>>
  }): Promise<unknown> {
    const factory = buildUniRpcTransportFactoryForConfig(rpcConfig)
    const transport = factory({ config: { rpcUrl: rpcConfig.rpcUrl, headers: rpcConfig.headers ?? {} } })
    return transport({ chain: mainnet, retryCount: 0 }).request({ method: 'eth_blockNumber', params: [] })
  }

  it('attaches X-Session-ID per request when getRequestHeaders is set', async () => {
    const rpcUrl = uniqueRpcUrl()
    const getRequestHeaders = vi.fn().mockResolvedValue({ 'x-session-id': 'sess-1', 'x-device-id': 'dev-1' })

    await sendRequest({ rpcUrl, headers: { 'x-request-source': 'uniswap-web' }, getRequestHeaders })

    const headers = new Headers(lastInit?.headers as HeadersInit)
    expect(headers.get('x-session-id')).toBe('sess-1')
    expect(headers.get('x-device-id')).toBe('dev-1')
    expect(headers.get('x-request-source')).toBe('uniswap-web')
  })

  it('resolves headers per request (not once at construction)', async () => {
    const rpcUrl = uniqueRpcUrl()
    const getRequestHeaders = vi.fn().mockResolvedValue({ 'x-session-id': 'sess' })

    await sendRequest({ rpcUrl, getRequestHeaders })
    await sendRequest({ rpcUrl, getRequestHeaders })

    expect(getRequestHeaders).toHaveBeenCalledTimes(2)
  })

  it('keeps the cookies strategy (credentials omit) when no getRequestHeaders', async () => {
    const rpcUrl = uniqueRpcUrl()

    await sendRequest({ rpcUrl, headers: { 'x-request-source': 'uniswap-web' } })

    expect(lastInit?.credentials).toBe('omit')
  })
})
