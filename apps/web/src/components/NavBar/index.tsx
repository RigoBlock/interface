import { Token } from '@uniswap/sdk-core'
import { FeatureFlags, useFeatureFlag } from '@universe/gating'
import { useEffect, useMemo, useRef } from 'react'
import { useLocation } from 'react-router'
import { Flex, styled, Nav as TamaguiNav, useMedia } from 'ui/src'
import { breakpoints, INTERFACE_NAV_HEIGHT, zIndexes } from 'ui/src/theme'
import { useConnectionStatus } from 'uniswap/src/features/accounts/store/hooks'
import { useEnabledChains } from 'uniswap/src/features/chains/hooks/useEnabledChains'
import Row from '~/components/deprecated/Row'
import { CompanyMenu } from '~/components/NavBar/CompanyMenu'
import { NewUserCTAButton } from '~/components/NavBar/DownloadApp/NewUserCTAButton'
import { PreferenceMenu } from '~/components/NavBar/PreferencesMenu'
import { useTabsVisible } from '~/components/NavBar/ScreenSizes'
import { SearchBar } from '~/components/NavBar/SearchBar'
import { useIsSearchBarVisible } from '~/components/NavBar/SearchBar/useIsSearchBarVisible'
import { Tabs } from '~/components/NavBar/Tabs/Tabs'
import TestnetModeTooltip from '~/components/NavBar/TestnetMode/TestnetModeTooltip'
import { UniswapWrappedEntry } from '~/components/NavBar/UniswapWrappedEntry'
import { ChainSelector } from '~/components/NavBar/ChainSelector'
import PoolSelect from '~/components/NavBar/PoolSelect'
import Web3Status from '~/components/Web3Status'
import { RIGOBLOCK_SUPPORTED_CHAINS, RIGOBLOCK_TESTNET_CHAINS } from '~/constants/addresses'
import { useAccount } from '~/hooks/useAccount'
import { PageType, useIsPage } from '~/hooks/useIsPage'
import usePrevious from '~/hooks/usePrevious'
import { css, deprecatedStyled } from '~/lib/deprecated-styled'
import { useActiveSmartPool, useSelectActiveSmartPool } from '~/state/application/hooks'
import { useMultiChainAllPoolsData, useMultiChainStakingPools } from '~/state/pool/multichain'

// Flex is position relative by default, we must unset the position on every Flex
// between the body and search component
const UnpositionedFlex = styled(Flex, {
  position: 'unset',
})
const Nav = styled(TamaguiNav, {
  position: 'unset',
  px: '$padding12',
  width: '100%',
  height: INTERFACE_NAV_HEIGHT,
  zIndex: zIndexes.sticky,
  justifyContent: 'center',
})
const NavItems = css`
  gap: 12px;
  @media screen and (max-width: ${breakpoints.md}px) {
    gap: 4px;
  }
`
const Left = deprecatedStyled(Row)`
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  ${NavItems}
`
const Right = deprecatedStyled(Row)`
  justify-content: flex-end;
  ${NavItems}
`
const SearchContainer = styled(UnpositionedFlex, {
  position: 'absolute',
  left: '50%',
  transform: 'translateX(-50%)',
  width: 'max-content',
  maxWidth: '50%',
  minWidth: 0,
  flexDirection: 'row',
  justifyContent: 'center',
  alignSelf: 'center',
  alignItems: 'flex-start',
  height: 42,
  gap: 12,
})

const SelectedPoolContainer = styled(UnpositionedFlex, {
  width: 'max-content',
  maxWidth: '40%',
  minWidth: 200,
  height: 42,
  flexShrink: 0,
  flexDirection: 'row',
  justifyContent: 'center',
  alignSelf: 'center',
  alignItems: 'center',
  overflow: 'hidden',
  mt: 8,
  $md: {
    position: 'absolute',
    left: -100,
    transform: 'translateX(0)',
    minWidth: 150,
    maxWidth: 'calc(40% - 200px)',
    height: 42,
    overflow: 'hidden',
    mt: 8,
  },
})

function useShouldHideChainSelector() {
  const isLandingPage = useIsPage(PageType.LANDING)
  const isSendPage = useIsPage(PageType.SEND)
  const isSwapPage = useIsPage(PageType.SWAP)
  const isLimitPage = useIsPage(PageType.LIMIT)
  const isExplorePage = useIsPage(PageType.EXPLORE)
  const isPositionsPage = useIsPage(PageType.POSITIONS)
  const isMigrateV3Page = useIsPage(PageType.MIGRATE_V3)
  const isBuyPage = useIsPage(PageType.BUY)
  const isEarnPage = useIsPage(PageType.EARN)
  const isPortfolioPage = useIsPage(PageType.PORTFOLIO)

  // Hide chain selector on pool position page (chain-specific page)
  const { pathname } = useLocation()
  const isPoolPositionPage = pathname.includes('/smart-pool')

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
    isPoolPositionPage

  return multichainHiddenPages
}

function useShouldHidePoolSelector() {
  const { pathname } = useLocation()
  const isEarnPage = pathname === '/earn' || pathname === '/earn/manage'
  const isPoolPositionPage = pathname.includes('/smart-pool')

  return isEarnPage || isPoolPositionPage
}

