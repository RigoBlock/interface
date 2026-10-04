/**
 * Client-side rate-limit gate for RPC endpoints (RigoBlock fork).
 *
 * The entry gateway answers 429 when a client exceeds its quota. Without a
 * client-side gate, every poller and retry loop (viem watchers per chain,
 * ethers block-number polling, transport-level retries) fires its own
 * immediate retries on error and multiplies request volume several-fold
 * while the endpoint is already rejecting traffic.
 *
 * Behavior: a 429 response (or a run of 401s — see UNAUTH_THRESHOLD) records
 * a per-origin cooldown (honoring `Retry-After` for 429s, otherwise
 * exponential backoff). While an origin is cooling down, requests to it fail
 * fast with a synthetic 429 error WITHOUT touching the network. Callers
 * (viem/ethers retry loops) still see an error and apply their own
 * scheduling, but no HTTP request is made, so the endpoint gets relief. A
 * successful response clears the backoff.
 *
 * The gate is module-scoped and keyed by origin so all transports (viem,
 * ethers, session-gated) share one cooldown per endpoint.
 */

const DEFAULT_COOLDOWN_MS = 5_000
const MAX_COOLDOWN_MS = 120_000
const MAX_TRACKED_ORIGINS = 50
// 401 handling: the session gate legitimately sees single 401s (recover →
// retry once), so only trip the cooldown after several consecutive
// unauthorized responses — i.e. the endpoint is persistently rejecting this
// client and pollers would otherwise spam it on every interval.
const UNAUTH_THRESHOLD = 3
const UNAUTH_COOLDOWN_MS = 15_000
// Fetch-failure handling: a CORS-blocked response (e.g. an edge-generated 429
// without ACAO headers) never reaches JS as a Response — fetch rejects with a
// bare TypeError, so the 429/401 hooks above never fire and retry loops would
// hammer the endpoint forever. Treat a run of consecutive fetch-level failures
// the same as 429s and cool the origin down. Any completed HTTP response
// (even an error status) resets the counter: the network path is fine then.
const FETCH_FAILURE_THRESHOLD = 3
const FETCH_FAILURE_BASE_COOLDOWN_MS = 5_000

interface OriginRateLimitState {
  cooldownUntilMs: number
  consecutive429s: number
  consecutive401s: number
  consecutiveFetchFailures: number
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
 * Records an error response: extends the origin's cooldown. Callers invoke
 * this from a response hook (viem `onFetchResponse`) or a fetch wrapper.
 *
 * - 429 (Too Many Requests): cooldown immediately, backing off exponentially
 *   per consecutive 429 (honoring Retry-After when present).
 * - 401 (Unauthorized): counted; the cooldown trips only after
 *   UNAUTH_THRESHOLD consecutive 401s so the session gate's recover →
 *   retry-once flow (a single 401) is never blocked.
 */
export function noteRateLimitedResponse(url: string, response: Response): void {
  const origin = getOrigin(url)
  // Any completed response means the network path works — reset fetch-failure
  // bookkeeping before the status checks below (including the ignore path).
  const existing = stateByOrigin.get(origin)
  if (existing) {
    existing.consecutiveFetchFailures = 0
  }
  if (response.status !== 429 && response.status !== 401) {
    return
  }
  if (stateByOrigin.size >= MAX_TRACKED_ORIGINS && !stateByOrigin.has(origin)) {
    return
  }
  const state = stateByOrigin.get(origin) ?? {
    cooldownUntilMs: 0,
    consecutive429s: 0,
    consecutive401s: 0,
    consecutiveFetchFailures: 0,
  }
  const nowMs = Date.now()

  if (response.status === 401) {
    state.consecutive401s += 1
    state.consecutive429s = 0
    state.consecutiveFetchFailures = 0
    if (state.consecutive401s >= UNAUTH_THRESHOLD) {
      state.consecutive401s = 0
      state.cooldownUntilMs = nowMs + jitter(UNAUTH_COOLDOWN_MS)
    }
    stateByOrigin.set(origin, state)
    return
  }

  state.consecutive429s += 1
  state.consecutive401s = 0
  state.consecutiveFetchFailures = 0
  const retryAfterMs = parseRetryAfterMs(response, nowMs)
  const backoffMs = Math.min(MAX_COOLDOWN_MS, retryAfterMs ?? DEFAULT_COOLDOWN_MS * 2 ** (state.consecutive429s - 1))
  state.cooldownUntilMs = nowMs + jitter(backoffMs)
  stateByOrigin.set(origin, state)
}

/**
 * Records a fetch that failed before a Response was produced (network error,
 * timeout, or a CORS-blocked response — the browser hides those 429s from JS).
 * After FETCH_FAILURE_THRESHOLD consecutive failures the origin enters the
 * same cooldown as a 429 so retry loops stop touching the network.
 */
export function noteFetchFailure(url: string): void {
  const origin = getOrigin(url)
  if (stateByOrigin.size >= MAX_TRACKED_ORIGINS && !stateByOrigin.has(origin)) {
    return
  }
  const state = stateByOrigin.get(origin) ?? {
    cooldownUntilMs: 0,
    consecutive429s: 0,
    consecutive401s: 0,
    consecutiveFetchFailures: 0,
  }
  const nowMs = Date.now()
  state.consecutiveFetchFailures += 1
  state.consecutive429s = 0
  state.consecutive401s = 0
  if (state.consecutiveFetchFailures >= FETCH_FAILURE_THRESHOLD) {
    const backoffMs = Math.min(
      MAX_COOLDOWN_MS,
      FETCH_FAILURE_BASE_COOLDOWN_MS * 2 ** (state.consecutiveFetchFailures - FETCH_FAILURE_THRESHOLD),
    )
    // Never shorten an existing (e.g. 429-driven) cooldown.
    state.cooldownUntilMs = Math.max(state.cooldownUntilMs, nowMs + jitter(backoffMs))
  }
  stateByOrigin.set(origin, state)
}

/** Exported for tests. */
export function noteSuccessfulResponse(url: string): void {
  const origin = getOrigin(url)
  if (stateByOrigin.has(origin)) {
    stateByOrigin.delete(origin)
  }
}

/** Test-only: clears all per-origin state between test cases. */
export function resetRateLimitGateForTests(): void {
  stateByOrigin.clear()
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
 * records 429s / successes / failures afterwards.
 */
export async function rateLimitedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  throwIfRateLimited(url)
  let response: Response
  try {
    response = await fetch(input, init)
  } catch (error) {
    // No Response was produced (network error, timeout, or a CORS-blocked
    // response — the browser hides those 429s from JS). Count it so retry
    // loops stop touching the network after a run of failures.
    noteFetchFailure(url)
    throw error
  }
  // Any completed response means the network path works — reset fetch-failure
  // bookkeeping (noteRateLimitedResponse/noteSuccessfulResponse handle status).
  const state = stateByOrigin.get(getOrigin(url))
  if (state) {
    state.consecutiveFetchFailures = 0
  }
  if (response.status === 429 || response.status === 401) {
    noteRateLimitedResponse(url, response)
  } else if (response.ok) {
    noteSuccessfulResponse(url)
  }
  return response
}
