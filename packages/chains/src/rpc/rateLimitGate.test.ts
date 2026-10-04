import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  getRateLimitCooldownRemainingMs,
  noteFetchFailure,
  noteRateLimitedResponse,
  noteSuccessfulResponse,
  parseRetryAfterMs,
  rateLimitedFetch,
  throwIfRateLimited,
} from './rateLimitGate'

// The gate keeps module-scoped state keyed by origin. Use a unique origin per
// test so tests never interfere with each other.
let originCounter = 0
function uniqueOrigin(): string {
  originCounter += 1
  return `https://origin-${originCounter}.test`
}

function response429(headers?: HeadersInit): Response {
  return new Response('too many requests', { status: 429, headers })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('rateLimitGate', () => {
  test('first 429 sets a cooldown on the origin', () => {
    const origin = uniqueOrigin()
    expect(getRateLimitCooldownRemainingMs(`${origin}/rpc/1`)).toBe(0)

    noteRateLimitedResponse(`${origin}/rpc/1`, response429())

    expect(getRateLimitCooldownRemainingMs(`${origin}/rpc/1`)).toBeGreaterThan(0)
  })

  test('429 on one origin does not gate another origin', () => {
    const a = uniqueOrigin()
    const b = uniqueOrigin()
    noteRateLimitedResponse(`${a}/rpc/1`, response429())

    expect(() => throwIfRateLimited(`${b}/rpc/1`)).not.toThrow()
  })

  test('all paths on the same origin share the cooldown', () => {
    const origin = uniqueOrigin()
    noteRateLimitedResponse(`${origin}/rpc/1`, response429())

    expect(() => throwIfRateLimited(`${origin}/rpc/42161`)).toThrow(/rate limited/)
    expect(() => throwIfRateLimited(`${origin}/v2/liquidity/x`)).toThrow(/rate limited/)
  })

  test('throwIfRateLimited attaches status 429 for status-based error handling', () => {
    const origin = uniqueOrigin()
    noteRateLimitedResponse(`${origin}/rpc/1`, response429())

    try {
      throwIfRateLimited(`${origin}/rpc/1`)
      expect.unreachable()
    } catch (error) {
      expect((error as Error & { status?: number }).status).toBe(429)
    }
  })

  test('consecutive 429s back off exponentially', () => {
    const origin = uniqueOrigin()
    const url = `${origin}/rpc/1`

    noteRateLimitedResponse(url, response429())
    const first = getRateLimitCooldownRemainingMs(url)

    noteRateLimitedResponse(url, response429())
    const second = getRateLimitCooldownRemainingMs(url)

    expect(second).toBeGreaterThan(first)
  })

  test('Retry-After (seconds) header is honored', () => {
    const origin = uniqueOrigin()
    const url = `${origin}/rpc/1`

    noteRateLimitedResponse(url, response429({ 'Retry-After': '30' }))
    const remaining = getRateLimitCooldownRemainingMs(url)

    expect(remaining).toBeGreaterThan(25_000)
    expect(remaining).toBeLessThanOrEqual(31_000)
  })

  test('Retry-After (HTTP date) header is honored', () => {
    const origin = uniqueOrigin()
    const url = `${origin}/rpc/1`
    const date = new Date(Date.now() + 20_000).toUTCString()

    noteRateLimitedResponse(url, response429({ 'Retry-After': date }))

    const remaining = getRateLimitCooldownRemainingMs(url)
    expect(remaining).toBeGreaterThan(0)
    expect(remaining).toBeLessThanOrEqual(21_000)
  })

  test('successful response clears the cooldown state', () => {
    const origin = uniqueOrigin()
    const url = `${origin}/rpc/1`

    noteRateLimitedResponse(url, response429())
    expect(getRateLimitCooldownRemainingMs(url)).toBeGreaterThan(0)

    noteSuccessfulResponse(url)
    expect(getRateLimitCooldownRemainingMs(url)).toBe(0)
    expect(() => throwIfRateLimited(url)).not.toThrow()
  })

  test('non-429/401 responses are ignored by noteRateLimitedResponse', () => {
    const origin = uniqueOrigin()
    noteRateLimitedResponse(`${origin}/rpc/1`, new Response('ok', { status: 200 }))
    noteRateLimitedResponse(`${origin}/rpc/1`, new Response('server error', { status: 500 }))

    expect(getRateLimitCooldownRemainingMs(`${origin}/rpc/1`)).toBe(0)
  })

  describe('401 handling', () => {
    const response401 = (): Response => new Response('unauthorized', { status: 401 })

    test('a single 401 does not gate (session-gate recovery must stay possible)', () => {
      const origin = uniqueOrigin()
      const url = `${origin}/rpc/1`

      noteRateLimitedResponse(url, response401())

      expect(getRateLimitCooldownRemainingMs(url)).toBe(0)
      expect(() => throwIfRateLimited(url)).not.toThrow()
    })

    test('two consecutive 401s still do not gate', () => {
      const origin = uniqueOrigin()
      const url = `${origin}/rpc/1`

      noteRateLimitedResponse(url, response401())
      noteRateLimitedResponse(url, response401())

      expect(getRateLimitCooldownRemainingMs(url)).toBe(0)
    })

    test('three consecutive 401s trip the cooldown (persistent-auth-failure spam guard)', () => {
      const origin = uniqueOrigin()
      const url = `${origin}/rpc/1`

      noteRateLimitedResponse(url, response401())
      noteRateLimitedResponse(url, response401())
      noteRateLimitedResponse(url, response401())

      expect(getRateLimitCooldownRemainingMs(url)).toBeGreaterThan(0)
      expect(() => throwIfRateLimited(url)).toThrow(/rate limited/)
    })

    test('a success resets the consecutive-401 count', () => {
      const origin = uniqueOrigin()
      const url = `${origin}/rpc/1`

      noteRateLimitedResponse(url, response401())
      noteRateLimitedResponse(url, response401())
      noteSuccessfulResponse(url)
      noteRateLimitedResponse(url, response401())

      expect(getRateLimitCooldownRemainingMs(url)).toBe(0)
    })
  })

  test('rateLimitedFetch makes no network call while cooling down', async () => {
    const origin = uniqueOrigin()
    const url = `${origin}/rpc/1`
    noteRateLimitedResponse(url, response429())

    const fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    await expect(rateLimitedFetch(url, { method: 'POST' })).rejects.toThrow(/rate limited/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  test('rateLimitedFetch records a 429 from the network and passes the response through', async () => {
    const origin = uniqueOrigin()
    const url = `${origin}/rpc/1`

    globalThis.fetch = vi.fn(async () => response429()) as unknown as typeof fetch

    const response = await rateLimitedFetch(url, { method: 'POST' })
    expect(response.status).toBe(429)
    expect(getRateLimitCooldownRemainingMs(url)).toBeGreaterThan(0)
  })

  test('rateLimitedFetch blocks during cooldown and allows requests again after expiry', async () => {
    const origin = uniqueOrigin()
    const url = `${origin}/rpc/1`

    globalThis.fetch = vi.fn(async () => response429()) as unknown as typeof fetch

    await rateLimitedFetch(url, { method: 'POST' })
    expect(getRateLimitCooldownRemainingMs(url)).toBeGreaterThan(0)

    // Within the cooldown, the gate rejects before the network.
    await expect(rateLimitedFetch(url, { method: 'POST' })).rejects.toThrow(/rate limited/)

    // After cooldown expiry the request reaches the network again.
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_000)
    try {
      await rateLimitedFetch(url, { method: 'POST' })
      expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2)
    } finally {
      nowSpy.mockRestore()
    }
  })

  test('parseRetryAfterMs returns null for missing or invalid headers', () => {
    const now = Date.now()
    expect(parseRetryAfterMs(new Response('', { status: 429 }), now)).toBeNull()
    expect(parseRetryAfterMs(response429({ 'Retry-After': 'not-a-date' }), now)).toBeNull()
  })

  describe('fetch-failure handling (CORS-blocked 429s are invisible to response hooks)', () => {
    test('a single fetch failure does not gate (transient hiccups must recover)', () => {
      const origin = uniqueOrigin()
      const url = `${origin}/rpc/1`

      noteFetchFailure(url)

      expect(getRateLimitCooldownRemainingMs(url)).toBe(0)
      expect(() => throwIfRateLimited(url)).not.toThrow()
    })

    test('three consecutive fetch failures trip the cooldown', () => {
      const origin = uniqueOrigin()
      const url = `${origin}/rpc/1`

      noteFetchFailure(url)
      noteFetchFailure(url)
      expect(getRateLimitCooldownRemainingMs(url)).toBe(0)

      noteFetchFailure(url)

      expect(getRateLimitCooldownRemainingMs(url)).toBeGreaterThan(0)
      expect(() => throwIfRateLimited(url)).toThrow(/rate limited/)
    })

    test('consecutive fetch failures back off exponentially', () => {
      const origin = uniqueOrigin()
      const url = `${origin}/rpc/1`

      noteFetchFailure(url)
      noteFetchFailure(url)
      noteFetchFailure(url)
      const first = getRateLimitCooldownRemainingMs(url)

      noteFetchFailure(url)
      const second = getRateLimitCooldownRemainingMs(url)

      expect(second).toBeGreaterThan(first)
    })

    test('a completed response resets the fetch-failure count', () => {
      const origin = uniqueOrigin()
      const url = `${origin}/rpc/1`

      noteFetchFailure(url)
      noteFetchFailure(url)
      // A response arrived (any status) — the network path works again.
      noteRateLimitedResponse(url, new Response('server error', { status: 500 }))
      noteFetchFailure(url)

      expect(getRateLimitCooldownRemainingMs(url)).toBe(0)
    })

    test('rateLimitedFetch records a rejected fetch and stops network I/O after the threshold', async () => {
      const origin = uniqueOrigin()
      const url = `${origin}/rpc/1`
      const fetchSpy = vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      })
      globalThis.fetch = fetchSpy as unknown as typeof fetch

      await expect(rateLimitedFetch(url, { method: 'POST' })).rejects.toThrow('Failed to fetch')
      await expect(rateLimitedFetch(url, { method: 'POST' })).rejects.toThrow('Failed to fetch')
      expect(getRateLimitCooldownRemainingMs(url)).toBe(0)

      await expect(rateLimitedFetch(url, { method: 'POST' })).rejects.toThrow('Failed to fetch')
      expect(getRateLimitCooldownRemainingMs(url)).toBeGreaterThan(0)
      expect(fetchSpy).toHaveBeenCalledTimes(3)

      // While cooling down, no further network calls are made.
      await expect(rateLimitedFetch(url, { method: 'POST' })).rejects.toThrow(/rate limited/)
      expect(fetchSpy).toHaveBeenCalledTimes(3)
    })

    test('rateLimitedFetch recovers once responses complete again after the cooldown', async () => {
      const origin = uniqueOrigin()
      const url = `${origin}/rpc/1`

      globalThis.fetch = vi
        .fn()
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce(
          new Response('{"jsonrpc":"2.0","id":1,"result":"0x1"}', { status: 200 }),
        ) as unknown as typeof fetch

      for (let i = 0; i < 3; i++) {
        await expect(rateLimitedFetch(url, { method: 'POST' })).rejects.toThrow('Failed to fetch')
      }
      expect(getRateLimitCooldownRemainingMs(url)).toBeGreaterThan(0)

      // During the cooldown the gate fails fast without network I/O.
      await expect(rateLimitedFetch(url, { method: 'POST' })).rejects.toThrow(/rate limited/)
      expect(globalThis.fetch).toHaveBeenCalledTimes(3)

      // After the cooldown expires, the next request reaches the network and a
      // successful response clears the cooldown state entirely.
      const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_000)
      try {
        const response = await rateLimitedFetch(url, { method: 'POST' })
        expect(response.status).toBe(200)
        expect(getRateLimitCooldownRemainingMs(url)).toBe(0)
      } finally {
        nowSpy.mockRestore()
      }
    })
  })
})
