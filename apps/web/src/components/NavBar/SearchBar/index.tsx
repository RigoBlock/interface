import { InterfaceElementName, InterfaceEventName, InterfaceSectionName } from '@uniswap/analytics-events'
import { FeatureFlags, useFeatureFlag } from '@universe/gating'
import { Token } from '@uniswap/sdk-core'
import { NavIcon } from 'components/NavBar/NavIcon'
import { SearchModal } from 'components/NavBar/SearchBar/SearchModal'
import Row from 'components/deprecated/Row'
import { useIsSearchBarVisible } from 'components/NavBar/SearchBar/useIsSearchBarVisible'
import { useModalState } from 'hooks/useModalState'
import { styled } from 'lib/styled-components'
import { getTokenFilter } from 'lib/hooks/useTokenList/filtering'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'react-feather'
import { useTranslation } from 'react-i18next'
import { Flex, Text, TouchableArea, useSporeColors } from 'ui/src'
import { ElementName, InterfaceEventName, ModalName, SectionName } from 'uniswap/src/features/telemetry/constants'
import { useLocation } from 'react-router-dom'
import { PoolRegisteredLog } from 'state/pool/hooks'
import { Z_INDEX } from 'theme/zIndex'
import { Input, useMedia } from 'ui/src'
import { CloseIconWithHover } from 'ui/src/components/icons/CloseIconWithHover'
import Trace from 'uniswap/src/features/telemetry/Trace'
import { KeyAction } from 'utilities/src/device/keyboard/types'
import { useKeyDown } from 'utilities/src/device/keyboard/useKeyDown'
import { useTrace } from 'utilities/src/telemetry/trace/TraceContext'
import { useAccount } from 'wagmi'

const NAV_SEARCH_MIN_WIDTH = '340px'

const KeyShortcut = styled.div`
  background-color: ${({ theme }) => theme.surface3};
  color: ${({ theme }) => theme.neutral2};
  padding: 0px 8px;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 535;
  line-height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.6;
  backdrop-filter: blur(60px);
`

const SearchIcon = styled.div`
  width: 20px;
  height: 20px;
`

