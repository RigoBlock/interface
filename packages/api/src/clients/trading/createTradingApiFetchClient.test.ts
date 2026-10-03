import type { FetchClient } from '@universe/api/src/clients/base/types'
import { createTradingApiFetchClient } from '@universe/api/src/clients/trading/createTradingApiFetchClient'
import type { SessionService } from '@universe/sessions'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Upstream, web session is an HttpOnly cookie; the browser only attaches it to
 * cross-origin trading API requests when the fetch runs with
 * `credentials: 'include'`. The RigoBlock fork has no Uniswap session cookies
 * and the gateway responds with Access-Control-Allow-Origin: *, which browsers
 * reject for credentialed requests — so the factory sets `credentials: 'omit'`
 * and these tests are that contract.
 */
describe('createTradingApiFetchClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const getSessionService = (): SessionService => ({ getSessionState: async () => null }) as unknown as SessionService

  function setup(): { fetchMock: ReturnType<typeof vi.fn>; client: FetchClient } {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const client = createTradingApiFetchClient({
      getBaseUrl: () => 'https://trading.example.com',
      getHeaders: () => ({ 'x-api-key': 'test-key' }),
      getSessionService,
      getSession: () => null,
      source: 'test',
    })
    return { fetchMock, client }
  }

  it('sends credentials: omit on GET requests (RigoBlock fork: no session cookies, gateway ACAO: *)', async () => {
    const { fetchMock, client } = setup()

    await client.get('/quote')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://trading.example.com/quote',
      expect.objectContaining({ credentials: 'omit' }),
    )
  })

  it('sends credentials: omit on POST requests (RigoBlock fork: no session cookies, gateway ACAO: *)', async () => {
    const { fetchMock, client } = setup()

    await client.post('/quote', { body: JSON.stringify({ amount: '1' }) })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://trading.example.com/quote',
      expect.objectContaining({ credentials: 'omit', method: 'POST' }),
    )
  })

  it('still applies configured headers alongside the credentials mode', async () => {
    const { fetchMock, client } = setup()

    await client.get('/quote')

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(new Headers(init.headers).get('x-api-key')).toBe('test-key')
  })
})
