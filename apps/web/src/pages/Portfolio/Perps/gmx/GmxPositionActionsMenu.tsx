import { useTranslation } from 'react-i18next'
import { ContextMenu } from 'uniswap/src/components/menus/ContextMenu'
import { MenuContent } from 'uniswap/src/components/menus/ContextMenuContent'
import { ContextMenuTriggerButton } from 'uniswap/src/components/menus/ContextMenuTriggerButton'
import { ContextMenuTriggerMode } from 'uniswap/src/components/menus/types'
import { useBooleanState } from 'utilities/src/react/useBooleanState'
import { GmxOrderAction } from '~/pages/Portfolio/Perps/gmx/useGmxOrderCallback'

/** Order actions with their display labels, shared by the menu and the order modal */
export const GMX_ORDER_ACTIONS: { action: GmxOrderAction; label: string }[] = [
  { action: GmxOrderAction.IncreasePosition, label: 'Increase' },
  { action: GmxOrderAction.DecreasePosition, label: 'Decrease' },
  { action: GmxOrderAction.ClosePosition, label: 'Close' },
  { action: GmxOrderAction.DeltaCollateral, label: 'Δ Collateral' },
]

export function gmxOrderActionLabel(action: GmxOrderAction): string {
  return GMX_ORDER_ACTIONS.find((entry) => entry.action === action)?.label ?? ''
}

/**
 * 3-dot dropdown menu with the available order actions for a GMX position.
 * Uses the same ContextMenu + ContextMenuTriggerButton components as the rest
 * of the portfolio so the interaction and styling are identical. The menu is
 * widened slightly so the action labels are always fully visible.
 */
export function GmxPositionActionsMenu({ onSelect }: { onSelect: (action: GmxOrderAction) => void }): JSX.Element {
  const { t } = useTranslation()
  const { value: isOpen, setTrue: openMenu, setFalse: closeMenu } = useBooleanState(false)

  const menuItems = [
    { label: t('perps.actions.increase'), onPress: () => onSelect(GmxOrderAction.IncreasePosition) },
    { label: t('perps.actions.decrease'), onPress: () => onSelect(GmxOrderAction.DecreasePosition) },
    { label: t('perps.actions.close'), onPress: () => onSelect(GmxOrderAction.ClosePosition) },
    { label: t('perps.actions.deltaCollateral'), onPress: () => onSelect(GmxOrderAction.DeltaCollateral) },
  ]

  return (
    <ContextMenu
      menuItems={menuItems}
      triggerMode={ContextMenuTriggerMode.Primary}
      isOpen={isOpen}
      openMenu={openMenu}
      closeMenu={closeMenu}
      isPlacementRight
      adaptToSheet={false}
      contentOverride={
        <MenuContent
          items={menuItems}
          handleCloseMenu={closeMenu}
          containerStyles={{ minWidth: 280, maxWidth: 400 }}
        />
      }
    >
      <ContextMenuTriggerButton />
    </ContextMenu>
  )
}