export const SearchBar = ({ allPools } : { allPools?: PoolRegisteredLog[] }) => {
  const poolSearchEnabled = useFeatureFlag(FeatureFlags.PoolSearch)
  const isNavSearchInputVisible = useIsSearchBarVisible()

  const colors = useSporeColors()
  const [isOpen, setOpen] = useState<boolean>(false)
  const [searchValue, setSearchValue] = useState<string>('')
  const debouncedSearchValue = useDebounce(searchValue, 300)
  const searchRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<any>(null)
  const { pathname } = useLocation()
  const media = useMedia()
  const isNavSearchInputVisible = !media.xl
  const theme = useTheme()
  const { t } = useTranslation() // subscribe to locale changes

  const {
    isOpen: isModalOpen,
    closeModal: closeSearchModal,
    openModal: openSearchModal,
  } = useModalState(ModalName.Search)

  useKeyDown({
    callback: openSearchModal,
    keys: ['/'],
    disabled: isModalOpen,
    preventDefault: !isModalOpen,
    keyAction: KeyAction.UP,
    shouldTriggerInInput: false,
  })
  useKeyDown({
    callback: closeSearchModal,
    keys: ['Escape'],
    keyAction: KeyAction.UP,
    disabled: !isModalOpen,
    preventDefault: true,
    shouldTriggerInInput: true,
  })

  const trace = useTrace({ section: SectionName.NavbarSearch })

  const smartPools = useMemo(() => {
    //const mockToken = new Token(1, ZERO_ADDRESS, 0, '', '')
    //if (!uniquePools || !account.chainId) {
    //  return [mockToken]
    //}
    // TODO: smart vaults can have decimals != 18, but we probably do not use decimals from here
    return allPools?.map((p) => {
      const { name, symbol, pool: address } = p
      //if (!name || !symbol || !address) return
      return new Token(account.chainId ?? UniverseChainId.Mainnet, address ?? undefined, 18, symbol ?? 'NAN', name ?? '')
    })
  }, [account.chainId, allPools])

  // TODO: check if we can remove getTokenFilter module
  const filteredPools = useMemo(() => {
    return Object.values(smartPools ?? []).filter(getTokenFilter(debouncedSearchValue))
  }, [smartPools, debouncedSearchValue])
  const chain: GqlChainId | undefined = account.chainId ? toGraphQLChain(account.chainId) : undefined
  // TODO: check using a different struct for pools
  const searchPools: GqlSearchToken[] | undefined = useMemo(() => {
    if (!chain) {
      return undefined
    }
    return filteredPools.map((p) => {
      const { name, symbol, address } = p
      return {
        id: '',
        name: name ?? '',
        address,
        symbol: symbol ?? '',
        decimals: 0,
        chain: chain ?? UniverseChainId.Mainnet,
        project: {
          logoUrl: '',
          id: '',
          safetyLevel: undefined,
        },
        market: {
          id: '',
          price: { id: '', value: 0, currency: undefined },
          pricePercentChange: { id: '', value: 0 },
          volume24H: { id: '', value: 0, currency: undefined },
        },
      }
    })
  }, [chain, filteredPools])

  const reducedPools = searchPools?.slice(0, 8) ?? []

  // clear searchbar when changing pages
  useEffect(() => {
    setSearchValue('')
  }, [pathname])
  const placeholderText = poolSearchEnabled ? t('search.input.placeholder') : t('tokens.selector.search.placeholder')

  // auto set cursor when searchbar is opened
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus()
    }
  }, [isOpen])

  const trace = useTrace({ section: InterfaceSectionName.NAVBAR_SEARCH })

  const navbarSearchEventProperties = {
    navbar_search_input_text: debouncedSearchValue,
    hasInput: debouncedSearchValue.length > 0,
    ...trace,
  }

  const placeholderText = t('smartPools.selector.search.placeholder')

  const onSelectCurrency = useCallback(() => {}, [])

  if (searchRevampEnabled) {
    return (
      <Trace section={InterfaceSectionName.NAVBAR_SEARCH}>
        {isOpen && (
          <SearchModal
            isModalOpen={isOpen}
            flow={TokenSelectorFlow.Swap}
            chainId={UniverseChainId.Mainnet}
            chainIds={[UniverseChainId.Mainnet]}
            onClose={() => {
              toggleOpen()
              sendAnalyticsEvent(InterfaceEventName.NAVBAR_SEARCH_EXITED, navbarSearchEventProperties)
            }}
            onSelectCurrency={onSelectCurrency}
            onSelectChain={() => {}}
          />
        )}
        {isNavSearchInputVisible ? (
          <SearchInput $isOpen={isOpen} $fullScreen={fullScreen} data-testid="nav-search-input">
            <SearchIcon data-cy="nav-search-icon">
              <Search width="20px" height="20px" color={theme.neutral2} />
            </SearchIcon>
            <Trace
              logFocus
              eventOnTrigger={InterfaceEventName.NAVBAR_SEARCH_SELECTED}
              element={InterfaceElementName.NAVBAR_SEARCH_INPUT}
              properties={{ ...trace }}
            >
              <Input
                ref={inputRef}
                width="100%"
                height="100%"
                fontWeight="$book"
                backgroundColor="$transparent"
                placeholder={placeholderText}
                placeholderTextColor={theme.neutral2}
                onFocus={() => !isOpen && toggleOpen()}
              />
            </Trace>
            <KeyShortcut>/</KeyShortcut>
          </SearchInput>
        ) : (
          <NavIcon onClick={toggleOpen} label={placeholderText}>
            <SearchIcon data-cy="nav-search-icon">
              <Search width="20px" height="20px" color={theme.neutral2} />
            </SearchIcon>
          </NavIcon>
        )}
      </Trace>
    )
  }

  return (
    <Trace section={SectionName.NavbarSearch}>
      <SearchModal />
      {isNavSearchInputVisible ? (
        <TouchableArea onPress={openSearchModal} data-testid="nav-search-input" width={NAV_SEARCH_MIN_WIDTH}>
          <Flex
            row
            backgroundColor="$surface2"
            borderWidth={1}
            borderColor="$surface3"
            py="$spacing8"
            px="$spacing16"
            borderRadius="$rounded20"
            height={40}
            alignItems="center"
            justifyContent="space-between"
            hoverStyle={{
              backgroundColor: '$surface1Hovered',
            }}
          >
            <Flex row gap="$spacing12">
              <SearchIcon data-cy="nav-search-icon">
                <Search width="20px" height="20px" color={colors.neutral2.val} />
              </SearchIcon>
              <Trace
                logFocus
                eventOnTrigger={InterfaceEventName.NavbarSearchSelected}
                element={ElementName.NavbarSearchInput}
                properties={{ ...trace }}
              >
                <Text fontWeight="$book" color="$neutral2" textAlign="left">
                  {placeholderText}
                </Text>
              </Trace>
            </Flex>
            <KeyShortcut>/</KeyShortcut>
          </Flex>
        </TouchableArea>
      ) : (
        <NavIcon onClick={openSearchModal} label={placeholderText}>
          <SearchIcon data-cy="nav-search-icon">
            <Search width="20px" height="20px" color={colors.neutral2.val} />
          </SearchIcon>
        </NavIcon>
      )}
    </Trace>
  )
}
