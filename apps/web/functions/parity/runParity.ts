import {
  type Divergence,
  diffProbes,
  partitionDivergences,
  type ProbeResult,
  toProbeResult,
} from 'functions/parity/compare'
/* oxlint-disable no-console -- CI parity report */
// Diffs the live Cloudflare Workers origin against the live ECS origin across the
// request matrix, failing on any diff not documented as a known divergence.
//
// Usage: WORKERS_ORIGIN=https://… ECS_ORIGIN=https://… bun run functions/parity/runParity.ts
import { PARITY_MATRIX, type ParitySpec } from 'functions/parity/matrix'

const FETCH_TIMEOUT_MS = 20_000

interface SpecOutcome {
  spec: ParitySpec
  /** Set when a request/probe could not be produced (network error, etc.). */
  error?: string
  unexpected: Divergence[]
  known: Divergence[]
}

export interface ParityReport {
  outcomes: SpecOutcome[]
  failed: boolean
}

type FetchImpl = typeof fetch

async function probe(
  origin: string,
  spec: ParitySpec,
  fetchImpl: FetchImpl,
): Promise<{ probe: ProbeResult; body: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetchImpl(`${origin}${spec.path}`, {
      method: spec.method ?? 'GET',
      headers: spec.requestHeaders,
      body: spec.body,
      redirect: 'manual',
      signal: controller.signal,
    })
    const body = await res.text()
    return { probe: toProbeResult(res.status, res.headers, body), body }
  } finally {
    clearTimeout(timer)
  }
}

function bodyMarkerDivergences(spec: ParitySpec, workersBody: string, ecsBody: string): Divergence[] {
  if (!spec.bodyIncludes) {
    return []
  }
  const divergences: Divergence[] = []
  for (const marker of spec.bodyIncludes) {
    const w = workersBody.includes(marker)
    const e = ecsBody.includes(marker)
    if (!w || !e) {
      divergences.push({
        field: `body:${marker}`,
        workers: w ? '(present)' : '(missing)',
        ecs: e ? '(present)' : '(missing)',
        expected: false,
      })
    }
  }
  return divergences
}

async function runSpec(
  spec: ParitySpec,
  workersOrigin: string,
  ecsOrigin: string,
  fetchImpl: FetchImpl,
): Promise<SpecOutcome> {
  try {
    const [workers, ecs] = await Promise.all([probe(workersOrigin, spec, fetchImpl), probe(ecsOrigin, spec, fetchImpl)])
    const divergences = [
      ...diffProbes({
        workers: workers.probe,
        ecs: ecs.probe,
        compareStatus: spec.compareStatus ?? true,
        compareHeaders: spec.compareHeaders ?? [],
        compareBody: spec.compareBody ?? false,
        compareMetaCsp: spec.compareMetaCsp ?? false,
        expectedDivergences: spec.expectedDivergences ?? {},
      }),
      ...bodyMarkerDivergences(spec, workers.body, ecs.body),
    ]
    return { spec, ...partitionDivergences(divergences) }
  } catch (err) {
    return { spec, error: err instanceof Error ? err.message : String(err), unexpected: [], known: [] }
  }
}

export async function runParity(args: {
  specs: ParitySpec[]
  workersOrigin: string
  ecsOrigin: string
  fetchImpl?: FetchImpl
}): Promise<ParityReport> {
  const fetchImpl = args.fetchImpl ?? fetch
  const outcomes: SpecOutcome[] = []
  for (const spec of args.specs) {
    outcomes.push(await runSpec(spec, args.workersOrigin, args.ecsOrigin, fetchImpl))
  }
  const failed = outcomes.some((o) => o.error !== undefined || o.unexpected.length > 0)
  return { outcomes, failed }
}

function printReport(report: ParityReport, workersOrigin: string, ecsOrigin: string): void {
  console.log(`\nECS↔Workers parity\n  Workers: ${workersOrigin}\n  ECS:     ${ecsOrigin}\n`)
  for (const o of report.outcomes) {
    if (o.error) {
      console.log(`✖ ${o.spec.name} — request failed: ${o.error}`)
      continue
    }
    if (o.unexpected.length === 0) {
      console.log(`✔ ${o.spec.name}${o.known.length ? ` (${o.known.length} known diff)` : ''}`)
    } else {
      console.log(`✖ ${o.spec.name} — ${o.unexpected.length} unexpected diff(s):`)
      for (const d of o.unexpected) {
        console.log(`    ${d.field}: workers=${d.workers}  ecs=${d.ecs}`)
      }
    }
    for (const d of o.known) {
      console.log(`    · known ${d.field}: ${d.note}`)
    }
  }
  console.log('')
}

async function main(): Promise<void> {
  const workersOrigin = process.env.WORKERS_ORIGIN
  const ecsOrigin = process.env.ECS_ORIGIN
  if (!workersOrigin || !ecsOrigin) {
    console.error('Set WORKERS_ORIGIN and ECS_ORIGIN (e.g. https://cf-app.corn-staging.com).')
    process.exit(2)
  }
  const report = await runParity({ specs: PARITY_MATRIX, workersOrigin, ecsOrigin })
  printReport(report, workersOrigin, ecsOrigin)
  process.exit(report.failed ? 1 : 0)
}

// Only run when executed directly, not when imported by tests.
if (import.meta.main) {
  await main()
}
