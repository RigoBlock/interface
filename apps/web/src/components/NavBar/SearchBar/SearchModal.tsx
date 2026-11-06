import { Flex } from '@universe/mycelium'
import { useMedia, useScrollbarStyles, useSporeColors } from '@universe/mycelium/theme-hooks-compat'
import { type ComponentRef, memo, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from 'uniswap/src/components/modals/Modal'
import { useUpdateScrollLock } from 'uniswap/src/components/modals/ScrollLock'
import { NetworkFilter } from 'uniswap/src/components/network/NetworkFilter/NetworkFilter'
import { useEnabledChains } from 'uniswap/src/features/chains/hooks/useEnabledChains'
import { useFilterCallbacks } from 'uniswap/src/features/search/SearchModal/hooks/useFilterCallbacks'
import { SmartPoolsSearchList } from '~/components/NavBar/SearchBar/SmartPoolsSearchList'
import { SearchTextInput } from 'uniswap/src/features/search/SearchTextInput'
import { InterfaceEventName, ModalName, SectionName } from 'uniswap/src/features/telemetry/constants'
import { sendAnalyticsEvent } from 'uniswap/src/features/telemetry/send'
import { useTrace } from 'utilities/src/telemetry/trace/TraceContext'
import { useDebounce } from 'utilities/src/time/timing'
import { useModalState } from '~/hooks/useModalState'

const SEARCH_MODAL_WIDTH = {
  default: 640,
  small: 540,
}

export const SearchModal = memo(function SearchModalInner({
  isAuctionSearchEnabled: _isAuctionSearchEnabled,
}: {
  isAuctionSearchEnabled: boolean
}): JSX.Element {
  const { t } = useTranslation()
  const colors = useSporeColors()
  const media = useMedia()
  const scrollbarStyles = useScrollbarStyles()

  const { isOpen: isModalOpen, toggleModal: toggleSearchModal } = useModalState(ModalName.Search)

  // Use ref for programmatic focus instead of autoFocus prop
  // autoFocus doesn't work reliably on first modal open in production
  const searchInputRef = useRef<ComponentRef<typeof SearchTextInput>>(null)

  useEffect(() => {
    if (isModalOpen) {
      // Small delay to ensure modal animation/focus trap is ready
      const timeoutId = setTimeout(() => {
        searchInputRef.current?.focus()
      }, 50)
      return () => clearTimeout(timeoutId)
    }
    return undefined
  }, [isModalOpen])

  const { onChangeChainFilter, onChangeText, searchFilter, chainFilter } = useFilterCallbacks(null, ModalName.Search)

  const debouncedSearchFilter = useDebounce(searchFilter)

  const trace = useTrace({ section: SectionName.NavbarSearch })
  const closeSearch = useCallback(
    (resultSelected: boolean) => {
      toggleSearchModal()
      sendAnalyticsEvent(InterfaceEventName.NavbarSearchExited, {
        navbar_search_input_text: debouncedSearchFilter ?? '',
        hasInput: Boolean(debouncedSearchFilter),
        result_selected: resultSelected,
        // RigoBlock fork: upstream counted rendered result rows; the smart-pool list does not
        // report a count — report the pool count as 0 (analytics-only field).
        results_shown: 0,
        ...trace,
      })
    },
    [toggleSearchModal, debouncedSearchFilter, trace],
  )
  const onClose = useCallback(() => closeSearch(false), [closeSearch])

  const onSelect = useCallback(() => {
    // web handles select differently than wallet as we want to clear search input on selection
    onChangeText('')
    closeSearch(true)
  }, [onChangeText, closeSearch])

  const { chains: enabledChains } = useEnabledChains()

  const searchModalWidth = media.xxl ? SEARCH_MODAL_WIDTH.small : SEARCH_MODAL_WIDTH.default

  // Tamagui's lock doesn't block ArrowUp/Down key scrolling, so we lock scroll ourselves and disable
  // Tamagui's own lock below (disableRemoveScroll) to avoid a stray scrollbar-gutter reservation.
  useUpdateScrollLock({ isModalOpen })

  return (
    <Modal
      fullScreen
      hideKeyboardOnDismiss
      hideKeyboardOnSwipeDown
      renderBehindBottomInset
      disableRemoveScroll
      backgroundColor={colors.surface1.val}
      isModalOpen={isModalOpen}
      maxWidth={searchModalWidth}
      maxHeight={520}
      name={ModalName.Search}
      padding="$none"
      height="100vh"
      onClose={onClose}
      analyticsProperties={{
        // RigoBlock fork: upstream's search tabs are hidden (smart-pool search only).
        search_tab: 'smart_pools',
      }}
      // Use percent mode to avoid Tamagui bug where 'fit' snapped
      // modals may incorrectly resize on their own when keyboard is visible
      snapPointsMode="percent"
      snapPoints={[85]}
    >
      <Flex grow style={scrollbarStyles}>
        <Flex
          $sm={{ px: '$spacing16', py: '$spacing4', borderColor: undefined, borderBottomWidth: 0 }}
          px="$spacing4"
          py="$spacing20"
          borderBottomColor="$surface3"
          borderBottomWidth={1}
        >
          <SearchTextInput
            ref={searchInputRef}
            minHeight={media.sm ? undefined : 24}
            backgroundColor={media.sm ? '$surface2' : '$transparent'}
            borderColor={!media.sm ? '$transparent' : undefined}
            borderWidth={!media.sm ? '$none' : undefined}
            py="$none"
            endAdornment={
              <Flex row alignItems="center">
                <NetworkFilter
                  includeAllNetworks
                  chainIds={enabledChains}
                  selectedChain={chainFilter}
                  onPressChain={onChangeChainFilter}
                />
              </Flex>
            }
            // The long placeholder hard-clips in the narrow $sm input, so fall back to the short header copy there
            placeholder={media.sm ? t('search.input.placeholder.header') : t('search.input.placeholder.modal')}
            px="$spacing16"
            value={searchFilter ?? ''}
            onChangeText={onChangeText}
            onKeyPress={(e) => {
              if (['Enter', 'ArrowUp', 'ArrowDown'].includes(e.nativeEvent.key)) {
                // default behaviors we don't want:
                // - 'enter' key action blurs the input field
                // - 'arrow up/down' key action moves text cursor to the start/end of the input
                e.preventDefault()
              }
            }}
          />
        </Flex>
        {/* RigoBlock fork: upstream's token search tabs + token/pool results are hidden —
            they navigate to /explore/* which is gated off in the fork. The search searches
            RigoBlock smart pools instead (both empty state and typed queries). */}
        <Flex grow>
          <SmartPoolsSearchList chainFilter={chainFilter} query={debouncedSearchFilter ?? ''} onSelect={onSelect} />
        </Flex>
      </Flex>
    </Modal>
  )
})
