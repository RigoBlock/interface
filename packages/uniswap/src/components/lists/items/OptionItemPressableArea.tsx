import { type ModifierPressProps, TouchableArea } from '@universe/mycelium'
import { ReactNode } from 'react'

export interface OptionItemPressableAreaProps extends ModifierPressProps {
  onPress: () => void
  onLongPress?: () => void
  disabled?: boolean
  children: ReactNode
}

/** Tappable/long-pressable wrapper for an OptionItem row. */
export function OptionItemPressableArea({
  onPress,
  onLongPress,
  disabled,
  modifierPressHref,
  onModifierPress,
  children,
}: OptionItemPressableAreaProps): JSX.Element {
  return (
    <TouchableArea
      opacity={disabled ? 0.5 : 1}
      width="100%"
      px="$spacing12"
      modifierPressHref={modifierPressHref}
      onPress={onPress}
      onLongPress={onLongPress}
      onModifierPress={onModifierPress}
    >
      {children}
    </TouchableArea>
  )
}
