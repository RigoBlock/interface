import { useMemo } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Flex, TouchableArea } from 'ui/src'
import { MoreHorizontal } from 'ui/src/components/icons/MoreHorizontal'
import { ContextMenu } from 'uniswap/src/components/menus/ContextMenu'
import { ContextMenuTriggerMode } from 'uniswap/src/components/menus/types'
import { useBooleanState } from 'utilities/src/react/useBooleanState'
import { GmxOrderAction } from '~/pages/Portfolio/Perps/gmx/useGmxOrderCallback'

/** Order actions with their display labels, shared by the menu and the order modal */
export const GMX_ORDER_ACTIONS: { action: GmxOrderAction; label: JSX.Element }[] = [
  { action: GmxOrderAction.IncreasePosition, label: <Trans>Increase position</Trans> },
  { action: GmxOrderAction.DecreasePosition, label: <Trans>Decrease position</Trans> },
  { action: GmxOrderAction.IncreaseCollateral, label: <Trans>Increase collateral</Trans> },
  { action: GmxOrderAction.DecreaseCollateral, label: <Trans>Decrease collateral</Trans> },
  { action: GmxOrderAction.ClosePosition, label: <Trans>Close position</Trans> },
]

export function gmxOrderActionLabel(action: GmxOrderAction): JSX.Element {
  return GMX_ORDER_ACTIONS.find((entry) => entry.action === action)?.label ?? <></>
}

const ICON_BUTTON_SIZE = 28

/**
 * 3-dot dropdown menu with the available order actions for a GMX position.
 * Built on the same ContextMenu used by the Pools table in portfolio Overview.
 */
export function GmxPositionActionsMenu({ onSelect }: { onSelect: (action: GmxOrderAction) => void }): JSX.Element {
  const { t } = useTranslation()
  const { value: isOpen, setTrue: openMenu, setFalse: closeMenu, toggle } = useBooleanState(false)

  const menuItems = useMemo(
    () => [
      { label: t('Increase position'), onPress: () => onSelect(GmxOrderAction.IncreasePosition) },
      { label: t('Decrease position'), onPress: () => onSelect(GmxOrderAction.DecreasePosition) },
      { label: t('Increase collateral'), onPress: () => onSelect(GmxOrderAction.IncreaseCollateral) },
      { label: t('Decrease collateral'), onPress: () => onSelect(GmxOrderAction.DecreaseCollateral) },
      {
        label: t('Close position'),
        onPress: () => onSelect(GmxOrderAction.ClosePosition),
        destructive: true,
      },
    ],
    [t, onSelect],
  )

  return (
    <ContextMenu
      trackItemClicks
      menuItems={menuItems}
      triggerMode={ContextMenuTriggerMode.Primary}
      isOpen={isOpen}
      openMenu={openMenu}
      closeMenu={closeMenu}
    >
      <TouchableArea
        onPress={(e) => {
          e.stopPropagation()
          e.preventDefault()
          toggle()
        }}
      >
        <Flex
          aria-label="View position options"
          centered
          height={ICON_BUTTON_SIZE}
          width={ICON_BUTTON_SIZE}
          borderRadius="$rounded12"
          hoverStyle={{ backgroundColor: '$surface3' }}
        >
          <MoreHorizontal size="$icon.16" color="$neutral2" />
        </Flex>
      </TouchableArea>
    </ContextMenu>
  )
}
