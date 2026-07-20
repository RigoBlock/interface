import { useEffect, useRef, useState } from 'react'
import { Trans } from 'react-i18next'
import { Flex, Text } from 'ui/src'
import { MoreHorizontal } from 'ui/src/components/icons/MoreHorizontal'
import { Portal } from '~/components/Popups/Portal'
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

/**
 * 3-dot dropdown menu with the available order actions for a GMX position.
 * The menu is portaled to the document body and anchored to the trigger, so it
 * overlays the table (and any transformed ancestors) instead of being clipped.
 */
export function GmxPositionActionsMenu({ onSelect }: { onSelect: (action: GmxOrderAction) => void }): JSX.Element {
  const [anchorRect, setAnchorRect] = useState<DOMRect | undefined>()
  const triggerRef = useRef<HTMLDivElement>(null)

  const open = anchorRect !== undefined

  useEffect(() => {
    if (!open) {
      return undefined
    }
    const close = () => setAnchorRect(undefined)
    const onClickOutside = (event: MouseEvent) => {
      if (triggerRef.current && !triggerRef.current.contains(event.target as Node)) {
        close()
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  return (
    <Flex
      cursor="pointer"
      padding="$spacing4"
      hoverStyle={{ opacity: 0.7 }}
      ref={triggerRef}
      onPress={(e) => {
        e.stopPropagation()
        if (open) {
          setAnchorRect(undefined)
        } else {
          setAnchorRect(triggerRef.current?.getBoundingClientRect())
        }
      }}
    >
      <MoreHorizontal size="$icon.20" color="$neutral2" />
      {anchorRect && (
        <Portal>
          <Flex
            backgroundColor="$surface1"
            borderRadius="$rounded12"
            borderWidth={1}
            borderColor="$surface3"
            padding="$spacing4"
            minWidth={190}
            style={{
              position: 'fixed',
              top: anchorRect.bottom + 4,
              right: window.innerWidth - anchorRect.right,
              zIndex: 1000,
            }}
          >
            {GMX_ORDER_ACTIONS.map(({ action, label }) => (
              <Flex
                key={action}
                paddingVertical="$spacing8"
                paddingHorizontal="$spacing12"
                borderRadius="$rounded8"
                cursor="pointer"
                hoverStyle={{ backgroundColor: '$surface2' }}
                onPress={(e) => {
                  e.stopPropagation()
                  setAnchorRect(undefined)
                  onSelect(action)
                }}
              >
                <Text variant="body3" color={action === GmxOrderAction.ClosePosition ? '$statusCritical' : '$neutral1'}>
                  {label}
                </Text>
              </Flex>
            ))}
          </Flex>
        </Portal>
      )}
    </Flex>
  )
}