export default function Navbar() {
  const isLandingPage = useIsPage(PageType.LANDING)

  const media = useMedia()
  const isSmallScreen = media.md
  const areTabsVisible = useTabsVisible()
  const isSearchBarVisible = useIsSearchBarVisible()
  const { isConnected } = useConnectionStatus()
  //const collapseSearchBar = media.xl
  //const NAV_SEARCH_MAX_HEIGHT = 'calc(100vh - 30px)'

  const account = useAccount()
  const { address } = account
  const prevAccount = usePrevious(address)
  const accountChanged = prevAccount && prevAccount !== address

  const hideChainSelector = useShouldHideChainSelector()
  const hidePoolSelector = useShouldHidePoolSelector()

  const { isTestnetModeEnabled } = useEnabledChains()
  const isEmbeddedWalletEnabled = useFeatureFlag(FeatureFlags.EmbeddedWallet)

  // ── Operated pools derived from the staking batch (shared TanStack query with Earn page) ──
  const chains = useMemo(
    () => (isTestnetModeEnabled ? RIGOBLOCK_TESTNET_CHAINS : RIGOBLOCK_SUPPORTED_CHAINS),
    [isTestnetModeEnabled],
  )

  const { data: allPools } = useMultiChainAllPoolsData(chains)
  const { stakingPools } = useMultiChainStakingPools(allPools ?? [])

  // Derive operated Token[] from staking results — all RigoBlock pools use 18 decimals.
  // Deduplicated by address so pools deployed on multiple chains appear once.
  const rawOperatedPools = useMemo(() => {
    if (!address || !allPools || !stakingPools) {
      return []
    }
    const seen = new Set<string>()
    const result: Token[] = []
    for (let i = 0; i < allPools.length; i++) {
      const s = stakingPools[i]
      if (!s?.userIsOwner) {
        continue
      }
      const p = allPools[i]
      const key = p.pool.toLowerCase()
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      result.push(new Token(p.chainId ?? 1, p.pool, 18, p.symbol, p.name))
    }
    return result
  }, [address, allPools, stakingPools])

  // Cache operated pools to avoid UI flicker during data reloads
  const cachedPoolsRef = useRef<Token[]>([])
  useEffect(() => {
    if (rawOperatedPools.length > 0) {
      cachedPoolsRef.current = rawOperatedPools
    }
  }, [rawOperatedPools])

  const activeSmartVault = useActiveSmartPool()

  // Use cached pools while loading new data
  const { operatedPools, newDefaultVaultLoaded } = useMemo(() => {
    let newDefaultVaultLoaded = false

    if (rawOperatedPools.length === 0) {
      return { operatedPools: cachedPoolsRef.current, newDefaultVaultLoaded }
    }

    const operatedAddresses = rawOperatedPools.map((pool) => pool.address.toLowerCase())
    if (activeSmartVault.address && !operatedAddresses.includes(activeSmartVault.address.toLowerCase())) {
      const cachedAddresses = cachedPoolsRef.current.map((p) => p.address.toLowerCase())
      if (!cachedAddresses.includes(activeSmartVault.address.toLowerCase())) {
        newDefaultVaultLoaded = true
      }
    }

    return { operatedPools: rawOperatedPools, newDefaultVaultLoaded }
  }, [rawOperatedPools, activeSmartVault.address])

  const defaultPool = operatedPools[0] as Token | undefined
  const onPoolSelect = useSelectActiveSmartPool()

  useEffect(() => {
    // Auto-select on initial load when no pool is selected yet, or reset on account change
    const noPoolSelectedYet = !activeSmartVault.address
    const shouldSelect = !!(accountChanged || newDefaultVaultLoaded || noPoolSelectedYet)
    if (shouldSelect && defaultPool) {
      onPoolSelect(defaultPool)
    }
  }, [accountChanged, defaultPool, onPoolSelect, newDefaultVaultLoaded, activeSmartVault.address])

  const userIsOperator = operatedPools.length > 0

  return (
    <Nav>
      <UnpositionedFlex row centered width="100%">
        <Left style={{ flexShrink: 0 }}>
          <CompanyMenu />
          {areTabsVisible && <Tabs userIsOperator={userIsOperator} />}
        </Left>

        <SearchContainer>
          {isSearchBarVisible && userIsOperator && !hidePoolSelector && (
            <SelectedPoolContainer>
              <PoolSelect operatedPools={operatedPools} />
            </SelectedPoolContainer>
          )}
          {/*isSearchBarVisible && (
            <UnpositionedFlex flex={1} flexShrink={1} ml="$spacing16">
              <SearchBar />
            </UnpositionedFlex>
          )*/}
        </SearchContainer>

        <Right>
          <UniswapWrappedEntry />
          {!hideChainSelector && <ChainSelector />}
          {!isSearchBarVisible && userIsOperator && !hidePoolSelector && (
            <Flex mt={8}>
              <PoolSelect operatedPools={operatedPools} />
            </Flex>
          )}
          {/*!isSearchBarVisible && <SearchBar />*/}
          {!isEmbeddedWalletEnabled && isLandingPage && !isSmallScreen && <NewUserCTAButton />}
          {!isConnected && <PreferenceMenu />}
          {isTestnetModeEnabled && <TestnetModeTooltip />}
          <Web3Status />
        </Right>
      </UnpositionedFlex>
    </Nav>
  )
}
