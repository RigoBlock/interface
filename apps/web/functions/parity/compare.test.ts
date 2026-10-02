import {
  diffProbes,
  hashBody,
  normalizeHeaderValue,
  partitionDivergences,
  toProbeResult,
} from 'functions/parity/compare'
import type { ParitySpec } from 'functions/parity/matrix'
import { runParity } from 'functions/parity/runParity'

describe('normalizeHeaderValue', () => {
  it('collapses whitespace and treats missing as (absent)', () => {
    expect(normalizeHeaderValue('  public,   max-age=0 ')).toBe('public, max-age=0')
    expect(normalizeHeaderValue(null)).toBe('(absent)')
    expect(normalizeHeaderValue(undefined)).toBe('(absent)')
  })
})

function probe(status: number, headers: Record<string, string>, body = 'x') {
  return toProbeResult(status, new Headers(headers), body)
}

describe('diffProbes', () => {
  it('reports no divergence when compared fields match', () => {
    const workers = probe(200, { 'x-frame-options': 'SAMEORIGIN' })
    const ecs = probe(200, { 'x-frame-options': 'SAMEORIGIN' })
    const divs = diffProbes({
      workers,
      ecs,
      compareStatus: true,
      compareHeaders: ['x-frame-options'],
      compareBody: false,
      compareMetaCsp: false,
      expectedDivergences: {},
    })
    expect(divs).toHaveLength(0)
  })

  it('flags an undocumented header diff as unexpected', () => {
    const workers = probe(200, { 'content-security-policy': "frame-ancestors 'self'" })
    const ecs = probe(200, { 'content-security-policy': 'frame-ancestors *' })
    const divs = diffProbes({
      workers,
      ecs,
      compareStatus: false,
      compareHeaders: ['content-security-policy'],
      compareBody: false,
      compareMetaCsp: false,
      expectedDivergences: {},
    })
    expect(divs).toHaveLength(1)
    expect(divs[0].expected).toBe(false)
  })

  it('marks a documented diff as expected (non-failing)', () => {
    const workers = probe(200, { 'cache-control': 'public, max-age=0, must-revalidate' })
    const ecs = probe(200, { 'cache-control': 'public, max-age=0, s-maxage=60' })
    const divs = diffProbes({
      workers,
      ecs,
      compareStatus: false,
      compareHeaders: ['cache-control'],
      compareBody: false,
      compareMetaCsp: false,
      expectedDivergences: { 'cache-control': 'edge collapses s-maxage' },
    })
    expect(divs).toHaveLength(1)
    expect(divs[0].expected).toBe(true)
    expect(divs[0].note).toBe('edge collapses s-maxage')
  })

  it('detects a status divergence', () => {
    const divs = diffProbes({
      workers: probe(405, {}),
      ecs: probe(200, {}),
      compareStatus: true,
      compareHeaders: [],
      compareBody: false,
      compareMetaCsp: false,
      expectedDivergences: {},
    })
    expect(divs).toEqual([{ field: 'status', workers: '405', ecs: '200', expected: false, note: undefined }])
  })
})

describe('meta-csp comparison', () => {
  const metaCspBody = (content: string) =>
    `<html><head><meta http-equiv="Content-Security-Policy" content="${content}"></head></html>`

  function diffMetaCsp(workersBody: string, ecsBody: string) {
    return diffProbes({
      workers: probe(200, {}, workersBody),
      ecs: probe(200, {}, ecsBody),
      compareStatus: false,
      compareHeaders: [],
      compareBody: false,
      compareMetaCsp: true,
      expectedDivergences: {},
    })
  }

  it('extracts directives from the escaped meta tag with sorted sources', () => {
    const result = probe(200, {}, metaCspBody('script-src &#39;self&#39; https://b.example https://a.example'))
    expect(result.metaCsp).toEqual({ 'script-src': "'self' https://a.example https://b.example" })
  })

  it('leaves metaCsp undefined when the body has no CSP meta tag', () => {
    expect(probe(200, {}, '<html></html>').metaCsp).toBeUndefined()
  })

  it('ignores source-order differences within a directive', () => {
    const divs = diffMetaCsp(
      metaCspBody('connect-src https://a.example https://b.example'),
      metaCspBody('connect-src https://b.example https://a.example'),
    )
    expect(divs).toHaveLength(0)
  })

  it('reports a per-directive field when one side has an extra source', () => {
    const divs = diffMetaCsp(
      metaCspBody('script-src &#39;self&#39;; connect-src &#39;self&#39;'),
      metaCspBody('script-src &#39;self&#39; https://cdn.example; connect-src &#39;self&#39;'),
    )
    expect(divs).toHaveLength(1)
    expect(divs[0].field).toBe('meta-csp:script-src')
    expect(divs[0].expected).toBe(false)
  })

  it('reports a single meta-csp field when the tag is missing on one side', () => {
    const divs = diffMetaCsp('<html></html>', metaCspBody('script-src &#39;self&#39;'))
    expect(divs).toHaveLength(1)
    expect(divs[0]).toMatchObject({ field: 'meta-csp', workers: '(absent)', ecs: '(present)' })
  })
})

