# AGENTS.md

This file provides guidance to AI agents when working with code in this repository. Always run all tests, lint, and typecheck after making changes, and before considering a task to be 'complete'.

## RigoBlock Fork — Read First

This repo is the **RigoBlock fork** of the Uniswap interface (`main` tracks upstream Uniswap; RigoBlock work happens on `rigoblock-wrap`-style branches). You are building the RigoBlock interface, not Uniswap's. When syncing upstream into the fork, these invariants MUST survive every merge — upstream changes will silently undo them:

1. **Smart-pool context** (swap/LP pages): balances, position queries and tx `from`/`to` fields use the vault address; vault txs need NO token approvals; gas overhead (`RIGOBLOCK_GAS_OVERHEAD`) is applied exactly once in the sagas. See `apps/web/AGENTS.md` §Critical Invariants.
2. **Branding is RigoBlock gold (`#feb239`), in all four theme layers** — `packages/ui/src/theme/color/colors.ts`, `packages/tailwind/css/theme.css`, `packages/mycelium/src/theme-hooks-compat/theme-colors.generated.ts`, `packages/mycelium/src/text-compat/spore-text-colors*.generated.css`. Upstream generated mirrors hardcode Uniswap pink; after any sync grep for `FC72FF|FF37C7` and re-apply gold.
3. **No Uniswap-only UI**: no Launches / Auctions / "Launch Auction" entries, and no Uniswap-branded wallet options (Uniswap Extension, Uniswap Mobile, passkey "Log in") in wallet modals.
4. **API traffic**: data/liquidity/RPC calls go through the RigoBlock gateway (`interface.gateway.rigoblock.com`), which proxies Uniswap's backend APIs; the trading API uses RigoBlock's own `trading-api-labs` host. This includes upstream's prod-pinned entry-gateway clients (data API v1, unitags, RWA, search) — the fork rule in `packages/api/src/getEntryGatewayUrl.ts` makes PROD pins honor the override so they too route through the proxy; direct `entry-gateway.backend-prod.api.uniswap.org` calls are CORS-blocked from rigoblock origins. Client code is byte-identical to upstream — cookie session auth via `credentials: 'include'` — and the Cloudflare worker makes that work (echo `Origin` + `Access-Control-Allow-Credentials: true`, rewrite `Set-Cookie` Domain/SameSite, no caching of gateway responses). Do NOT add client-side auth hacks (header injection, `credentials: 'omit'`, URL-override constants); fix the worker instead. See `apps/web/AGENTS.md` §Fork-Sync Notes for the full list.
5. **The `/positions` page and "Pool" nav tab are operator-only surfaces.** The fork does not implement direct Uniswap v4 interaction from the user's EOA wallet, so both are gated on `useOperatedPoolAddresses()` (route gate in `pages/RouteDefinitions.tsx`, tab gate in `components/NavBar/Tabs/TabsContent.tsx`) and non-operators must see neither. The page's position list and summary chips query the vault address, not the EOA.

6. **Swap routing is classic-only — UniswapX is never requested.** Smart-pool swaps cannot be fulfilled as UniswapX Dutch orders, so `UNISWAPX_LATEST` must never reach a quote request. The enforcement point is `filterProtocols` in `packages/uniswap/src/features/transactions/swap/utils/protocols.ts`: it strips UniswapX unconditionally, ignoring the upstream `uniswapx` statsig gate (the fork proxies Statsig, so upstream rollouts flip the flag for the fork too — Oct 2026 incident: the gate turned on and every smart-pool swap went down the UniswapX order-signing flow, failing with "Swap couldn't be completed with UniswapX"). `DEFAULT_PROTOCOL_OPTIONS` there must also stay UniswapX-free so the settings "Default" routing toggle reflects the actual classic default, and `isDefaultTradeRouteOptions` compares the UniswapX-stripped set (persisted settings may still list it). Upstream syncs will silently restore flag-honoring behavior — do not "fix" it back.

**Never "fix" a RigoBlock behavior by reverting it to upstream's way — if a conflict resolution looks like it restores upstream behavior for approvals, branding, wallet options, or API auth, that resolution is wrong.**

### Fork-sync playbook (how to merge upstream and keep the build green)

