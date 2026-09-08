import { useTranslation } from 'react-i18next'
import { ArrowDown } from 'ui/src/components/icons/ArrowDown'
import { ArrowUp } from 'ui/src/components/icons/ArrowUp'
import { X } from 'ui/src/components/icons/X'
import { Flex, TouchableArea } from 'ui/src'
import { MoreHorizontal } from 'ui/src/components/icons/MoreHorizontal'
import { ContextMenu } from 'uniswap/src/components/menus/ContextMenu'
import { ContextMenuTriggerMode } from 'uniswap/src/components/menus/types'
import { ElementName } from 'uniswap/src/features/telemetry/constants'
import { useBooleanState } from 'utilities/src/react/useBooleanState'
import { HyperliquidOrderAction } from '~/pages/Portfolio/Perps/hyperliquid/useHyperliquidOrderCallback'

const ICON_BUTTON_SIZE = 28

interface HyperliquidPositionActionsMenuProps {
  onSelect: (action: HyperliquidOrderAction) => void
}

export function HyperliquidPositionActionsMenu({ onSelect }: HyperliquidPositionActionsMenuProps) {
  const { t } = useTranslation()
  const { value: isOpen, setTrue: openMenu, setFalse: closeMenu, toggle } = useBooleanState(false)

  const menuItems = [
    {
      label: t('perps.actions.increase'),
      onPress: () => onSelect('increase'),
      Icon: ArrowUp,
    },
    {
      label: t('perps.actions.decrease'),
      onPress: () => onSelect('decrease'),
      Icon: ArrowDown,
    },
    {
      label: t('perps.actions.close'),
      onPress: () => onSelect('close'),
      Icon: X,
    },
  ]

  return (
    <ContextMenu
      trackItemClicks
      menuItems={menuItems}
      triggerMode={ContextMenuTriggerMode.Primary}
      isOpen={isOpen}
      openMenu={openMenu}
      closeMenu={closeMenu}
      elementName={ElementName.PortfolioPerpsTab}
    >
      {/* oxlint-disable-next-line react/forbid-elements -- onContextMenu is required to support right-click opening the menu */}
      <div style={{ cursor: 'pointer' }} onContextMenu={toggle}>
        <TouchableArea
          onPressIn={(e) => e.stopPropagation()}
          onPressOut={(e) => e.stopPropagation()}
          onPress={(e) => {
            e.stopPropagation()
            e.preventDefault()
            toggle()
          }}
        >
          <Flex
            aria-label="View position options"
            opacity={1}
            transition="opacity 0.2s ease"
            centered
            $group-hover={{ opacity: 1 }}
            $group-focus={{ opacity: 1 }}
            mr="$spacing8"
            ml="$spacing4"
          >
            <Flex
              height={ICON_BUTTON_SIZE}
              width={ICON_BUTTON_SIZE}
              borderRadius="$rounded12"
              hoverStyle={{ backgroundColor: '$surface3' }}
              centered
              animateOnly={['opacity', 'transform']}
            >
              <MoreHorizontal size="$icon.16" color="$neutral2" />
            </Flex>
          </Flex>
        </TouchableArea>
      </div>
    </ContextMenu>
  )
}
