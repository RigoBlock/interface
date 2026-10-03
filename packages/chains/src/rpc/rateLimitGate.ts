/**
 * Client-side rate-limit gate for RPC endpoints (RigoBlock fork).
 *
 * The entry gateway answers 429 when a client exceeds its quota. Without a
 * client-side gate, every poller and retry loop (viem watchers per chain,
 * ethers block-number polling, transport-level retries) fires its own
 * immediate retries on error and multiplies request volume several-fold
 * while the endpoint is already rejecting traffic.
 *
 * Behavior: the first 429 response records a per-origin cooldown (honoring
 * Retry-After when present, otherwise exponential backoff). While an origin
 * is cooling down, requests to it fail fast with a synthetic 429 error
 * WITHOUT touching the network. Callers (viem/ethers retry loops) still see
 * an error and apply their own scheduling, but no HTTP request is made, so
 * the endpoint gets relief. A successful response clears the backoff.
 *
 * The gate is module-scoped and keyed by origin so all transports (viem,
 * ethers, session-gated) share one cooldown per endpoint.
 */

const DEFAULT_COOLDOWN_MS = 5_000
const MAX_COOLDOWN_MS = 120_000
const MAX_TRACKED_ORIGINS = 50

interface OriginRateLimitState {
  cooldownUntilMs: number
  consecutive429s: number
}

const stateByOrigin = new Map<string, OriginRateLimitState>()

function getOrigin(url: string): string {
  try {
    return new URL(url).origin
  } catch {
    return url
  }
}

function jitter(ms: number): number {
  return ms + Math.floor(Math.random() * Math.min(ms / 2, 1_000))
}

/** Exported for tests. */
export function parseRetryAfterMs(response: Response, nowMs: number): number | null {
  const header = response.headers.get('Retry-After')
  if (!header) {
    return null
  }
  const seconds = Number(header)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1_000
  }
  const date = Date.parse(header)
  if (!Number.isNaN(date)) {
    return Math.max(0, date - nowMs)
  }
  return null
}

/**
 * Records a 429 response: extends the origin's cooldown. Callers invoke this
 * from a response hook (viem `onFetchResponse`) or a fetch wrapper.
 */
export function noteRateLimitedResponse(url: string, response: Response): void {
  if (response.status !== 429) {
    return
  }
  const origin = getOrigin(url)
  if (stateByOrigin.size >= MAX_TRACKED_ORIGINS && !stateByOrigin.has(origin)) {
    return
  }
  const state = stateByOrigin.get(origin) ?? { cooldownUntilMs: 0, consecutive429s: 0 }
  state.consecutive429s += 1
  const nowMs = Date.now()
  const retryAfterMs = parseRetryAfterMs(response, nowMs)
  const backoffMs = Math.min(
    MAX_COOLDOWN_MS,
    retryAfterMs ?? DEFAULT_COOLDOWN_MS * 2 ** (state.consecutive429s - 1),
  )
  state.cooldownUntilMs = nowMs + jitter(backoffMs)
  stateByOrigin.set(origin, state)
}

/** Exported for tests. */
export function noteSuccessfulResponse(url: string): void {
  const origin = getOrigin(url)
  if (stateByOrigin.has(origin)) {
    stateByOrigin.delete(origin)
  }
}

export function getRateLimitCooldownRemainingMs(url: string, nowMs = Date.now()): number {
  const state = stateByOrigin.get(getOrigin(url))
  return state ? Math.max(0, state.cooldownUntilMs - nowMs) : 0
}

/**
 * Throws a synthetic 429 error when the origin is cooling down, so the
 * request fails before any network I/O. Attach `.status = 429` so existing
 * status-based error handling (session gate, observability) keeps working.
 */
export function throwIfRateLimited(url: string): void {
  const remainingMs = getRateLimitCooldownRemainingMs(url)
  if (remainingMs <= 0) {
    return
  }
  const error = new Error(`RPC endpoint rate limited (429); cooling down for ${remainingMs}ms`) as Error & {
    status?: number
  }
  error.status = 429
  throw error
}

/**
 * Drop-in `fetch` replacement that consults the gate before the network and
 * records 429s / successes afterwards.
 */
export async function rateLimitedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  throwIfRateLimited(url)
  const response = await fetch(input, init)
  if (response.status === 429) {
    noteRateLimitedResponse(url, response)
  } else if (response.ok) {
    noteSuccessfulResponse(url)
  }
  return response
}
