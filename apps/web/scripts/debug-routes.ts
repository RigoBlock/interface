// Single source of truth for whether a build ships the BFF's debug routes
// (functions/app.ts). Every bundler that compiles app.ts feeds its own platform
// variable through here: vite.config.mts for the Worker, scripts/build-ecs.ts
// and scripts/build-vercel.ts for the Bun bundles.
const DEBUG_ROUTE_ENVS = new Set(['development', 'dev', 'staging', 'preview'])

/**
 * Value for the `process.env.ENABLE_DEBUG_ROUTES` define, as a string literal.
 * An allowlist: an unset or unrecognized environment bakes 'false', so a renamed
 * or missing variable drops the routes rather than shipping them.
 */
export function enableDebugRoutes(deploymentEnv: string | undefined): string {
  return String(DEBUG_ROUTE_ENVS.has(deploymentEnv ?? ''))
}
