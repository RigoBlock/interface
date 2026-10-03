import { Token } from "@uniswap/sdk-core";
import { normalizeTokenAddressForCache } from "@universe/chains";
import { FeatureFlags, useFeatureFlag } from "@universe/gating";
import { Flex, type FlexCompatProps } from "@universe/mycelium";
import { useMedia } from "@universe/mycelium/theme-hooks-compat";
import { forwardRef, useEffect, useMemo, useRef } from "react";
import { useLocation } from "react-router";
import { INTERFACE_NAV_HEIGHT, zIndexes } from "ui/src/theme";
import { useConnectionStatus } from "uniswap/src/features/accounts/store/hooks";
import { useEnabledChains } from "uniswap/src/features/chains/hooks/useEnabledChains";
import { ChainSelector } from "~/components/NavBar/ChainSelector";
import { CompanyMenu } from "~/components/NavBar/CompanyMenu";
import { NewUserCTAButton } from "~/components/NavBar/DownloadApp/NewUserCTAButton";
import PoolSelect from "~/components/NavBar/PoolSelect";
import { PreferenceMenu } from "~/components/NavBar/PreferencesMenu";
import { useTabsVisible } from "~/components/NavBar/ScreenSizes";
import { useIsSearchBarVisible } from "~/components/NavBar/SearchBar/useIsSearchBarVisible";
import { Tabs } from "~/components/NavBar/Tabs/Tabs";
import { TestnetModeTooltip } from "~/components/NavBar/TestnetMode/TestnetModeTooltip";
import { Web3Status } from "~/components/Web3Status";
import {
  RIGOBLOCK_SUPPORTED_CHAINS,
  RIGOBLOCK_TESTNET_CHAINS,
} from "~/constants/addresses";
import { useAccount } from "~/hooks/useAccount";
import { PageType, useIsPage } from "~/hooks/useIsPage";
import { usePrevious } from "~/hooks/usePrevious";
import { usePortfolioRoutes } from "~/pages/Portfolio/Header/hooks/usePortfolioRoutes";
import {
  useActiveSmartPool,
  useSelectActiveSmartPool,
} from "~/state/application/hooks";
import {
  useMultiChainAllPoolsData,
  useMultiChainStakingPools,
} from "~/state/pool/multichain";

const NavItemsRow = forwardRef<HTMLDivElement, FlexCompatProps>(
  function NavItemsRow({ $md: md, ...props }, ref) {
    return (
      <Flex
        ref={ref}
        position="static"
        row
        minWidth={0}
        alignItems="center"
        flexWrap="nowrap"
        justifyContent="flex-start"
        gap="$spacing12"
        $md={{ gap: "$spacing4", ...md }}
        {...props}
      />
    );
  }
);

function useShouldHideChainSelector() {
  const isLandingPage = useIsPage(PageType.LANDING);
  const isSendPage = useIsPage(PageType.SEND);
  const isSwapPage = useIsPage(PageType.SWAP);
  const isLimitPage = useIsPage(PageType.LIMIT);
  const isExplorePage = useIsPage(PageType.EXPLORE);
  const isPositionsPage = useIsPage(PageType.POSITIONS);
  const isMigrateV3Page = useIsPage(PageType.MIGRATE_V3);
  const isBuyPage = useIsPage(PageType.BUY);
  const isEarnPage = useIsPage(PageType.EARN);
  const isPortfolioPage = useIsPage(PageType.PORTFOLIO);

  // Hide chain selector on pool position page (chain-specific page)
  const { pathname } = useLocation();
  const isPoolPositionPage = pathname.includes("/smart-pool");

  const multichainHiddenPages =
    isLandingPage ||
    isSendPage ||
    isSwapPage ||
    isLimitPage ||
    isExplorePage ||
    isPositionsPage ||
    isMigrateV3Page ||
    isBuyPage ||
    isEarnPage ||
    isPortfolioPage ||
    isPoolPositionPage;

  return multichainHiddenPages;
}

function useShouldHidePoolSelector() {
  const { pathname } = useLocation();
  const { hasExplicitUrlAddress } = usePortfolioRoutes();
  const isEarnPage = pathname === "/earn" || pathname === "/earn/manage";
  const isPoolPositionPage = pathname.includes("/smart-pool");
  // Hide on portfolio only when an explicit address is in the URL (e.g. redirect from a pool click
  // or the user's own-wallet portfolio link). Otherwise operators can use the selector to switch
  // the smart pool portfolio shown on /portfolio.
  const isExplicitPortfolioAddress =
    pathname.startsWith("/portfolio") && hasExplicitUrlAddress;

  return isEarnPage || isPoolPositionPage || isExplicitPortfolioAddress;
}

