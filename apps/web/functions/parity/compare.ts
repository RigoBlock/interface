import { createHash } from 'node:crypto'

// Response headers the ECS entry (functions/ecs-entry.ts) re-implements from the
// Cloudflare Workers platform (public/_headers, CF edge behavior). These are the
// surfaces where the two builds can silently diverge, so they're what we diff.
export const SHIM_HEADERS = [
  'content-type',
  'cache-control',
  'content-security-policy',
  'x-frame-options',
  'x-content-type-options',
  'vary',
] as const

const ABSENT = '(absent)'

export interface ProbeResult {
  status: number
  headers: Record<string, string>
  bodyHash: string
  bodySize: number
  /** Directive name -> sorted source list from the CSP `<meta>` tag, when the body carries one. */
  metaCsp?: Record<string, string>
}

export interface Divergence {
  /** 'status', a header name, or 'body' / 'body:<marker>'. */
  field: string
  workers: string
  ecs: string
  /** True when this diff is documented in the spec and must not fail the run. */
  expected: boolean
  note?: string
}

export function hashBody(body: string): string {
  return createHash('sha256').update(body).digest('hex')
}

/** Trim and collapse internal whitespace so cosmetic spacing never reads as a diff. */
export function normalizeHeaderValue(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    return ABSENT
  }
  return value.trim().replace(/\s+/g, ' ')
}

const META_CSP_PATTERN = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/i

/** Reverses the entity escaping applied by the vite CSP plugin when injecting the tag. */
function unescapeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/**
 * Parses the build-injected CSP `<meta>` tag into directive -> sorted sources,
 * so per-directive diffs are order-insensitive. Returns undefined when the body
 * has no CSP meta tag (non-HTML responses, SKIP_CSP builds).
 */
export function extractMetaCspDirectives(body: string): Record<string, string> | undefined {
  const match = body.match(META_CSP_PATTERN)
  if (!match) {
    return undefined
  }
  const directives: Record<string, string> = {}
  for (const part of unescapeHtmlEntities(match[1]).split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/)
    if (name) {
      directives[name] = sources.sort().join(' ')
    }
  }
  return directives
}

export function toProbeResult(status: number, headers: Headers, body: string): ProbeResult {
  const picked: Record<string, string> = {}
  for (const name of SHIM_HEADERS) {
    picked[name] = normalizeHeaderValue(headers.get(name))
  }
  return {
    status,
    headers: picked,
    bodyHash: hashBody(body),
    bodySize: body.length,
    metaCsp: extractMetaCspDirectives(body),
  }
}

interface DiffArgs {
  workers: ProbeResult
  ecs: ProbeResult
  compareStatus: boolean
  compareHeaders: readonly string[]
  compareBody: boolean
  compareMetaCsp: boolean
  /** field name -> reason; listed fields are reported but don't fail the run. */
  expectedDivergences: Record<string, string>
}

export function diffProbes(args: DiffArgs): Divergence[] {
  const { workers, ecs, compareStatus, compareHeaders, compareBody, compareMetaCsp, expectedDivergences } = args
  const divergences: Divergence[] = []

  const record = (field: string, w: string, e: string): void => {
    if (w === e) {
      return
    }
    const note = expectedDivergences[field]
    divergences.push({ field, workers: w, ecs: e, expected: note !== undefined, note })
  }

  if (compareStatus) {
    record('status', String(workers.status), String(ecs.status))
  }
  for (const name of compareHeaders) {
    record(name, workers.headers[name] ?? ABSENT, ecs.headers[name] ?? ABSENT)
  }
  if (compareBody) {
    record('body', workers.bodyHash.slice(0, 12), ecs.bodyHash.slice(0, 12))
  }
  if (compareMetaCsp) {
    if (workers.metaCsp === undefined || ecs.metaCsp === undefined) {
      record('meta-csp', workers.metaCsp ? '(present)' : ABSENT, ecs.metaCsp ? '(present)' : ABSENT)
    } else {
      // Per-directive fields so an undocumented drift in one directive fails even
      // when another directive has a documented divergence.
      const names = new Set([...Object.keys(workers.metaCsp), ...Object.keys(ecs.metaCsp)])
      for (const name of names) {
        record(`meta-csp:${name}`, workers.metaCsp[name] ?? ABSENT, ecs.metaCsp[name] ?? ABSENT)
      }
    }
  }

  return divergences
}

export function partitionDivergences(divergences: Divergence[]): {
  unexpected: Divergence[]
  known: Divergence[]
} {
  const unexpected: Divergence[] = []
  const known: Divergence[] = []
  for (const d of divergences) {
    ;(d.expected ? known : unexpected).push(d)
  }
  return { unexpected, known }
}