1. **Merge `main` (upstream) into the rigoblock branch**, then run the mechanical checks: `bun install`, `bun g:typecheck`, `bun web build:production`. A green typecheck is NOT enough — only the production build resolves every import, so it is the gate that catches missing modules.
2. **When upstream deletes a dependency or module that fork pages still import, do NOT re-add the old package.** That is dead baggage and will rot again on the next sync. Instead migrate the fork code forward:
   - Replace deleted UI primitives with the components the modern app uses — `Text`/`Flex` from `@universe/mycelium` and `Button` from `ui/src` — so RigoBlock colors/theme come from the theme for free. Never write a local clone of a deleted upstream package (that is exactly the baggage the sync will keep breaking).
   - The two legacy compat surfaces that remain are themselves thin adapters over those shared components, not forks of upstream modules: the `ThemedText` presets in `~/theme/components/text.tsx` (wrap mycelium `Text`; old styled-components color keys map to spore tokens) and `~/components/Button/buttons.tsx` (`ButtonPrimary`/`ButtonError`/`ButtonConfirmed` wrap `ui/src`'s `Button`; unused upstream variants were dropped). Plus `~/lib/deprecated-styled` (the styled-components alias) and `~/components/deprecated/{Row,Column}.tsx` for layout. When touching a call site, prefer migrating it off these compat surfaces entirely.
   - Keep RigoBlock specs when re-styling: accent1 gold `#feb239` (hovered `#ffa81f`), applied via the theme (`theme.accent1` / spore `$accent1`), never hardcoded upstream pink.
   - Example (Oct 2026): upstream deleted `rebass`. The fork's legacy Vote/CreateProposal/earn pages were migrated onto mycelium `Text` and `ui/src` `Button` instead of re-adding `rebass` — the production build failed on `rebass/styled-components` imports that a stale local `node_modules` had masked, which is why step 1 gates on `bun web build:production`.
3. **Audit imports of everything upstream removed.** After a sync, diff the manifests and grep the fork tree for imports of deleted packages:
   ```bash
   git diff <merge-base>..origin/main -- '**/package.json' bun.lock | grep '^[-].*"'   # removed deps
   grep -rn "from '<deleted-package>'" apps/ packages/                                  # stragglers
   ```
   Then migrate each straggler per rule 2.
4. **Beware phantom local dependencies.** A package can import successfully in a dirty local `node_modules` (stale hoisting from an old lockfile or a transitive dep of something else) yet be absent from `bun.lock`, so CI installs clean and the build fails there — while your machine keeps passing. `styled-components` in `apps/web` survived only as a transitive dep of `@privy-io/react-auth` until it was declared directly. Any package the fork imports must be declared in the importing workspace's `package.json` — never rely on hoisting or transitivity. If unsure, delete the package dir from `node_modules` and rebuild.
5. **Re-apply the invariants** listed above and in `apps/web/AGENTS.md` §Fork-Sync Notes (branding gold in all four theme layers, gateway/API config, hidden Uniswap-only UI, wallet options, HyperEvm additions, rate-limit gate, etc.). Upstream syncs will silently revert each of them.
6. **Fresh-install CI parity before calling a sync done:** `rm -rf node_modules && bun install && bun web build:production`, then run tests/lint/typecheck. Dashboard build vars must also match `.bun-version`/`engines` (see `scripts/check-runtime-versions.sh`).

## Project Overview

Uniswap Universe is a monorepo containing all Uniswap front-end interfaces:

- **Web** (`apps/web/`) - Decentralized exchange web interface
- **Mobile** (`apps/mobile/`) - React Native app for iOS/Android
- **Extension** (`apps/extension/`) - Browser wallet extension

## Common Development Commands

### Setup

```bash
# Initial setup
bun install
bun local:check
bun config:login
```

### Development Servers

```bash
bun web dev        # Web with Vite
bun mobile ios          # iOS app
bun mobile android      # Android app
bun extension start     # Extension
```

### Building

```bash
bun web build:production    # Web production build
bun mobile ios:bundle            # iOS bundle
bun mobile android:release       # Android release
bun extension build:production   # Extension production
```

### Testing

```bash
bun g:test                      # Run all tests
bun g:test:changed              # Run tests for changed packages
bun web playwright:test         # Web E2E tests
bun mobile e2e                  # Mobile E2E tests
```

### Code Quality

```bash
bun g:lint:fix                  # Fix linting issues
bun g:typecheck                 # Type check all packages
bun g:format                    # Fix formatting
bun i18n:extract                # Extract localized strings (run after changing translations)
```

## Architecture Overview

### Monorepo Structure

- **NX** for build orchestration
- **Bun workspaces** for package management
- Shared code in `packages/` directory
- App-specific code in `apps/` directory

### Key Technologies

- **TypeScript** everywhere
- **React** for web/extension
- **React Native** for mobile
- **Redux Toolkit** for state management
- **Ethers.js/Viem** for blockchain interactions

### Code Organization Principles

#### Styling

- **ALWAYS** use `styled` from `ui/src` (never styled-components); UI components may use inline styling where appropriate
- Use theme tokens instead of hardcoded values
- Platform-specific files: `Component.ios.tsx`, `Component.android.tsx`, `Component.web.tsx`, `Component.native.tsx` (with stub files for platforms where specific implementation isn't needed)

#### State Management

- **Redux** for complex global state
- **Zustand** for simple global/shared state — do not use Jotai, we are migrating away from it. Flag any new Jotai usage in PRs and require Zustand instead.
- Keep state as local as possible
- No custom hooks for simple data fetching - use `useQuery`/`useMutation` directly

#### Component Structure

1. State declarations at top
2. Event handlers after state
3. Memoize properly, especially for anything that might be used in the React Native app
4. JSX at the end
5. Keep components under 250 lines

#### TypeScript Conventions

- Do not use `any`, prefer `unknown`
- Always consider strict mode
- Use explicit return types
- PascalCase for types/interfaces
- camelCase for variables/functions
- String enums with initializers

## Testing + Formatting Guidelines

- Test behaviors, not implementations
- Always update existing unit tests related to changes made
- Run tests before considering a task to be 'complete'
- Also run linting and typecheck before considering a task to be 'complete'
- Don't ignore new lint warnings — fix them; suppress with a one-line reasoned `oxlint-disable-next-line` only when a proper fix would change behavior
- Run `bun i18n:extract` after making changes to localized strings (e.g., using translation hooks like `useTranslation`)

## Critical Development Notes

1. **Environment Variables**: Override URLs in `.env.defaults.local` (mobile) or `.env` (extension)
2. **Pre-commit Hooks**: Use `--no-verify` to skip or set `export LEFTHOOK=0` to disable
3. **Python Setup**: Run `brew install python-setuptools` if you encounter Python module errors
4. **Mobile Development**: Always run `bun mobile pod` after dependency changes
5. **Bundle Size**: Monitor bundle size impacts when adding dependencies
6. **Bun Version Bumps**: `.bun-version` is the single source of truth. After editing it, run `bun sync:bun-version` to rewrite the pins that can't read the file (`engines.bun`, EAS build profiles) — CI fails if they drift. CI runners install Bun via `oven-sh/setup-bun` (reading `.bun-version` directly), so they need no pin. Bump `@types/bun` and rerun `bun install` separately.

## Package Dependencies

Core shared packages:

- `packages/ui/` - Cross-platform UI components and theme
- `packages/uniswap/` - Core business logic and utilities
- `packages/wallet/` - Wallet functionality
- `packages/utilities/` - Common utilities

## Blockchain Integration

- Support for multiple chains (Ethereum, Arbitrum, Optimism, etc.)
- Uniswap Protocol v2, v3, v4, and UniswapX support
- Multiple wallet providers (WalletConnect, Metamask, etc.)
- Transaction building and gas estimation

## Other Considerations

Be cognizant of the app or package within which a given change is being made. Be sure to reference that app or package's respective `AGENTS.md` file and other local configuration files, including (but not limited to): `package.json`, `tsconfig.json`, etc.


<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

## General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax


<!-- nx configuration end-->

## Cursor Cloud specific instructions

### Environment

- Node.js and Bun are pre-installed and match `.nvmrc` / `.bun-version`.
- The `tsgo` binary is at `node_modules/.bin/tsgo` (not globally in PATH). The `bun g:typecheck` script handles this automatically.
- Set `export LEFTHOOK=0` to disable git hooks in Cloud Agent sessions (no TTY for interactive hooks).
- Set `export SKIP_CONFIG_PULL=true` to disable remote config fetching (no Okta auth for agents)
- All backend APIs are external (no local databases or Docker needed for development).

### Web App

- **Start dev server**: `bun web dev` → runs on `http://localhost:3000/`
- **Run tests**: `bunx nx run web:test -- --run` (317 test files, ~2.5 min)
- **Lint (fast)**: `bunx nx run web:format` (formatting) and `bunx nx run web:lint` (oxlint)
- **Typecheck**: `bun g:typecheck` runs `tsgo -b` globally (fastest). Per-project: `bunx nx run web:typecheck`.
- The `web:typecheck:cloud` target typechecks the `apps/web/functions/` (edge functions) separately and may fail independently of the main app.
- The web app loads live data from Uniswap's public APIs without requiring API keys for basic swap quotes and token exploration.

### Extension

- **Start dev server**: `bun extension dev` → WXT builds the extension and opens Chrome with it pre-loaded.
- A pre-built extension is available at `/var/tmp/stretch` and is already loaded in the default Chrome profile (`/home/ubuntu/.config/google-chrome`).
- The extension wallet is **already onboarded**. To unlock it, use the password from the `EXTENSION_UNLOCK_PASSWORD` environment variable.
- To type the password programmatically: write it to a temp file with `python3 -c "import os; open('/tmp/ext_pw.txt','w').write(os.environ['EXTENSION_UNLOCK_PASSWORD'])"`, then read/type from that file (the env var value is redacted in shell output but available to processes).
- The extension opens as a **side panel** in Chrome (not a popup). Click the Uniswap icon in the toolbar or use Ctrl+Shift+U.
- The wallet contains a small amount of ETH and cBTC on Ethereum mainnet.
- **Known limitation**: connecting the extension wallet to the web app on `localhost` does not currently work (the `externally_connectable` manifest only allows `app.uniswap.org` and staging origins).

### Gotchas

- `bun install` runs a `preinstall` script that validates Node/Bun versions and will fail if they don't match `.nvmrc` / `.bun-version`.
- The `postinstall` script runs `git config core.hooksPath .husky && bun g:prepare`. The `g:prepare` step (`nx run-many -t prepare`) generates codegen files needed for typecheck/build.
- Mobile requires native tooling (Xcode, CocoaPods, Android SDK) not available in Cloud Agent VMs.
- When running `bun extension dev`, WXT creates a `web-ext.config.ts` override file (gitignored) to customize browser startup behavior. You can set `startUrls`, `chromiumArgs`, or `WXT_NO_OPEN_BROWSER=true` as needed.
