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

**Why the saga must supply gas for smart-pool LP txs:** the liquidity API cannot simulate vault-routed txs, so every LP hook requests `simulateTransaction: false` for smart pools and the API returns calldata with **no `gasLimit`**. Left unset, ethers falls back to `eth_estimateGas` through the gateway — and the gateway cannot simulate an EOA→vault tx carrying raw PositionManager calldata either (this was the production "bad result from backend / invalid BigNumber value" failure on remove-liquidity). So in `liquiditySaga.ts`, when the tx targets the vault (`txRequest.to === smartPoolAddress`, passed explicitly as the saga's `smartPoolAddress` param by the review components): an existing `gasLimit` gets +250k; a missing one is estimated locally via `RPC_PROVIDERS` (EOA→vault, 20% margin) — then +250k. **If local estimation fails the tx is ABORTED (the error propagates as a failed step); there is intentionally no gasLimit fallback** — a tx that cannot be estimated would revert onchain, and sending it anyway just burns gas. Detection MUST stay explicit (`to === vault`); a `to !== EOA` heuristic matches every LP tx, including plain EOA ones.

**NEVER add gas overhead in:**
- Review components (`RemoveLiquidityReview.tsx`, `IncreaseLiquidityReview.tsx`) — passing `smartPoolAddress` into the saga trigger params is fine; mutating `gasLimit` there is not
- Hook files (`useRemoveLiquidityTxAndGasInfo.ts`)
- Any render-time code (violates React rules)

### 1b. Positions Page Is an Operator-Only Surface

The fork has no direct Uniswap v4 LP interaction from a user's EOA — all LP management runs through operated smart pools. Therefore:

- The `/positions` route is gated by `isPoolOperator` in `RouteDefinitions.tsx` (`useRouterConfig` ← `useOperatedPoolAddresses()`); non-operators and disconnected wallets fall through to NotFound. Upstream syncs must not remove the gate.
- The "Pool" nav tab is hidden the same way in `components/NavBar/Tabs/TabsContent.tsx`.
- The positions list AND the summary chips (`PositionsSummaryChips` — Total liquidity / Total fees / Total rewards) both query the **active smart pool (vault) address**, never the EOA. With no vault selected the queries are skipped (discovery empty state) — never fall back to EOA positions.

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
| `state/sagas/liquidity/liquiditySaga.ts` | Smart-pool detection stays explicit (`to === smartPoolAddress`), local gas estimation preserved, NO gasLimit fallback (estimation failure aborts), overhead applied exactly once |
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
| `pages/Positions/index.tsx` | Vault address for position queries AND summary chips preserved |
| `components/NavBar/Tabs/TabsContent.tsx` | Pool tab operator gate (`useOperatedPoolAddresses`) not removed |
| `pages/RouteDefinitions.tsx` + `pages/routeDefinition.tsx` | `/positions` route `isPoolOperator` gate not removed |
| `packages/api/src/getEntryGatewayUrl.ts` | Fork rule preserved: a PROD pin honors `entryGatewayApiUrlOverride` — prod-pinned transports (`entryGatewayProdPostTransport`: data API v1, unitags, RWA, search) must route through the RigoBlock proxy, not `entry-gateway.backend-prod.api.uniswap.org` (CORS-blocked from rigoblock origins) |
| `apps/web/wrangler-vite-worker.jsonc` | Production `ENTRY_GATEWAY_API_URL` (BFF proxy target) points at the RigoBlock gateway proxy, not the Uniswap backend |
| `features/Explore/state/listTokens/useListTokens.ts` | Explicit `chainId` selection stays guarded (`isBackendSupportedChainId`) — never send a backend-unsupported chain (999) to ListTokens |
| `packages/ui/src/utils/colors/platform/rn-image-colors.web.ts` | CoinGecko image URLs stay rewritten through the `/v2/img` gateway proxy — do not fetch `coin-images.coingecko.com` directly from the browser |
| `packages/uniswap/src/features/transactions/swap/utils/protocols.ts` | `filterProtocols` keeps stripping `UNISWAPX_LATEST` unconditionally (ignoring the upstream `uniswapx` statsig gate — it is on upstream and the fork proxies Statsig), `DEFAULT_PROTOCOL_OPTIONS` stays classic-only (V4/V3/V2), so quotes never route via UniswapX and the settings "Default" toggle matches real behavior |
| `packages/uniswap/src/features/transactions/swap/utils/tradingApi.ts` | `isTradingApiDelegationSupportedChainId` (999 exclusion) preserved — `check_delegation` 400s on 999 |
| `packages/uniswap/src/features/smartWallet/delegation/createTradingApiDelegationRepository.ts` + `apps/web/src/hooks/useGetSwapDelegationInfo.ts` | Delegation chainIds stay filtered by `isTradingApiDelegationSupportedChainId` |
| `components/SearchModal/CurrencySearch.tsx` | Balance provider address override preserved |
| `pages/Portfolio/Tokens/hooks/useTransformTokenTableData.ts` | Quantity uses `balance.totalAmount` |
| `pages/Portfolio/Tokens/utils/filterMultichainBalancesByChain.ts` | Fallback uses `sumTokenValueUsd` |
| `pages/Portfolio/Perps/hyperliquid/useHyperliquidBridgeCallback.ts` | Bridge gas estimated locally via `RPC_PROVIDERS` on raw calldata (never `vaultContract.estimateGas` through the wallet provider); revert errors thrown, non-revert failures fall back to 2.75M |
| `packages/uniswap/src/components/CurrencyInputPanel/**` (+ `features/gas/hooks/useMaxAmountSpend.ts`) | `isSmartPool` reaches every max path (balance-row tap + presets) — smart pools spend the full native balance with NO gas reserve |
| `apps/web/src/utils/maxAmountSpend.ts` | Wallet-context max (BuyModal/SellModal minting) KEEPS the 0.01 ETH native reserve; do not merge with the smart-pool path |
| `packages/uniswap/src/components/TokenSelector/hooks/useTokenSectionsForSearchResults.ts` + `useLocalChainTokens.ts` | All-Networks search merges locally-configured tokens of non-backend-supported chains (999); `useLocalChainTokens` accepts a chain list |
| `packages/uniswap/src/features/dataApi/balances/portfolioBalanceToCurrencyAmount.ts` | Exact-amount conversions from portfolio balances stay `quantityRaw`-first — never `parseUnits(quantity.toString())` |
| `packages/uniswap/src/features/transactions/swap/stores/swapFormStore/hooks/useDerivedSwapInfo.ts` + `apps/web/src/features/Liquidity/Create/hooks/useDepositInfo.tsx` | Smart-pool balances (portfolio API) convert via `portfolioBalanceToCurrencyAmount` for exact-amount math |

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
- **UR version selection is fork-specific — DO NOT "FIX" THE COMPARISON DIRECTION ON A SYNC**: `x-universal-router-version` must stay **2.0** for smart pools until RigoBlock governance upgrades the selector mapping, and the code detects that upgrade by INEQUALITY, not equality. The addresses in `UR_2_0_0_APPLICATION_ADAPTERS` (`packages/uniswap/src/data/apiClients/tradingApi/smartPoolUniversalRouterVersion.ts`) are the **UR-2.0.0 adapter deployments** — the addresses governance CURRENTLY maps the UR selectors to (verified onchain Oct 2026: all three selectors `0x3593564c`/`0x24856bc3`/`0xdd46508f` return these per-chain addresses from the authority). Semantics, exactly: ONE onchain read of `Authority(0xe35129A1E0BdB913CF6Fd8332E9d3533b5F41472 — same address on every chain).getApplicationAdapter(0x3593564c)` (injected by `apps/web/src/utils/smartPoolUniversalRouter.ts`); **mapping === the chain's UR-2.0.0 adapter → keep requesting 2.0; mapping is any OTHER non-zero address → governance upgraded → request 2.1.2**. A null/zero mapping read THROWS (the selector is always mapped — null means the read is wrong), and RPC errors propagate — there is intentionally NO version fallback. If the UR-2.0.0 adapters are ever re-deployed, update the list (they track the current 2.0.0 deployment; they are NOT a historic "upgrade target" list and must not be inverted to mean "2.1.2 adapter"). Permissioned tokens force 2.2.0. `swapSaga` keeps/strips UR 2.1.x commands (PAY_PORTION_FULL_PRECISION 0x07, BALANCE_CHECK_ERC20 0x0e) from calldata based on the same resolution. Upstream's `supportedURVersions` + `UseUniversalRouterVersion211` flag do NOT apply — do not adopt them for the fork.
- **429 rate-limit gate (RigoBlock fork)**: `packages/chains/src/rpc/rateLimitGate.ts` fails fast without network I/O while an origin is cooling down from a 429 (honoring `Retry-After`, otherwise exponential backoff). It is wired into `createUniRpcTransportFactory` (both session branches, as viem `fetchFn` + response hooks) and the ethers fetch path in `createEthersProvider.ts`. Without it, every poller/retry loop (per-chain viem watchers, ethers block-number polling, transport retries) multiplies request volume against an already rate-limiting gateway. The gate also counts CONSECUTIVE FETCH-LEVEL FAILURES (threshold 3): a CORS-blocked response (e.g. an edge-generated 429 without ACAO headers) never reaches JS as a Response, so the 429 hooks alone would never fire and retry loops would spam the endpoint forever — fetch failures trip the same cooldown, and any completed response resets them. Do not remove the gate checks from upstream syncs, and route any new gateway-facing fetch through `rateLimitedFetch`.
- **HyperEvm (chain 999) crosschain bridging**: the live swap path imports `TradingApi` from `@universe/api`, so the effective enum is `packages/api/src/clients/trading/__generated__/models/ChainId.ts`. Both `__generated__` dirs are gitignored and rebuilt by `bun api tradingapi:generate`, so the `_999 = 999` member is injected by the tracked post-processing script `packages/api/scripts/modifyTradingApiTypes.mts` — do not remove that block; a bare hand-edit to the generated file is wiped on the next regen. (The legacy mirror at `packages/uniswap/src/data/tradingApi/__generated__` is dead code with zero importers — no need to keep it in sync.) This single addition ungates every crosschain path (`checkIsBridgePair`, swappable-tokens prefetch, bridging-token fetch, quote request), since they all filter through `toTradingApiSupportedChainId`. Prerequisite on the backend: the fork's trading API must return HyperEvm USDC (`0xb88339CB7199b77E23DB6E890353E22632Ba630f`) in `swappable_tokens` for USDC@1.
- **HyperEvm is enabled app-wide but NOT served by Uniswap's data API**: the fork added it to `getEnabledChains`' allowedChains (a fork-only whitelist; upstream has no such list) so crosschain bridging can target it, but any `data.v1`/`data.v2` request carrying chainId 999 fails with 400 "unrecognized chains: 999". Data-API consumers must build chainIds via `useBackendSupportedChainIds()` (`apps/web/src/hooks/useBackendSupportedChainIds.ts`, filters `useEnabledChains().chains` by `isBackendSupportedChainId`) instead of raw `useEnabledChains().chains` — `useListTokens`, `useTrendingCarouselTokens`, and `useV2ListPools` already do. Re-apply when adding new data-API call sites or on upstream syncs touching them. The same applies to an **explicitly selected** chain: `useListTokens`' `chainId` param must stay guarded by `isBackendSupportedChainId` (query disabled for 999), and any new `chainId ? [chainId] : …` call-site pattern needs the same guard. Balance/history calls that tolerate or bypass 999 (e.g. the portfolio chart's Hyperliquid path) are exempt.
- **Prod-pinned entry-gateway transports route through the RigoBlock proxy** (Oct 2026 production CORS incident): upstream pins several clients to the prod backend with `getEntryGatewayUrl({ env: PROD })` (data API v1 `DataApiClient`, unitags, RWA lists, token search) — upstream's env-pin bypass of `ENTRY_GATEWAY_API_URL_OVERRIDE` means those calls went straight to `entry-gateway.backend-prod.api.uniswap.org`, which sends no CORS headers for rigoblock origins, so every call was preflight-blocked. Fork rule (in `packages/api/src/getEntryGatewayUrl.ts`): a PROD pin honors the override, because the override points at the RigoBlock gateway proxy (`/v2/entry-gateway/*` → the prod backend) and the proxy only fronts prod. Do NOT "restore" the upstream bypass for prod pins.
- **The proxy must return CORS headers even on failures** (Oct 2026 incident): when the proxy's upstream fetch throws (backend outage/timeout), a bare error response has no `Access-Control-Allow-Origin`, so the browser reports a misleading "No ACAO header" CORS error for what is really a backend failure — this masquerades as a CORS outage and heals "by itself" when the backend recovers. `scripts/rigoblock-api-proxy.worker.js` wraps every upstream branch in try/catch and returns a CORS'd 502 on failure. Note: that file is a REFERENCE copy — the deployed worker must be updated for the behavior to take effect.
- **CoinGecko token images route through the proxy for color extraction** (Oct 2026 incident): the UI extracts token colors from logo images (`packages/ui/src/utils/colors`, `react-native-image-colors` with `crossOrigin="anonymous"`). CoinGecko's CDN sends `Access-Control-Allow-Origin: *`, but its WAF intermittently challenges bursts of direct browser requests with a 403 page that carries NO CORS headers (upstream app.uniswap.org does not see this — CoinGecko's WAF treats that origin differently). Deterministic fix: `rn-image-colors.web.ts` (web only) rewrites `coin-images.coingecko.com/*` URLs to `https://interface.gateway.rigoblock.com/v2/img/*`, and the proxy worker forwards `/v2/img/*` to CoinGecko with wildcard CORS, no cookies, and long cache. Plain `<img>` logo display needs no CORS and is NOT rewritten. If logos load but colors fall back to theme tokens, check that the deployed worker actually serves `/v2/img/*`.
- **`/wallet/check_delegation` rejects HyperEvm (999)** (Oct 2026 incident): 999 is a TradingApi-supported chain for quotes/bridging (codegen-injected — see `modifyTradingApiTypes.mts`), but the fork's trading API 400s `check_delegation` for the ENTIRE request when 999 is present, and HyperEvm has no Universal Router deployment (`supportedURVersions: []`) so delegation is meaningless there anyway. All delegation call sites must filter through `isTradingApiDelegationSupportedChainId()` (`packages/uniswap/src/features/transactions/swap/utils/tradingApi.ts`), NOT `toTradingApiSupportedChainId()`: `createTradingApiDelegationRepository`, web's `useGetSwapDelegationInfo`, and `useEthAsErc20UniswapXQualifyingEvent` already do — re-apply on upstream syncs adding new `check_delegation` call sites.
- **Activity tab must not query Zerion for smart pool addresses**: `ListTransactions` only tracks EOAs — a vault address always 500s ("untrackable wallet address" wrapped by the gateway) and the portfolio's any-error→outage logic then shows the global "Service provider offline" banner. `PortfolioActivity` and `PortfolioOverview` skip the activity query when the resolved address is the active smart pool (via `skip` plumbing in `useActivityFiltering`), rendering the normal empty state. A real smart-pool activity view would need vault event indexing — out of scope. Do not "fix" this by string-matching the gateway error message.
- **Legacy styled-components infra inventory**: the deprecated RigoBlock pages (Vote, CreateProposal, Stake, earn/createPool modals) render through `~/lib/deprecated-styled` (styled-components alias) plus these compat surfaces, which are thin adapters over the SHARED modern components — extend/migrate these, never re-add the old packages (e.g. `rebass`) and never clone a deleted package locally: `~/components/deprecated/{Row,Column}.tsx` (layout), `~/theme/components/text.tsx` (`ThemedText` presets wrapping mycelium `Text` from `@universe/mycelium`; old color keys like `accent1`/`white` map to spore tokens), and `~/components/Button/buttons.tsx` (`ButtonPrimary`/`ButtonError`/`ButtonConfirmed` wrapping `Button` from `ui/src` — `branded` variant is `$accent1` gold; legacy `padding`/`width`/`$borderRadius`/`altDisabledStyle` props are folded into `style`/`disabled`). Fully custom selectors (e.g. `CurrencySelect` in `~/components/CurrencyInputPanel` and `~/components/createPool/CreateModal`) are plain `styled.button`s. `DeprecatedThemeProvider` still supplies the styled-components theme (`theme.accent1` etc. mapped to spore tokens) for the remaining styled wrappers. `styled-components` is a DIRECT dependency of `apps/web` — do not let it fall back to transitive-only presence (it once survived only via `@privy-io/react-auth`; a fresh CI install then failed to resolve it). See root `AGENTS.md` §Fork-sync playbook for the full sync procedure.
- **Positions hero hides upstream's "Launch token" CTA** (`apps/web/src/features/Liquidity/PositionsHeroHeader.tsx`): it opens Uniswap's LaunchTokenModal (Launch Auction surface), which the fork deliberately does not expose. Same invariant as Launches/Explore Auctions — upstream syncs will try to restore it; do not re-add.
- **Swap routing is classic-only; UniswapX must never be requested** (Oct 2026 incident): the upstream `uniswapx` statsig gate is ON in production and the fork proxies Statsig (`STATSIG_PROXY_URL_OVERRIDE`), so `getFeatureFlag(FeatureFlags.UniswapX)` returns true for the fork. The only thing keeping UniswapX out of quote requests is `filterProtocols` (`packages/uniswap/src/features/transactions/swap/utils/protocols.ts`) — it must keep stripping `UNISWAPX_LATEST` unconditionally, ignoring both the flag and its `uniswapXEnabled` argument (the single choke point for the `useQuoteRoutingParams` hook and `evmTradeService`). `DEFAULT_PROTOCOL_OPTIONS` in the same file must stay `[V4, V3, V2]` so the settings "Default" routing toggle reflects the actual classic default, and `isDefaultTradeRouteOptions` must keep comparing the UniswapX-stripped set (persisted settings from before the fix can still list it). When the gate leaked through, every smart-pool swap went down the UniswapX order-signing flow and failed with "Swap couldn't be completed with UniswapX" (`swap.fail.uniswapX`, backend rejection of the Dutch order) plus a reverted classic retry tx. Upstream syncs will restore flag-honoring behavior — re-apply the fork filter.
- **Perps Bridge gas estimation must be local** (Oct 2026 incident): `useHyperliquidBridgeCallback.ts` (`pages/Portfolio/Perps/hyperliquid/`) must estimate the vault `depositV3` gas via `RPC_PROVIDERS[sourceChainId]` on the raw calldata — NEVER through the wallet-connected provider, which routes `eth_estimateGas` to the gateway, and the gateway cannot simulate an EOA→vault tx (it returns `result=undefined` → ethers throws "bad result from backend / invalid BigNumber value"). Same pattern as `swapSaga.estimateBridgeGas`: revert-class errors (`execution reverted` / `UNPREDICTABLE_GAS_LIMIT` / `cannot estimate gas`, incl. the `0xd99e07af` OutputAmountTooLow and `0x0f6e887f` EffectiveSupplyTooLow decodes) are THROWN as `SmartPoolBridgeError` so the modal shows the reason; any other estimation failure falls back to `RIGOBLOCK_BRIDGE_GAS_FALLBACK` (2.75M). Do not "simplify" back to `vaultContract.estimateGas` on a sync.
- **All-Networks token search must merge local tokens of non-indexed chains** (HyperEvm): `useTokenSectionsForSearchResults.ts` prepends `localSearchTokenOptions` to backend search results when no chain filter is set, and `useLocalChainTokens.ts` accepts a chain LIST (All-Networks covers every enabled chain failing `isBackendSupportedChainId`). Without this, USDC@999 (`0xb88339CB7199b77E23DB6E890353E22632Ba630f`) is unselectable in the output-token selector when searching from All-Networks mode — the backend search endpoint 400s on chain 999, so it can never return it. Keep `RIGOBLOCK_BRIDGE_SUPPORTED_CHAINS` (including HyperEvm as a bridge TARGET) passed from `CurrencySearch.tsx` as the client-side filter for `useBridgingTokensOptions` — it only filters returned tokens; it does not add chains to the request. Note the real prerequisite is backend-side: the fork's trading API must return HyperEvm USDC in `swappable_tokens` for the BridgingTokens section to list it.
- **The API proxy worker rate-limits in-worker** (Oct 2026 incident): `scripts/rigoblock-api-proxy.worker.js` keeps a per-IP sliding window over `/v2/*` and returns CORS'd 429s via `respond()`. A dashboard WAF rate-limiting rule serves its block response at the edge BEFORE the worker runs, and that response cannot carry custom headers — tripped rules surface as "No Access-Control-Allow-Origin" CORS errors at initial-load bursts (selective: only while over threshold) and make the app look broken-and-slow. If a dashboard rule is kept, its threshold must stay well above the worker's, or the edge 429s (no CORS) return. The file is a REFERENCE copy — the deployed worker must be updated for any of this to take effect.
- **MAX on a smart pool spends the FULL native balance — NO gas reserve (this was forgotten once; a sync silently re-introduced the reserve).** Gas is paid by the operator's wallet, not the vault, so every max-amount path in the SWAP context must pass `isSmartPool` through to `useMaxAmountSpend`: the package `CurrencyInputPanel` (balance-row tap AND `PresetAmountButton`) receives it from `SwapFormCurrencyInputPanel` (`isSmartPool={!!smartPoolAddress}`, with `showMaxButtonOnly` for pools). **Wallet contexts keep the reserve** — `~/utils/maxAmountSpend` (BuyModal/SellModal minting pool tokens from the user's own wallet) subtracts 0.01 ETH from native max unless `isSmartPool` is true. Do NOT merge the two helpers and do NOT remove the wallet-path reserve; when touching any MAX/preset input, check which context it renders in. Note this concerns only the max amount the UI offers — the executed amountIn is always the exact typed amount (there is no "max" sentinel in UR calldata; upstream's `uint160.max` appears ONLY in the Permit2 permit allowance, a step the fork skips entirely for vaults).
- **Smart-pool balances for exact-amount math MUST use `quantityRaw`, never the float `quantity`** (Oct 2026 incident): the swap form's `useDerivedSwapInfo` and the LP create form's `useDepositInfo` read smart-pool balances from the portfolio API. `PortfolioBalance.quantity` is a float64 that loses precision past ~15-17 significant digits — for 18-decimal tokens it can round ABOVE the true on-chain balance (0.999999999999999999 ETH → `1`), so MAX requested more than the vault held and every full-balance swap reverted with `TRANSFER_FROM_FAILED` while "full minus a digit" worked; 6-decimal USDC stays exact in float64, which masked it. Both call sites MUST convert via `portfolioBalanceToCurrencyAmount` (`packages/uniswap/src/features/dataApi/balances/portfolioBalanceToCurrencyAmount.ts`, quantityRaw-first with float fallback). New smart-pool balance consumers must use it too — do not reintroduce `parseUnits(quantity.toString())`. Also verified while investigating: the calldata rewriter (`state/sagas/transactions/universalRouterCalldata.ts`) never touches amounts — it rewrites recipients and strips/downgrades commands only, so amountOut/minAmountOut arrive exactly as the trading API computed them.
