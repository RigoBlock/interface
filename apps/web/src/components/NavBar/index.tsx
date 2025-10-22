import { Bag } from 'components/NavBar/Bag'
import { ChainSelector } from 'components/NavBar/ChainSelector'
import { CompanyMenu } from 'components/NavBar/CompanyMenu'
import { NewUserCTAButton } from 'components/NavBar/DownloadApp/NewUserCTAButton'
import PoolSelect from 'components/NavBar/PoolSelect'
import { PreferenceMenu } from 'components/NavBar/PreferencesMenu'
import { useTabsVisible } from 'components/NavBar/ScreenSizes'
import { SearchBar } from 'components/NavBar/SearchBar'
import { Tabs } from 'components/NavBar/Tabs/Tabs'
import TestnetModeTooltip from 'components/NavBar/TestnetMode/TestnetModeTooltip'
import { useIsAccountCTAExperimentControl } from 'components/NavBar/accountCTAsExperimentUtils'
import Web3Status from 'components/Web3Status'
import Row from 'components/deprecated/Row'
import { useAccount } from 'hooks/useAccount'
import { PageType, useIsPage } from 'hooks/useIsPage'
import deprecatedStyled, { css } from 'lib/styled-components'
import { useProfilePageState } from 'nft/hooks'
import { ProfilePageStateType } from 'nft/types'
import { useEffect, useMemo, useRef } from 'react'
import { useOperatedPools } from 'state/pool/hooks'
import { Flex, Nav as TamaguiNav, styled, useMedia } from 'ui/src'
import { INTERFACE_NAV_HEIGHT, breakpoints, zIndexes } from 'ui/src/theme'
import { useEnabledChains } from 'uniswap/src/features/chains/hooks/useEnabledChains'
import { FeatureFlags } from 'uniswap/src/features/gating/flags'
import { useFeatureFlag } from 'uniswap/src/features/gating/hooks'

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
  minWidth: 100,
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
  const isNFTPage = useIsPage(PageType.NFTS)
  const isLandingPage = useIsPage(PageType.LANDING)
  const isSendPage = useIsPage(PageType.SEND)
  const isSwapPage = useIsPage(PageType.SWAP)
  const isLimitPage = useIsPage(PageType.LIMIT)
  const isExplorePage = useIsPage(PageType.EXPLORE)
  const isPositionsPage = useIsPage(PageType.POSITIONS)
  const isMigrateV3Page = useIsPage(PageType.MIGRATE_V3)
  const isBuyPage = useIsPage(PageType.BUY)

  const baseHiddenPages = isNFTPage
  const multichainHiddenPages =
    isLandingPage ||
    isSendPage ||
    isSwapPage ||
    isLimitPage ||
    baseHiddenPages ||
    isExplorePage ||
    isPositionsPage ||
    isMigrateV3Page ||
    isBuyPage

  return multichainHiddenPages
}

export default function Navbar() {
  const isNFTPage = useIsPage(PageType.NFTS)
  const isLandingPage = useIsPage(PageType.LANDING)

  const sellPageState = useProfilePageState((state) => state.state)
  const media = useMedia()
  const isSmallScreen = media.md
  const isMediumScreen = media.lg
  const areTabsVisible = useTabsVisible()
  const collapseSearchBar = media.xl
  const account = useAccount()
  const NAV_SEARCH_MAX_HEIGHT = 'calc(100vh - 30px)'

  const hideChainSelector = useShouldHideChainSelector()

  const { isTestnetModeEnabled } = useEnabledChains()
  const isEmbeddedWalletEnabled = useFeatureFlag(FeatureFlags.EmbeddedWallet)

  const { isControl, isLoading: isSignInExperimentControlLoading } = useIsAccountCTAExperimentControl()

  const isSignInExperimentControl = !isEmbeddedWalletEnabled && isControl
  const shouldDisplayCreateAccountButton = false
  const rawOperatedPools = useOperatedPools()
  const cachedPoolsRef = useRef<typeof rawOperatedPools | undefined>(undefined)
  const prevChainIdRef = useRef<number | undefined>(account.chainId)
  
  useEffect(() => {
    if (account.chainId !== prevChainIdRef.current) {
      cachedPoolsRef.current = undefined
      prevChainIdRef.current = account.chainId
    }
  }, [account.chainId])
  
  useEffect(() => {
    if (rawOperatedPools && rawOperatedPools.length > 0) {
      cachedPoolsRef.current = rawOperatedPools
    }
  }, [rawOperatedPools])
  
  const cachedOperatedPools = cachedPoolsRef.current ?? rawOperatedPools
  const cachedUserIsOperator = useMemo(() => 
    Boolean(cachedOperatedPools && cachedOperatedPools.length > 0),
    [cachedOperatedPools]
  )

  return (
    <Nav>
      <Flex row centered width="100%" style={{ position: 'relative' }}>
        <Left style={{ flexShrink: 0 }}>
          <CompanyMenu />
          {areTabsVisible && <Tabs userIsOperator={cachedUserIsOperator} />}
        </Left>

        <SearchContainer>
          {cachedOperatedPools && cachedOperatedPools.length > 0 && (
            <SelectedPoolContainer>
              <PoolSelect operatedPools={cachedOperatedPools} />
            </SelectedPoolContainer>
          )}
          {!collapseSearchBar && (
            <UnpositionedFlex flex={1} flexShrink={1} ml="$spacing16">
              <SearchBar maxHeight={NAV_SEARCH_MAX_HEIGHT} fullScreen={isSmallScreen} />
            </UnpositionedFlex>
          )}
        </SearchContainer>

        <Right>
            {collapseSearchBar && (
            <div style={{ marginRight: '-20px' }}>
              <SearchBar maxHeight={NAV_SEARCH_MAX_HEIGHT} fullScreen={isSmallScreen} />
            </div>
            )}
          {isNFTPage && sellPageState !== ProfilePageStateType.LISTING && <Bag />}
          {shouldDisplayCreateAccountButton && isSignInExperimentControl && !isSignInExperimentControlLoading && isLandingPage && !isSmallScreen && (
            <NewUserCTAButton />
          )}
          {!account.isConnected && !account.isConnecting && <PreferenceMenu />}
          {!hideChainSelector && <ChainSelector />}
          {isTestnetModeEnabled && <TestnetModeTooltip />}
          <Web3Status />
          {shouldDisplayCreateAccountButton && !isSignInExperimentControl && !isSignInExperimentControlLoading && !account.address && !isMediumScreen && (
            <NewUserCTAButton />
          )}
        </Right>
      </Flex>
    </Nav>
  )
}
