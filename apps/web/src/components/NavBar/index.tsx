import { Currency, Token } from '@uniswap/sdk-core'
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
import { useEffect, useMemo /*, useRef*/ } from 'react'
import { useAllPoolsData } from 'state/pool/hooks'
import { Flex, Nav as TamaguiNav, styled, useMedia } from 'ui/src'
import { INTERFACE_NAV_HEIGHT, breakpoints, zIndexes } from 'ui/src/theme'
import { useEnabledChains } from 'uniswap/src/features/chains/hooks/useEnabledChains'
import { FeatureFlags } from 'uniswap/src/features/gating/flags'
import { useFeatureFlag } from 'uniswap/src/features/gating/hooks'
import usePrevious from 'hooks/usePrevious'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { assume0xAddress } from 'utils/wagmi'
import { useReadContracts } from 'wagmi'
import { useActiveSmartPool, useSelectActiveSmartPool } from 'state/application/hooks'
import { useRef } from 'react'

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
  const NAV_SEARCH_MAX_HEIGHT = 'calc(100vh - 30px)'

  const account = useAccount()
  const { address, chainId, isConnected, isConnecting } = account
  const prevAccount = usePrevious(address)
  const accountChanged = prevAccount && prevAccount !== address

  const hideChainSelector = useShouldHideChainSelector()

  const { isTestnetModeEnabled } = useEnabledChains()
  const isEmbeddedWalletEnabled = useFeatureFlag(FeatureFlags.EmbeddedWallet)

  const { isControl, isLoading: isSignInExperimentControlLoading } = useIsAccountCTAExperimentControl()

  const isSignInExperimentControl = !isEmbeddedWalletEnabled && isControl
  const shouldDisplayCreateAccountButton = false
  const { data: allPools } = useAllPoolsData()
  const poolAddresses = useMemo(() => allPools?.map((p) => p.pool), [allPools])

  const { data, isLoading } = useReadContracts({
    contracts: useMemo(() => {
      return poolAddresses?.map(
        (vaultAddress) => ({
          address: assume0xAddress(vaultAddress) ?? '0x',
          abi: [
            {
              "inputs": [],
              "name": "getPool",
              "outputs": [
                {
                  "components": [
                    {
                      "internalType": "string",
                      "name": "name",
                      "type": "string"
                    },
                    {
                      "internalType": "string",
                      "name": "symbol",
                      "type": "string"
                    },
                    {
                      "internalType": "uint8",
                      "name": "decimals",
                      "type": "uint8"
                    },
                    {
                      "internalType": "address",
                      "name": "owner",
                      "type": "address"
                    },
                    {
                      "internalType": "address",
                      "name": "baseToken",
                      "type": "address"
                    }
                  ],
                  "internalType": "struct ISmartPoolState.ReturnedPool",
                  "name": "",
                  "type": "tuple"
                }
              ],
              "stateMutability": "view",
              "type": "function"
            }
          ],
          functionName: 'getPool',
          chainId,
        }) as const,
      )
    }, [poolAddresses, chainId]),
  })

  const poolsWithOwners = useMemo(() => {
    if (!address || !chainId || !poolAddresses || isLoading) {
      return undefined
    }

    return data
      ?.map(({ result }, i) => {
        if (!result) { return undefined }
        return result && { ...result, pool: poolAddresses[i] }
      })
  }, [address, chainId, poolAddresses, data, isLoading])

  // Cache operatedPools and userIsOperator until new data is loaded
  const rawOperatedPools = useMemo(() => poolsWithOwners
    ?.filter((pool) => pool?.owner?.toLowerCase() === address?.toLowerCase()) || [], [poolsWithOwners, address])
    .map((pool) => new Token(chainId ?? UniverseChainId.Mainnet, pool!.pool, pool!.decimals, pool!.symbol, pool!.name))

  const cachedPoolsRef = useRef<{ pools: typeof rawOperatedPools } | undefined>(undefined)

  useEffect(() => {
    if (rawOperatedPools && rawOperatedPools.length > 0) {
      cachedPoolsRef.current = { pools: rawOperatedPools }
    }
  }, [chainId, rawOperatedPools])

  const activeSmartVault = useActiveSmartPool()

  // Use cached pools while loading new data
  const { operatedPools, newDefaultVaultLoaded } = useMemo(() => {
    let newDefaultVaultLoaded = false
    
    if (!rawOperatedPools || rawOperatedPools.length === 0) {
      return { operatedPools: cachedPoolsRef.current?.pools || [], newDefaultVaultLoaded }
    }

    const operatedAddresses = rawOperatedPools.map((pool) => pool.address.toLowerCase())
    if (activeSmartVault.address && !operatedAddresses.includes(activeSmartVault.address.toLowerCase())) {
      newDefaultVaultLoaded = true
    }

    return { operatedPools: rawOperatedPools, newDefaultVaultLoaded }
  }, [rawOperatedPools, activeSmartVault.address])

  const defaultPool = useMemo(() => operatedPools?.[0], [operatedPools])
  const onPoolSelect = useSelectActiveSmartPool()

  const prevChainId = usePrevious(chainId)
  const chainChanged = prevChainId && prevChainId !== chainId

  useEffect(() => {
    const emptyPool = { isToken: false } as Currency

    // Notice: this is necessary to reset the selected pool when the user changes account or chain
    if (accountChanged || newDefaultVaultLoaded) {
      onPoolSelect(defaultPool ?? emptyPool)
    }
  }, [accountChanged, chainChanged, defaultPool, onPoolSelect, newDefaultVaultLoaded])

  const userIsOperator = Boolean(operatedPools && operatedPools.length > 0)

  return (
    <Nav>
      <Flex row centered width="100%" style={{ position: 'relative' }}>
        <Left style={{ flexShrink: 0 }}>
          <CompanyMenu />
          {areTabsVisible && <Tabs userIsOperator={userIsOperator} />}
        </Left>

        <SearchContainer>
          {!collapseSearchBar && userIsOperator && (
            <SelectedPoolContainer>
              <PoolSelect operatedPools={operatedPools} />
            </SelectedPoolContainer>
          )}
          {!collapseSearchBar && (
            <UnpositionedFlex flex={1} flexShrink={1} ml="$spacing16">
              <SearchBar maxHeight={NAV_SEARCH_MAX_HEIGHT} fullScreen={isSmallScreen} allPools={allPools} />
            </UnpositionedFlex>
          )}
        </SearchContainer>

        <Right>
          {collapseSearchBar && (
            <Flex row gap={-12} alignItems="center" mr={-15} ml={-12}>
              <SearchBar maxHeight={NAV_SEARCH_MAX_HEIGHT} fullScreen={isSmallScreen} />
              {userIsOperator && (
                <Flex mt={8}>
                  <PoolSelect operatedPools={operatedPools} />
                </Flex>
              )}
              {!hideChainSelector && <ChainSelector />}
            </Flex>
          )}
          {!collapseSearchBar && !hideChainSelector && <ChainSelector />}
          {isNFTPage && sellPageState !== ProfilePageStateType.LISTING && <Bag />}
          {shouldDisplayCreateAccountButton && isSignInExperimentControl && !isSignInExperimentControlLoading && isLandingPage && !isSmallScreen && (
            <NewUserCTAButton />
          )}
          {!isConnected && !isConnecting && <PreferenceMenu />}
          {isTestnetModeEnabled && <TestnetModeTooltip />}
          <Web3Status />
          {shouldDisplayCreateAccountButton && !isSignInExperimentControl && !isSignInExperimentControlLoading && !address && !isMediumScreen && (
            <NewUserCTAButton />
          )}
        </Right>
      </Flex>
    </Nav>
  )
}
