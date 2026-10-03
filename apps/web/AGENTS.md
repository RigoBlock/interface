# Rigoblock Web App — Agent Guide

This app is a fork of Uniswap's web interface, extended to support **Rigoblock smart pools (vaults)**. When syncing with upstream Uniswap, these invariants MUST be preserved.

## Core Concept: Smart Pool Context — TWO Separate Domains

The smart pool context applies to **swap/LP pages ONLY**, not to the portfolio page. These are two different domains:

### Swap/LP Domain (uses active smart pool from Redux)
- Redux state: `state.application.smartPool` (`{ address, name }`)
- Hook: `useActiveSmartPool()` from `~/state/application/hooks`
- When `smartPoolAddress` is set, swap/LP balance queries, position queries, and transaction `from` fields use the vault address
- The swap form store (`swapFormStore`) carries `smartPoolAddress` and passes it to `useDerivedSwapInfo` for balance fetching and `SwapTokenSelector` for token list balances

### Portfolio Domain (priority: URL address > active smart pool > user wallet > demo)
- Portfolio page address priority:
  1. **URL address** (`/portfolio/0xVault/tokens`) — highest priority, used when navigating from earn page or direct URL
  2. **Active smart pool** — fallback when no URL address is set but a smart pool is active in Redux
  3. **Connected user wallet** — fallback when no URL address and no smart pool
  4. **Demo wallet** — disconnected state only
- Earn page links use path segments: `/portfolio/0xVaultAddress` (NOT query params)
- "View portfolio" button in wallet menu navigates to `/portfolio/${smartPoolAddress || evmAddress}` — ALWAYS includes the address
- `usePortfolioAddresses()` implements the priority chain above
- `ConnectedAddressDisplay` shows the resolved address (URL > smart pool > wallet)

