# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Uniswap Universe is a monorepo containing all Uniswap front-end interfaces:

- **Web** (`apps/web/`) - Decentralized exchange web interface
- **Mobile** (`apps/mobile/`) - React Native app for iOS/Android
- **Extension** (`apps/extension/`) - Browser wallet extension

## Common Development Commands

### Setup

```bash
# Initial setup (requires 1Password CLI)
bun install
bun local:check
bun lfg  # Sets up mobile and extension
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
bun g:build                      # Build all packages
bun web build:production    # Web production build
bun mobile ios:bundle            # iOS bundle
bun mobile android:release       # Android release
bun extension build:production   # Extension production
```

### Testing

```bash
bun g:test                      # Run all tests
bun notifications test          # Run tests for a specific package (e.g. notifications)
bun g:test:coverage             # With coverage
bun web playwright:test         # Web E2E tests
bun mobile e2e                  # Mobile E2E tests
```

### Code Quality

```bash
bun g:lint:fix                  # Fix linting issues for both eslint and biome, slow
bun g:typecheck                 # Type check all packages
bun g:format                    # Fix formatting using Biome, quick
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
- **Tamagui** for cross-platform UI components
- **Ethers.js/Viem** for blockchain interactions

### Code Organization Principles

#### Styling

- **ALWAYS** use `styled` from `ui/src` (never styled-components or direct Tamagui); UI components may use inline styling where appropriate
- Use theme tokens instead of hardcoded values
- Platform-specific files: `Component.ios.tsx`, `Component.android.tsx`, `Component.web.tsx`, `Component.native.tsx` (with stub files for platforms where specific implementation isn't needed)

#### State Management

- **Redux** for complex global state
- **Jotai** for simple state
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
- Run `bun i18n:extract` after making changes to localized strings (e.g., using translation hooks like `useTranslation`)

## Critical Development Notes

1. **Environment Variables**: Override URLs in `.env.defaults.local` (mobile) or `.env` (extension)
2. **Pre-commit Hooks**: Use `--no-verify` to skip or set `export LEFTHOOK=0` to disable
3. **Python Setup**: Run `brew install python-setuptools` if you encounter Python module errors
4. **Mobile Development**: Always run `bun mobile pod` after dependency changes
5. **Bundle Size**: Monitor bundle size impacts when adding dependencies

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

Be cognizant of the app or package within which a given change is being made. Be sure to reference that app or package's respective `CLAUDE.md` file and other local configuration files, including (but not limited to): `package.json`, `tsconfig.json`, etc.

## RigoBlock Fork — Key Differences from Upstream Uniswap

This repository is a RigoBlock fork of the Uniswap interface. The following deviations from upstream are intentional and must be preserved when syncing:

### Protocol Behavior
- **No user-side approvals**: RigoBlock's smart pool protocol handles approvals internally. Never add flows that ask users to approve tokens or permit2. The `generateCreatePositionTxRequest.ts` and related liquidity flows must not include approval steps visible to the user.
- **Vault/smart-pool balances**: Portfolio balances and position data are sourced from the smart pool (vault) context, not a standard EOA wallet. The `smartPoolAddress` concept is used throughout portfolio and currency search components.
- **Liquidity API V1 and V2**: Both are supportable — the CF worker routes `/v2/liquidity/v1/lp/*` and `/v2/liquidity/v2/lp/*` to the Uniswap liquidity backend. V2 (`CreatePositionRequest`) is controlled by the `FeatureFlags.CreatePositionV2` gate. Current limitation: `generateCreatePositionTxRequest.ts` only handles `CreateLPPositionResponse` (V1); to fully enable V2, it needs to also handle `CreatePositionResponse`.

### API Routing (Cloudflare Worker)
- **RigoBlock gateway**: `interface.gateway.rigoblock.com` — the Cloudflare Worker that proxies data API calls.
- **Worker routing rule**: The worker routes `/v2/*` → data API backend. ConnectRPC transports must include `/v2` in the base URL, otherwise the worker returns 403.
- **`apiBaseUrlV2` and `dataApiBaseUrlV2`**: Both point to `${getRbCloudflareApiBaseUrl()}/v2` (NOT the upstream's `data-api.*` subdomain, which doesn't exist on the RigoBlock gateway). Defined in `packages/uniswap/src/constants/urls.ts`.
- **`GetTokenPrices`**: Routes through the RigoBlock worker's `/v2/entry-gateway/` proxy (`createRestPriceClient.ts`). The worker forwards `/v2/entry-gateway/*` to `entry-gateway.backend-prod.api.uniswap.org` with `Origin: app.uniswap.org`, bypassing client-side session auth. `GetTokenPrices` is registered on the EGW (not the CF gateway), so the `/v2/entry-gateway/` proxy path is required rather than the generic CF gateway.
- **TrafficFlows.DataApi**: Do NOT use this flow for `dataApiBaseUrlV2` — it adds a `data-api.` subdomain prefix that doesn't exist on the RigoBlock gateway.

### Authentication / Sessions
- **`ENABLE_ENTRY_GATEWAY_PROXY=false`**: The Uniswap entry gateway proxy is disabled. Session service (`SessionService/Challenge`) calls go to the Uniswap EGW directly but may return 400 — this is expected in the RigoBlock deployment.
- **No Uniswap session cookies**: `GetTokenPrices` and WebSocket live prices cannot rely on Uniswap session cookies. REST pricing uses the RigoBlock CF gateway directly (no credentials).

### Price Data
- **USD value unavailable**: If position USD values show as unavailable, the cause is almost certainly the `GetTokenPrices` REST call failing — not a minimum liquidity threshold. The legacy `useUSDCPrice` (useTrade via TAPI) is the fallback when the `CentralizedPrices` Statsig flag is off.
- **Token price pipeline**: `FeatureFlags.CentralizedPrices` (Statsig gate `centralized_prices`) controls whether `LivePricesProvider` creates the REST batcher. When ON, prices come from `createRestPriceClient` → `GetTokenPrices` via RigoBlock CF gateway. When OFF, legacy `useUSDCPrice` (useTrade) is used.

### URL / Hostname
- `UNISWAP_WEB_HOSTNAME = 'app.rigoblock.com'` — not `app.uniswap.org`.
- Blog, docs, governance, social links all point to RigoBlock properties.

### Type Fixes (sync artifacts)
When syncing from upstream, watch for these recurring merge issues:
- Duplicate import blocks from conflicting merge regions (check `PositionPage.tsx`, `Overview.tsx`, `IncreaseLiquidityTxContext.tsx`).
- `NormalizedApprovalData` vs `CheckApprovalLPResponse` — approval data is normalized before being passed to `generateCreatePositionTxRequest`.
- `Pool | null | undefined` vs `Pool | undefined` — SDK types may need `?? undefined` coercion.
- `hasExplicitUrlAddress` must be declared in `usePortfolioRoutes` return type and included in all test mocks.


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
