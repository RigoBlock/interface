#!/usr/bin/env node
/**
 * Writes Cloudflare Pages build environment variables into apps/web/.env before
 * the production build.
 *
 * Upstream's flow is file-first: CI runs `config:pull` (Okta-authenticated),
 * which downloads the real .env into the build workspace, and the stock Vite
 * loader reads it. The fork cannot authenticate to Uniswap's Okta, so this
 * script is the fork's config:pull equivalent: the Pages dashboard's build
 * variables ARE the process env of the build container, and this script merges
 * them into the checked-in .env (which remains the local-dev source).
 *
 * Deliberately opt-in via UNISWAP_BUILD_ENV_FROM_PROCESS so local builds are
 * untouched. Only keys already present in .env (plus the explicit extras below)
 * are considered — arbitrary CI noise never leaks into the bundle config.
 *
 * Dashboard build command:
 *   bun install && bun web write-build-env && bun web build:production
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ENABLED = process.env.UNISWAP_BUILD_ENV_FROM_PROCESS === 'true'
if (!ENABLED) {
  process.exit(0)
}

// Keys that may live only in the dashboard (they were in the removed
// .env.production) — everything else is keyed off the checked-in .env names.
const EXTRA_KEYS = ['ENABLE_ENTRY_GATEWAY_PROXY', 'VITE_ENABLE_ENTRY_GATEWAY_PROXY', 'SENTRY_TRACES_SAMPLE_RATE']

const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env')
const lines = fs.readFileSync(envPath, 'utf8').split('\n')

const knownKeys = new Set(EXTRA_KEYS)
for (const line of lines) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/)
  if (m) {
    knownKeys.add(m[1])
  }
}

let writes = 0
const seen = new Set()
const out = lines.map((line) => {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
  if (!m) {
    return line
  }
  const [, key] = m
  seen.add(key)
  const value = process.env[key]
  if (value !== undefined && knownKeys.has(key)) {
    if (value !== m[2]) {
      writes++
    }
    return `${key}=${value}`
  }
  return line
})

// Extra keys not present in the file at all get appended.
for (const key of EXTRA_KEYS) {
  if (!seen.has(key) && process.env[key] !== undefined) {
    out.push(`${key}=${process.env[key]}`)
    writes++
  }
}

fs.writeFileSync(envPath, out.join('\n'))
console.log(`write-build-env: merged ${writes} dashboard value(s) into .env (${knownKeys.size} known keys)`)
