import { useTranslation } from 'react-i18next'
import { ArrowDown } from 'ui/src/components/icons/ArrowDown'
import { ArrowUp } from 'ui/src/components/icons/ArrowUp'
import { PenLine } from 'ui/src/components/icons/PenLine'
import { X } from 'ui/src/components/icons/X'
import { Flex, TouchableArea } from 'ui/src'
import { MoreHorizontal } from 'ui/src/components/icons/MoreHorizontal'
import { ContextMenu } from 'uniswap/src/components/menus/ContextMenu'
import { ContextMenuTriggerMode } from 'uniswap/src/components/menus/types'
import { ElementName } from 'uniswap/src/features/telemetry/constants'
import { useBooleanState } from 'utilities/src/react/useBooleanState'
import { GmxOrderAction } from '~/pages/Portfolio/Perps/gmx/useGmxOrderCallback'

const ICON_BUTTON_SIZE = 28

export function gmxOrderActionLabel(action: GmxOrderAction, t: (key: string) => string): string {
  switch (action) {
    case GmxOrderAction.IncreasePosition:
      return t('perps.actions.increase')
    case GmxOrderAction.DecreasePosition:
      return t('perps.actions.decrease')
    case GmxOrderAction.ClosePosition:
      return t('perps.actions.close')
    case GmxOrderAction.DeltaCollateral:
      return t('perps.actions.deltaCollateral')
    default:
      return ''
  }
}

interface GmxPositionActionsMenuProps {
  onSelect: (action: GmxOrderAction) => void
}

export function GmxPositionActionsMenu({ onSelect }: GmxPositionActionsMenuProps) {
  const { t } = useTranslation()
  const { value: isOpen, setTrue: openMenu, setFalse: closeMenu, toggle } = useBooleanState(false)

  const menuItems = [
    {
      label: t('perps.actions.increase'),
      onPress: () => onSelect(GmxOrderAction.IncreasePosition),
      Icon: ArrowUp,
    },
    {
      label: t('perps.actions.decrease'),
      onPress: () => onSelect(GmxOrderAction.DecreasePosition),
      Icon: ArrowDown,
    },
    {
      label: t('perps.actions.close'),
      onPress: () => onSelect(GmxOrderAction.ClosePosition),
      Icon: X,
    },
    {
      label: t('perps.actions.deltaCollateral'),
      onPress: () => onSelect(GmxOrderAction.DeltaCollateral),
      Icon: PenLine,
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
