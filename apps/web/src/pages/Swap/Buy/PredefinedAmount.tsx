import styled, { css } from 'lib/styled-components'
import { useSporeColors } from 'ui/src'
import { Pill, PillProps } from 'uniswap/src/components/pill/Pill'

interface PredefinedAmountProps {
  label: string
}

// TODO: check remove ClickablePill in slider
export const ClickablePill = styled(Pill)<{ $disabled: boolean; $active: boolean }>`
  background-color: ${({ $disabled, $active, theme }) =>
    $disabled ? theme.surface2 : $active ? theme.surface3 : theme.surface1};
  user-select: none;
  ${({ $disabled, $active }) =>
    !$disabled &&
    css`
      cursor: pointer;
      &:hover {
        background-color: ${({ theme }) => ($active ? theme.surface3Hovered : theme.surface1Hovered)};
        border-color: ${({ theme }) => theme.surface3Hovered};
      }
    `}
`

export function PredefinedAmount({ label, disabled, onPress }: PredefinedAmountProps & PillProps) {
  const colors = useSporeColors()

  return (
    <Pill
      backgroundColor={disabled ? '$surface2' : '$surface1'}
      userSelect="none"
      cursor={disabled ? 'default' : 'pointer'}
      disabled={disabled}
      onPress={onPress}
      hoverStyle={
        disabled
          ? {}
          : {
              backgroundColor: '$surface1Hovered',
              borderColor: '$surface3Hovered',
            }
      }
      customBorderColor={colors.surface3.val}
      foregroundColor={disabled ? colors.neutral3.val : colors.neutral2.val}
      label={label}
      px="$spacing16"
      textVariant="buttonLabel2"
    />
  )
}