**RULE: `MiniPortfolio` and `MiniPortfolioV2` must NEVER import or use `useActiveSmartPool()`. These components live in the account drawer (user's own wallet). They navigate to `/portfolio/${evmAddress}`. The smart pool address must NEVER appear here.**

## Critical Invariants

### 1. Gas Overhead — Apply ONCE in the Saga

Smart pool transactions route through the vault proxy, adding gas overhead. This overhead is applied in **exactly one place**:

- **Swaps**: `swapSaga.ts` adds `RIGOBLOCK_GAS_OVERHEAD` (250k) to `gasLimit` before submission
- **LP operations**: `liquiditySaga.ts` adds `RIGOBLOCK_LIQUIDITY_GAS_OVERHEAD` (250k) to `gasLimit` before submission
- **Bridges**: `RIGOBLOCK_BRIDGE_GAS_FALLBACK` (2.75M) used as fallback

**NEVER add gas overhead in:**
- Review components (`RemoveLiquidityReview.tsx`, `IncreaseLiquidityReview.tsx`)
- Hook files (`useRemoveLiquidityTxAndGasInfo.ts`)
- Any render-time code (violates React rules)

### 2. Gas Display Inflation

The swap gas display must include the overhead cost so users see accurate fees:
- In `swapTxAndGasInfoService/utils.ts`, `getClassicSwapTxAndGasInfo()` inflates `gasFee.value` by `RIGOBLOCK_GAS_OVERHEAD * gasPrice`
- This is display-only — actual overhead is added in the saga

### 3. Swap/LP Balance Queries Must Use Vault Address

When smart pool is active (swap/LP context only):
- `useDerivedSwapInfo()` uses `smartPoolAddress || account?.address` for `useOnChainCurrencyBalance`
- `SwapTokenSelector` overrides `addresses` with `{ evmAddress: smartPoolAddress }` for token list balances
- `useTokenBalances()` → substitutes `smartPoolAddress` for `evmAddress`
- `useCurrencyBalance()` in `SwapCurrencyInputPanel` → uses `smartPoolAddress` when `isAccount` is falsy
- `CurrencySearch.tsx` → substitutes `smartPoolAddress` into balance provider
- Position list (`Positions/index.tsx`) → queries vault address

### 4. No Approvals in Vault Context

Vault transactions don't need token approvals (the vault handles this internally). Approval flows must be skipped when `smartPoolAddress` is set.

### 5. Portfolio URL Architecture

Portfolio uses URL-based address resolution with smart pool as fallback:

- **Address priority**: URL path address > active smart pool > connected wallet > demo wallet
- **Smart pool fallback applies ONLY when `/portfolio` is accessed with NO address in URL at all**. As soon as ANY address appears in the URL (even the user's own EOA), the smart pool is BYPASSED.
- `usePortfolioRoutes()` exposes `hasExplicitUrlAddress: boolean` — true when any address is in the path segment
- `usePortfolioAddresses()` and `ConnectedAddressDisplay` check `hasExplicitUrlAddress` before applying the smart pool fallback
- **URL format**: `/portfolio/0xAddr` (path segment) — used by router
- **Earn page links**: `<Link to={\`/portfolio/\${poolAddress}\`}>` — path segment, NOT query param
- **Tab navigation**: `buildPortfolioUrl({ tab, chainId, externalAddress })` preserves the vault address across tabs
- **"View portfolio"**: wallet menu navigates to `/portfolio/${evmAddress}` — the USER'S OWN WALLET address, **NEVER** `smartPoolAddress || evmAddress`. The wallet drawer is the user's wallet, not the pool. Smart pool is irrelevant here.
- **`usePortfolioRoutes()`**: parses path segment AND `?address=` query param (redirects query param to path segment for consistency)
- **`usePortfolioAddresses()`**: returns URL address > smart pool > connected wallet > demo wallet
- **`ConnectedAddressDisplay`**: shows URL address > smart pool > connected wallet
- **Staking tab**: Rigoblock-specific tab at `/portfolio/staking` and `/portfolio/:walletAddress/staking` — must be in route definitions' `nestedPaths`

### 6. Swap Balance Display Chain

The swap page balance display uses the PACKAGE's `CurrencyInputPanel`, NOT the web-specific `SwapCurrencyInputPanel`:

```
Swap/index.tsx (useActiveSmartPool → smartPoolAddress)
  → SwapFormStoreContextProvider (props.smartPoolAddress)
    → createSwapFormStore (initial state)
    → useCalculatedInitialDerivedSwapInfo (MUST pass smartPoolAddress as 2nd arg)
      → useDerivedSwapInfo({ smartPoolAddress })
        → useOnChainCurrencyBalance(currency, smartPoolAddress || account?.address)
          → currencyBalances in Zustand store
            → SwapFormScreenStore
              → SwapFormCurrencyInputPanel reads currencyBalances
                → CurrencyInputPanel → CurrencyInputPanelBalance renders balance text
```

**CRITICAL: `useCalculatedInitialDerivedSwapInfo` is called TWICE in `SwapFormStoreContextProvider`:**
1. In `SwapFormStoreContextProviderInitializer` (initial render) — passes `smartPoolAddress` ✓
2. In `SwapFormStoreContextProviderBase` (ongoing updates) — MUST ALSO pass `smartPoolAddress` as 2nd argument

**If the ongoing call omits `smartPoolAddress`, balances will fall back to EOA after the initial render.**

### 7. LP Creation — Pool Existence Check

The Uniswap Liquidity API may not index all pools (especially via the Rigoblock gateway). A V3 on-chain fallback exists in `useDerivedPositionInfo.tsx` using `usePools()` hook with `computePoolAddress()` + `slot0()` + `liquidity()`.

### 8. API Gateway

All API traffic routes through `gateway.rigoblock.com` (configured in `apps/web/.env`). The gateway proxies to Uniswap's APIs.

### 8. Multichain Token Balance Aggregation

In the portfolio tokens table, when the `MultichainTokenUx` flag is on, tokens are grouped across chains:
- Parent row `quantity` must use `balance.totalAmount` (sum across chains), NOT `first.quantity`
- Parent row `totalValue` must use `balance.totalValueUsd` with fallback to `sumTokenValueUsd(balance.tokens)`, NOT `tokens[0].valueUsd`

## Files to Watch During Upstream Sync

| File | What to check |
|------|--------------|
| `state/sagas/liquidity/liquiditySaga.ts` | Gas overhead still applied once |
| `state/sagas/swap/swapSaga.ts` | Gas overhead still applied once |
| `swapTxAndGasInfoService/utils.ts` | Gas display inflation preserved |
| `pages/RemoveLiquidity/**` | No extra gas overhead added |
| `pages/IncreaseLiquidity/**` | No extra gas overhead added |
| `components/Liquidity/Create/hooks/useDerivedPositionInfo.tsx` | V3 on-chain fallback preserved |
| `hooks/useTokenBalances.ts` | Smart pool address override preserved |
| `components/CurrencyInputPanel/SwapCurrencyInputPanel.tsx` | `isAccount` logic preserved |
| `SwapTokenSelector.tsx` | Smart pool address override for token list preserved |
| `pages/Portfolio/Header/hooks/usePortfolioRoutes.ts` | NO smart pool reference — URL-driven only |
| `pages/Portfolio/hooks/usePortfolioAddresses.ts` | NO smart pool reference — URL/user wallet only |
| `pages/Portfolio/Header/PortfolioAddressDisplay/ConnectedAddressDisplay.tsx` | NO smart pool — uses useResolvedAddresses |
| `components/PoolPositionGroupedListItem/index.tsx` | Links use path segment `/portfolio/0xAddr` |
| `pages/Positions/index.tsx` | Vault address for position queries preserved |
| `components/SearchModal/CurrencySearch.tsx` | Balance provider address override preserved |
| `pages/Portfolio/Tokens/hooks/useTransformTokenTableData.ts` | Quantity uses `balance.totalAmount` |
| `pages/Portfolio/Tokens/utils/filterMultichainBalancesByChain.ts` | Fallback uses `sumTokenValueUsd` |

## Constants

```typescript
RIGOBLOCK_GAS_OVERHEAD = 250000        // swap proxy overhead
RIGOBLOCK_LIQUIDITY_GAS_OVERHEAD = 250000  // LP proxy overhead
RIGOBLOCK_BRIDGE_GAS_FALLBACK = 2750000    // bridge fallback
```

## Fork-Sync Notes (Oct 2026, main → feat/rigoblock-uniswap-sync)

- **Hidden upstream features**: Launches, Explore "Auctions", and Pool "Launch Auction" are removed from routes/nav/explore (page files still exist upstream-style but are unreachable). Do not re-add them in future syncs.
- **Positions page** uses upstream's Liquidity Service (`useWalletPositionsWeb`); `liquidityServiceUrl` in `packages/uniswap/src/constants/urls.ts` routes to `{rigoblock gateway}/v2/liquidity`. The gateway proxy must serve that path.
- **Env vars** follow upstream naming (no `REACT_APP_` prefix). The fork uses upstream's own `ENTRY_GATEWAY_API_URL_OVERRIDE` (in `apps/web/.env`) to point default entry-gateway traffic at the RigoBlock API proxy (`https://interface.gateway.rigoblock.com/v2/entry-gateway`) — same call format as upstream (`{base}/rpc/{chainId}`, `{base}/uniswap.platformservice.v1.SessionService/…`); the worker strips the `/v2/entry-gateway` prefix and forwards the rest untouched. Do NOT reintroduce in-code URL branches (a `RIGOBLOCK_ENTRY_GATEWAY_BASE_URL` constant existed once and was removed — it diverges from upstream for no benefit; the override is the upstream-sanctioned mechanism). `AMPLITUDE_PROXY_URL_OVERRIDE` and `STATSIG_PROXY_URL_OVERRIDE` are also upstream variable names, allowed in production (fork routes analytics/gating through the gateway); the config tests use `graphqlUrlOverride` as the still-forbidden example field.
- **Checked-in env files**: the fork tracks `apps/web/.env` (gitignored upstream — force-added here) for LOCAL development only; `.env.production` was removed (upstream deleted it too). Vite only loads `.env` (+ `.env.override`, gitignored) via `vite/resolveEnvConfigs.ts` — `.env.development`/`.env.production` are NOT loaded by the build, so the app was never reading `.env.production`. Production config comes from **Cloudflare Pages build variables** (dashboard → Settings → Builds): `apps/web/scripts/writeBuildEnv.mjs` (`bun web write-build-env`, run before `bun web build:production` in the dashboard build command) merges dashboard values into `.env` in the build container when `UNISWAP_BUILD_ENV_FROM_PROCESS=true` — the fork's equivalent of upstream's Okta `config:pull`, keeping `resolveEnvConfigs.ts` byte-identical to upstream (file-first). Only keys already named in `.env` (plus `ENABLE_ENTRY_GATEWAY_PROXY`/`VITE_ENABLE_ENTRY_GATEWAY_PROXY`/`SENTRY_TRACES_SAMPLE_RATE`) are merged. The old dashboard `REACT_APP_*` variables are from the pre-sync codebase and are dead — the config schema uses unprefixed upstream names. Required names include `WALLETCONNECT_PROJECT_ID` (not `WALLET_CONNECT_PROJECT_ID`) and `UNISWAP_GATEWAY_DNS`; both must stay present (in `.env` locally, in the dashboard for prod) or config validation blanks the app at runtime. Note: everything compiled into the Vite bundle is public in the served JS regardless — dashboard encryption protects at-rest/logs, not the bundle.
- **`config:pull` is opt-in** (`project.json` runs it only when `CONFIG_PULL=true`): it authenticates against Uniswap's Okta (login.uniswap.org) to fetch private config, which fork developers cannot do. The fork relies on the checked-in `.env` instead.
- **`.tamagui` generated bundles** are oxlint-ignored (`oxlint.config.ts`); rigoblock legacy files importing viem/ethers directly are in `DIRECT_VIEM_ETHERS_IMPORT_ALLOWLIST` (`config/oxlint-plugins/universe-custom.js`).
- **Legacy styled-components theme**: deprecated RigoBlock pages still read the styled-components theme at runtime (`theme.grids`, `theme.accent1`, …). `DeprecatedThemeProvider` (`~/theme/index.tsx`, mounted in `index.tsx`) must stay in the tree — it supplies `getDeprecatedTheme()` values mapped from spore tokens (`~/theme/deprecated`). Do not remove it in future syncs.
- **Session auth is cookie-based, byte-identical to upstream — the proxy makes it work**: all client code (`provideSessionService.web.ts`, `resolveRpcConfig.web.ts`, wagmi/viem/ethers transports, trading/notifications fetch clients) is upstream's own `credentials: 'include'` cookie flow. NO client-side header injection, reflect interceptors, or `getRequestHeaders` hacks — an earlier header-based (extension-style) attempt was reverted for exactly that reason. The complexity lives entirely in the RigoBlock Cloudflare worker, which must: (1) answer CORS for credentialed requests by **echoing the request `Origin` (never `*`)** and setting `Access-Control-Allow-Credentials: true` + `Vary: Origin` — on both preflight and actual responses; (2) on preflight, reflect `Access-Control-Request-Headers` instead of `*` (the wildcard is treated literally for credentialed requests); (3) rewrite backend `Set-Cookie` headers — strip `Domain=` (a `.uniswap.org` domain is rejected by the browser for a rigoblock host), force `SameSite=None; Secure` (localhost dev is cross-site); (4) mint an `x-device-id` cookie when the request carries none, if the backend turns out not to set one; (5) NOT cache entry-gateway responses (session cookies must never be shared across users via the cache, and POST caching is rejected by the Cache API anyway). If `/rpc/*` 401s while data-API calls succeed, the browser is not sending the session cookie — check the worker first, not the app.
- **Branding is RigoBlock gold, applied in ALL FOUR theme layers**: upstream ships generated theme mirrors with Uniswap pink (`#FC72FF` / `#FF37C7`) hardcoded, and regenerating them re-pinks the UI (this already happened once: Connect/Select-token buttons turned pink after a sync). Accent1 must be `#feb239` (hovered `#ffa81f`) in every layer:
  1. `packages/ui/src/theme/color/colors.ts` (source of truth)
  2. `packages/tailwind/css/theme.css` (`--color-accent1*`, `--color-accent2*`)
  3. `packages/mycelium/src/theme-hooks-compat/theme-colors.generated.ts`
  4. `packages/mycelium/src/text-compat/spore-text-colors*.generated.css`

  After any upstream sync touching theme files, grep all four for `FC72FF|FF37C7|magenta` and re-apply gold. Legacy styled-components pages additionally read the runtime theme via `DeprecatedThemeProvider` — that provider must stay mounted (see above).
- **No Uniswap-branded wallet options**: the connect/switch wallet modals must not offer Uniswap Extension, Uniswap Mobile, or the passkey "Log in" (embedded wallet / Privy login) — RigoBlock has no Uniswap authentication. In `StandardWalletModal.tsx` and `SwitchWalletModal.tsx` `uniswapOptions` is `null`; `WalletOptionsGrid` gets `showOtherWallets={false}`; `OtherWalletsModal.tsx` must not render the Uniswap Mobile connector. Only generic wallets (MetaMask, WalletConnect, etc.) are offered. Upstream syncs will try to restore `UniswapWalletOptions` — do not re-add it.
- **Gateway paths the RigoBlock Cloudflare worker must serve**: `/v2/liquidity/*` → `liquidity.backend-prod.api.uniswap.org` (Liquidity Service, used by Positions/LP) and `/v2/entry-gateway/*` → `entry-gateway.backend-prod.api.uniswap.org` (RPC + data APIs). If the positions page 404s with `Route POST:/data.v1.DataApiService/... not found`, the worker (or its routing) is missing the path — the client-side specs were verified against upstream's `PROD_LIQUIDITY_SERVICE_URL`.
- **Trading API stays on RigoBlock's own host**: `tradingApiUrl` (`packages/uniswap/src/constants/urls.ts`) points at `https://trading-api-labs.{prefix}.gateway.rigoblock.com` — swap quote/orders do NOT go through `interface.gateway`. Keep it that way: the trading API is designed for smart-pool simulation overrides (msg.value/from/to), which Uniswap's public developer API is not.
- **UR version selection is fork-specific**: `x-universal-router-version` is 2.0 by default; 2.1.2 is selected only when the active smart pool's chain has a governance-mapped AUniswapRouter adapter matching `UR_2_1_2_APPLICATION_ADAPTERS` (`packages/uniswap/src/data/apiClients/tradingApi/smartPoolUniversalRouterVersion.ts`, queried onchain via `Authority.getApplicationAdapter(0x3593564c)`); permissioned tokens force 2.2.0. `swapSaga` keeps/strips UR 2.1.x commands (PAY_PORTION_FULL_PRECISION 0x07, BALANCE_CHECK_ERC20 0x0e) from calldata based on the same resolution. Upstream's `supportedURVersions` + `UseUniversalRouterVersion211` flag do NOT apply — do not adopt them for the fork.
- **429 rate-limit gate (RigoBlock fork)**: `packages/chains/src/rpc/rateLimitGate.ts` fails fast without network I/O while an origin is cooling down from a 429 (honoring `Retry-After`, otherwise exponential backoff). It is wired into `createUniRpcTransportFactory` (both session branches) and the ethers fetch path in `createEthersProvider.ts`. Without it, every poller/retry loop (per-chain viem watchers, ethers block-number polling, transport retries) multiplies request volume against an already rate-limiting gateway. Do not remove the gate checks from upstream syncs, and route any new gateway-facing fetch through `rateLimitedFetch`.
- **HyperEvm (chain 999) crosschain bridging**: the live swap path imports `TradingApi` from `@universe/api`, so the effective enum is `packages/api/src/clients/trading/__generated__/models/ChainId.ts`. Both `__generated__` dirs are gitignored and rebuilt by `bun api tradingapi:generate`, so the `_999 = 999` member is injected by the tracked post-processing script `packages/api/scripts/modifyTradingApiTypes.mts` — do not remove that block; a bare hand-edit to the generated file is wiped on the next regen. (The legacy mirror at `packages/uniswap/src/data/tradingApi/__generated__` is dead code with zero importers — no need to keep it in sync.) This single addition ungates every crosschain path (`checkIsBridgePair`, swappable-tokens prefetch, bridging-token fetch, quote request), since they all filter through `toTradingApiSupportedChainId`. Prerequisite on the backend: the fork's trading API must return HyperEvm USDC (`0xb88339CB7199b77E23DB6E890353E22632Ba630f`) in `swappable_tokens` for USDC@1.
