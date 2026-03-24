import { useCallback, useState } from 'react'
import { AdaptiveWebPopoverContent, Flex, Popover, TouchableArea, useMedia, useScrollbarStyles } from 'ui/src'
import { RotatableChevron } from 'ui/src/components/icons/RotatableChevron'
import { iconSizes, zIndexes } from 'ui/src/theme'
import { NetworkLogo } from 'uniswap/src/components/CurrencyLogo/NetworkLogo'
import {
  NetworkFilterContent,
  NetworkSearchBar,
} from 'uniswap/src/components/network/NetworkFilterV2/NetworkFilterContent'
import type { NetworkFilterV2Props } from 'uniswap/src/components/network/NetworkFilterV2/NetworkFilterV2'
import { useEnabledChains } from 'uniswap/src/features/chains/hooks/useEnabledChains'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { TestID } from 'uniswap/src/test/fixtures/testIDs'
import { isWebApp } from 'utilities/src/platform'
import { useEvent } from 'utilities/src/react/hooks'

const NETWORK_ICON_SIZE = iconSizes.icon20
const DESKTOP_DROPDOWN_MAX_HEIGHT = 320
const MOBILE_DROPDOWN_MAX_HEIGHT = '50vh'
const DROPDOWN_MIN_WIDTH = 240

export function NetworkFilterV2({
  chainIds,
  selectedChain,
  onPressChain,
  includeAllNetworks,
  tieredOptions,
}: NetworkFilterV2Props): JSX.Element {
  const { defaultChainId } = useEnabledChains()
  const [isOpen, setIsOpen] = useState(false)
  const media = useMedia()
  const scrollbarStyles = useScrollbarStyles()
  const isMobileSheet = isWebApp && media.sm
  const dropdownMaxHeight = isMobileSheet ? MOBILE_DROPDOWN_MAX_HEIGHT : DESKTOP_DROPDOWN_MAX_HEIGHT

  const handlePressChain = useCallback(
    (chainId: UniverseChainId | null) => {
      onPressChain(chainId)
      setIsOpen(false)
    },
    [onPressChain],
  )

  const handleToggleOpen = useEvent(() => {
    setIsOpen((prev) => !prev)
  })

  return (
    <Popover open={isOpen} placement="bottom-end" onOpenChange={setIsOpen}>
      <Popover.Trigger>
        <TouchableArea testID={TestID.TokensNetworkFilterTrigger} onPress={handleToggleOpen}>
          <Flex row alignItems="center" gap="$spacing4">
            <NetworkLogo
              chainId={selectedChain ?? (includeAllNetworks ? null : defaultChainId)}
              size={NETWORK_ICON_SIZE}
            />
            <RotatableChevron
              animation="100ms"
              animateOnly={['transform', 'opacity']}
              color="$neutral2"
              direction={isOpen ? 'up' : 'down'}
              size="$icon.20"
            />
          </Flex>
        </TouchableArea>
      </Popover.Trigger>

      <AdaptiveWebPopoverContent
        backgroundColor="$surface1"
        borderColor="$surface3"
        borderRadius="$rounded12"
        borderWidth={0.5}
        zIndex={zIndexes.popover}
        isOpen={isOpen}
        placement="bottom-end"
        px="$spacing4"
        pb="$spacing2"
        webBottomSheetProps={{ onClose: () => setIsOpen(false) }}
      >
        <Flex minWidth={DROPDOWN_MIN_WIDTH}>
          <NetworkSearchBar />
          <Flex
            maxHeight={dropdownMaxHeight}
            pr="$none"
            style={{ ...scrollbarStyles, scrollbarWidth: 'auto', overflow: 'auto' }}
          >
            <NetworkFilterContent
              chainIds={chainIds}
              includeAllNetworks={includeAllNetworks}
              selectedChain={selectedChain}
              tieredOptions={tieredOptions}
              onPressChain={handlePressChain}
            />
          </Flex>
        </Flex>
      </AdaptiveWebPopoverContent>
    </Popover>
  )
}