describe('partitionDivergences', () => {
  it('splits known from unexpected', () => {
    const { unexpected, known } = partitionDivergences([
      { field: 'a', workers: '1', ecs: '2', expected: false },
      { field: 'b', workers: '1', ecs: '2', expected: true, note: 'ok' },
    ])
    expect(unexpected.map((d) => d.field)).toEqual(['a'])
    expect(known.map((d) => d.field)).toEqual(['b'])
  })
})

describe('hashBody', () => {
  it('is stable and content-sensitive', () => {
    expect(hashBody('a')).toBe(hashBody('a'))
    expect(hashBody('a')).not.toBe(hashBody('b'))
  })
})

// Fake fetch keyed by origin so we can drive the runner without network.
function fakeFetch(
  byOrigin: Record<string, { status: number; headers: Record<string, string>; body: string }>,
): typeof fetch {
  return (async (url: string | URL | Request) => {
    const href = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url
    const match = Object.keys(byOrigin).find((o) => href.startsWith(o))
    if (!match) {
      throw new Error(`no fake for ${href}`)
    }
    const { status, headers, body } = byOrigin[match]
    return new Response(body, { status, headers })
  }) as unknown as typeof fetch
}

describe('runParity', () => {
  const specs: ParitySpec[] = [
    { name: 'frame', path: '/x', compareHeaders: ['x-frame-options'], bodyIncludes: ['MARK'] },
  ]

  it('passes when both origins agree and markers are present', async () => {
    const report = await runParity({
      specs,
      workersOrigin: 'https://workers.test',
      ecsOrigin: 'https://ecs.test',
      fetchImpl: fakeFetch({
        'https://workers.test': { status: 200, headers: { 'x-frame-options': 'SAMEORIGIN' }, body: 'MARK' },
        'https://ecs.test': { status: 200, headers: { 'x-frame-options': 'SAMEORIGIN' }, body: 'MARK' },
      }),
    })
    expect(report.failed).toBe(false)
  })

  it('fails on a shim-header divergence', async () => {
    const report = await runParity({
      specs,
      workersOrigin: 'https://workers.test',
      ecsOrigin: 'https://ecs.test',
      fetchImpl: fakeFetch({
        'https://workers.test': { status: 200, headers: { 'x-frame-options': 'SAMEORIGIN' }, body: 'MARK' },
        'https://ecs.test': { status: 200, headers: { 'x-frame-options': 'DENY' }, body: 'MARK' },
      }),
    })
    expect(report.failed).toBe(true)
    expect(report.outcomes[0].unexpected[0].field).toBe('x-frame-options')
  })

  it('fails when a required body marker is missing on one origin', async () => {
    const report = await runParity({
      specs,
      workersOrigin: 'https://workers.test',
      ecsOrigin: 'https://ecs.test',
      fetchImpl: fakeFetch({
        'https://workers.test': { status: 200, headers: { 'x-frame-options': 'SAMEORIGIN' }, body: 'MARK' },
        'https://ecs.test': { status: 200, headers: { 'x-frame-options': 'SAMEORIGIN' }, body: 'no-marker' },
      }),
    })
    expect(report.failed).toBe(true)
    expect(report.outcomes[0].unexpected[0].field).toBe('body:MARK')
  })

  it('fails when an origin is unreachable', async () => {
    const report = await runParity({
      specs,
      workersOrigin: 'https://workers.test',
      ecsOrigin: 'https://unmapped.test',
      fetchImpl: fakeFetch({
        'https://workers.test': { status: 200, headers: { 'x-frame-options': 'SAMEORIGIN' }, body: 'MARK' },
      }),
    })
    expect(report.failed).toBe(true)
    expect(report.outcomes[0].error).toBeDefined()
  })
})
