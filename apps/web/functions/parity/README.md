# ECS ↔ Cloudflare Workers parity harness

Answers the core migration question (INFRA-2880): **is the ECS build behaviorally
identical to the Cloudflare Workers build?** It diffs the platform-shim behaviors
`functions/ecs-entry.ts` re-implements — the surfaces where the two builds can
silently diverge.

## What it checks

`matrix.ts` defines the request matrix. Per request it diffs **status**, a set of
**shim-critical headers**, and structural **body markers** between the two origins:

- `compareHeaders` — headers that MUST match (frame-ancestors CSP, X-Frame-Options,
  cache-control, content-type, Vary, …). A diff here fails the run.
- `bodyIncludes` — substrings both bodies must contain (e.g. OG meta tags), so
  build-specific noise (asset hashes) doesn't cause false diffs.
- `compareMetaCsp` — parses the build-injected CSP `<meta>` tag and diffs it
  per directive (`meta-csp:<directive>` fields), order-insensitive within a
  directive. The known ECS delta — the CDN origin (ASSET_BASE_URL) added to
  asset-loading directives — is documented via `expectedDivergences`.
- `expectedDivergences` — diffs observed today (2026-07) that are accepted and
  documented. They keep the harness green against reality so it fails only on **new**
  drift. Each is printed as a `· known` line.

## Run it

The two origins **MUST be the same environment** (dev-vs-dev or staging-vs-staging).
Comparing across envs (e.g. a prod Workers replica vs a dev ECS origin) produces
misleading diffs — env-specific config (the embed `localhost` ancestor,
entry-gateway URLs) differs legitimately.

```bash
WORKERS_ORIGIN=<workers-origin> \
ECS_ORIGIN=<ecs-origin-same-env> \
bun run web parity
```

Exits non-zero on any undocumented divergence or an unreachable origin.

> **Staging pair:** `WORKERS_ORIGIN=https://app.corn-staging.com`
> `ECS_ORIGIN=https://staging-ecs-app.corn-staging.com`. The switchable snippet rig
> (`switchable-app.corn-staging.com`) can stand in for either side depending on
> where it's currently routed — check which build it serves before using it.

## How it runs in CI

Two layers, because the harness compares two **deployed** origins:

1. **Per-PR (automatic):** `compare.test.ts` runs in the `test:cloud` suite on every
   PR. It guards the harness logic (comparison, classification, runner) — not live
   parity.
2. **Manual (`.github/workflows/web_ecs_parity.yml`):** `workflow_dispatch` only,
   with two required same-env origin inputs and no defaults. It has no schedule yet —
   re-enable a cron once a same-env pair (staging Workers vs staging ECS) exists so
   drift is caught continuously.

A live diff on the PR's own build is **not** possible until the PR is deployed
somewhere — once ECS PR previews land (INFRA-2923), add a `pull_request` job that
points `WORKERS_ORIGIN`/`ECS_ORIGIN` at the preview to gate parity per-PR.
