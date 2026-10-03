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
- **Env vars** follow upstream naming (no `REACT_APP_` prefix). `ENTRY_GATEWAY_API_URL_OVERRIDE` is intentionally allowed in production (see `BaseEnvFieldRules` in `packages/config/src/BaseConfig.ts`) — it points entry-gateway traffic at the RigoBlock gateway. `AMPLITUDE_PROXY_URL_OVERRIDE` and `STATSIG_PROXY_URL_OVERRIDE` are allowed in production for the same reason (fork routes analytics/gating through the gateway); the config tests use `graphqlUrlOverride` as the still-forbidden example field.
- **Checked-in env files**: the fork tracks `apps/web/.env` (gitignored upstream — force-added here) as the single source for both dev and production builds; Vite only loads `.env` (+ `.env.override`, gitignored) via `vite/resolveEnvConfigs.ts` — `.env.development`/`.env.production` are NOT loaded by the build. Required names include `WALLETCONNECT_PROJECT_ID` (not `WALLET_CONNECT_PROJECT_ID`) and `UNISWAP_GATEWAY_DNS`; both must stay present or config validation blanks the app at runtime.
- **`config:pull` is opt-in** (`project.json` runs it only when `CONFIG_PULL=true`): it authenticates against Uniswap's Okta (login.uniswap.org) to fetch private config, which fork developers cannot do. The fork relies on the checked-in `.env` instead.
- **`.tamagui` generated bundles** are oxlint-ignored (`oxlint.config.ts`); rigoblock legacy files importing viem/ethers directly are in `DIRECT_VIEM_ETHERS_IMPORT_ALLOWLIST` (`config/oxlint-plugins/universe-custom.js`).
- **Legacy styled-components theme**: deprecated RigoBlock pages still read the styled-components theme at runtime (`theme.grids`, `theme.accent1`, …). `DeprecatedThemeProvider` (`~/theme/index.tsx`, mounted in `index.tsx`) must stay in the tree — it supplies `getDeprecatedTheme()` values mapped from spore tokens (`~/theme/deprecated`). Do not remove it in future syncs.
- **No credentialed cross-origin fetches**: the RigoBlock gateway answers CORS with `Access-Control-Allow-Origin: *`, so every client hitting it must use `credentials: 'omit'` (web RPC resolver, viem UniRPC transport, trading API fetch client, session service). Upstream `credentials: 'include'` reintroductions will fail CORS preflight.