export function Navbar() {
  const isLandingPage = useIsPage(PageType.LANDING);

  const media = useMedia();
  const isSmallScreen = media.md;
  const areTabsVisible = useTabsVisible();
  const isSearchBarVisible = useIsSearchBarVisible();
  const { isConnected } = useConnectionStatus();

  const account = useAccount();
  const { address } = account;
  const prevAccount = usePrevious(address);
  const accountChanged = prevAccount && prevAccount !== address;

  const hideChainSelector = useShouldHideChainSelector();
  const hidePoolSelector = useShouldHidePoolSelector();

  const { isTestnetModeEnabled } = useEnabledChains();
  const isEmbeddedWalletEnabled = useFeatureFlag(FeatureFlags.EmbeddedWallet);

  // ── Operated pools derived from the staking batch (shared TanStack query with Earn page) ──
  const chains = useMemo(
    () =>
      isTestnetModeEnabled
        ? RIGOBLOCK_TESTNET_CHAINS
        : RIGOBLOCK_SUPPORTED_CHAINS,
    [isTestnetModeEnabled]
  );

  const { data: allPools } = useMultiChainAllPoolsData(chains);
  const { stakingPools, loading: stakingPoolsLoading } =
    useMultiChainStakingPools(allPools ?? []);

  // Derive operated Token[] from staking results — all RigoBlock pools use 18 decimals.
  // Deduplicated by address so pools deployed on multiple chains appear once.
  const rawOperatedPools = useMemo(() => {
    if (!address || !allPools || !stakingPools) {
      return [];
    }
    const seen = new Set<string>();
    const result: Token[] = [];
    for (let i = 0; i < allPools.length; i++) {
      const s = stakingPools[i];
      if (!s.userIsOwner) {
        continue;
      }
      const p = allPools[i];
      const key = normalizeTokenAddressForCache(p.pool);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push(new Token(p.chainId ?? 1, p.pool, 18, p.symbol, p.name));
    }
    return result;
  }, [address, allPools, stakingPools]);

  // Cache operated pools to avoid UI flicker during data reloads
  const cachedPoolsRef = useRef<Token[]>([]);
  useEffect(() => {
    if (rawOperatedPools.length > 0) {
      cachedPoolsRef.current = rawOperatedPools;
    }
  }, [rawOperatedPools]);

  // Clear the cache when the connected account changes so a stale operator list is not reused for a new wallet.
  useEffect(() => {
    if (accountChanged) {
      cachedPoolsRef.current = [];
    }
  }, [accountChanged]);

  const activeSmartVault = useActiveSmartPool();

  // Use cached pools while loading new data
  const { operatedPools, newDefaultVaultLoaded, rawOperatedAddresses } =
    useMemo(() => {
      let hasNewDefaultVault = false;

      const rawAddresses = new Set(
        rawOperatedPools.map((pool) =>
          normalizeTokenAddressForCache(pool.address)
        )
      );

      if (rawOperatedPools.length === 0) {
        return {
          operatedPools: cachedPoolsRef.current,
          newDefaultVaultLoaded: hasNewDefaultVault,
          rawOperatedAddresses: rawAddresses,
        };
      }

      if (
        activeSmartVault.address &&
        !rawAddresses.has(
          normalizeTokenAddressForCache(activeSmartVault.address)
        )
      ) {
        const cachedAddresses = new Set(
          cachedPoolsRef.current.map((p) =>
            normalizeTokenAddressForCache(p.address)
          )
        );
        if (
          !cachedAddresses.has(
            normalizeTokenAddressForCache(activeSmartVault.address)
          )
        ) {
          hasNewDefaultVault = true;
        }
      }

      return {
        operatedPools: rawOperatedPools,
        newDefaultVaultLoaded: hasNewDefaultVault,
        rawOperatedAddresses: rawAddresses,
      };
    }, [rawOperatedPools, activeSmartVault.address]);

  const defaultPool = operatedPools[0] as Token | undefined;
  const onPoolSelect = useSelectActiveSmartPool();

  useEffect(() => {
    // Auto-select on initial load when no pool is selected yet, or reset on account change
    const noPoolSelectedYet = !activeSmartVault.address;
    const shouldSelect = !!(
      accountChanged ||
      newDefaultVaultLoaded ||
      noPoolSelectedYet
    );
    if (shouldSelect && defaultPool) {
      onPoolSelect(defaultPool);
    }
  }, [
    accountChanged,
    defaultPool,
    onPoolSelect,
    newDefaultVaultLoaded,
    activeSmartVault.address,
  ]);

  // Clear the active smart pool when it is not one of the pools the current wallet operates.
  // Only do this once pool data is fully loaded; otherwise the active vault flickers between the
  // connected wallet and the selected pool while the staking batch is still resolving.
  useEffect(() => {
    if (
      activeSmartVault.address &&
      allPools !== undefined &&
      !stakingPoolsLoading &&
      !rawOperatedAddresses.has(
        normalizeTokenAddressForCache(activeSmartVault.address)
      )
    ) {
      onPoolSelect(undefined);
    }
  }, [
    activeSmartVault.address,
    allPools,
    stakingPoolsLoading,
    rawOperatedAddresses,
    onPoolSelect,
  ]);

  const userIsOperator = operatedPools.length > 0;

  return (
    <Flex
      tag="nav"
      position="unset"
      px="$padding12"
      width="100%"
      height={INTERFACE_NAV_HEIGHT}
      zIndex={zIndexes.sticky}
      justifyContent="center"
    >
      <Flex
        position="static"
        width="100%"
        alignItems="center"
        $platform-web={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)",
        }}
      >
        <NavItemsRow>
          <CompanyMenu />
          {areTabsVisible && <Tabs userIsOperator={userIsOperator} />}
        </NavItemsRow>

        <Flex position="static" centered>
          {isSearchBarVisible && userIsOperator && !hidePoolSelector && (
            <PoolSelect operatedPools={operatedPools} />
          )}
        </Flex>

        <NavItemsRow justifyContent="flex-end">
          {!hideChainSelector && <ChainSelector />}
          {!isSearchBarVisible && userIsOperator && !hidePoolSelector && (
            <PoolSelect operatedPools={operatedPools} />
          )}
          {!isEmbeddedWalletEnabled && isLandingPage && !isSmallScreen && (
            <NewUserCTAButton />
          )}
          {!isConnected && <PreferenceMenu />}
          {isTestnetModeEnabled && <TestnetModeTooltip />}
          <Web3Status />
        </NavItemsRow>
      </Flex>
    </Flex>
  );
}
