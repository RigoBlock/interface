import { RowBetween } from 'components/deprecated/Row'
import styled from 'lib/styled-components'
import { darken } from 'polished'
import { ChevronDown } from 'react-feather'
import { ButtonProps as ButtonPropsOriginal, Button as RebassButton } from 'rebass/styled-components'
import { Flex } from 'ui/src'

export { default as LoadingButtonSpinner } from './LoadingButtonSpinner'

type ButtonProps = Omit<ButtonPropsOriginal, 'css'>

type BaseButtonProps = {
  padding?: string
  width?: string
  $borderRadius?: string
  altDisabledStyle?: boolean
} & ButtonProps

export const BaseButton = styled(RebassButton)<BaseButtonProps>`
  padding: ${({ padding }) => padding ?? '16px'};
  width: ${({ width }) => width ?? '100%'};
  line-height: 24px;
  font-weight: 535;
  text-align: center;
  border-radius: ${({ $borderRadius }) => $borderRadius ?? '16px'};
  outline: none;
  border: 1px solid transparent;
  color: ${({ theme }) => theme.neutral1};
  text-decoration: none;
  display: flex;
  justify-content: center;
  flex-wrap: nowrap;
  align-items: center;
  cursor: pointer;
  position: relative;
  z-index: 1;
  &:disabled {
    opacity: 50%;
    cursor: auto;
    pointer-events: none;
  }

  will-change: transform;
  transition: transform 450ms ease;
  transform: perspective(1px) translateZ(0);

  > * {
    user-select: none;
  }

  > a {
    text-decoration: none;
  }
`

export const ButtonPrimary = styled(BaseButton)`
  background-color: ${({ theme }) => theme.accent1};
  font-size: 20px;
  font-weight: 535;
  padding: 16px;
  color: ${({ theme }) => theme.neutralContrast};
  &:focus {
    box-shadow: 0 0 0 1pt ${({ theme }) => darken(0.05, theme.accent1)};
    background-color: ${({ theme }) => darken(0.05, theme.accent1)};
  }
  &:hover {
    background-color: ${({ theme }) => darken(0.05, theme.accent1)};
  }
  &:active {
    box-shadow: 0 0 0 1pt ${({ theme }) => darken(0.1, theme.accent1)};
    background-color: ${({ theme }) => darken(0.1, theme.accent1)};
  }
  &:disabled {
    background-color: ${({ theme, altDisabledStyle, disabled }) =>
      altDisabledStyle ? (disabled ? theme.accent1 : theme.surface3) : theme.surface3};
    color: ${({ altDisabledStyle, disabled, theme }) =>
      altDisabledStyle ? (disabled ? theme.neutralContrast : theme.neutral2) : theme.neutral2};
    cursor: auto;
    box-shadow: none;
    border: 1px solid transparent;
    outline: none;
  }
`

export const SmallButtonPrimary = styled(ButtonPrimary)`
  width: auto;
  font-size: 16px;
  padding: ${({ padding }) => padding ?? '8px 12px'};

  border-radius: 12px;
`

export const ButtonGray = styled(BaseButton)`
  background-color: ${({ theme }) => theme.surface1};
  color: ${({ theme }) => theme.neutral2};
  border: 1px solid ${({ theme }) => theme.surface3};
  font-size: 16px;
  font-weight: 535;

  &:hover {
    background-color: ${({ theme, disabled }) => !disabled && darken(0.05, theme.surface2)};
  }
  &:active {
    background-color: ${({ theme, disabled }) => !disabled && darken(0.1, theme.surface2)};
  }
`

export const ButtonSecondary = styled(BaseButton)`
  border: 1px solid ${({ theme }) => theme.accent2};
  color: ${({ theme }) => theme.accent1};
  background-color: transparent;
  font-size: 16px;
  border-radius: 12px;
  padding: ${({ padding }) => (padding ? padding : '10px')};

  &:focus {
    box-shadow: 0 0 0 1pt ${({ theme }) => theme.accent2};
    border: 1px solid ${({ theme }) => theme.accent1};
  }
  &:hover {
    border: 1px solid ${({ theme }) => theme.accent1};
  }
  &:active {
    box-shadow: 0 0 0 1pt ${({ theme }) => theme.accent2};
    border: 1px solid ${({ theme }) => theme.accent1};
  }
  &:disabled {
    opacity: 50%;
    cursor: auto;
  }
  a:hover {
    text-decoration: none;
  }
`

export const ButtonOutlined = styled(BaseButton)`
  border: 1px solid ${({ theme }) => theme.surface3};
  background-color: transparent;
  color: ${({ theme }) => theme.neutral1};
  &:focus {
    box-shadow: 0 0 0 1px ${({ theme }) => theme.surface3};
  }
  &:hover {
    box-shadow: 0 0 0 1px ${({ theme }) => theme.neutral3};
  }
  &:active {
    box-shadow: 0 0 0 1px ${({ theme }) => theme.surface3};
  }
  &:disabled {
    opacity: 50%;
    cursor: auto;
  }
`

export const ButtonEmpty = styled(BaseButton)`
  background-color: transparent;
  color: ${({ theme }) => theme.accent1};
  display: flex;
  justify-content: center;
  align-items: center;

  &:focus {
    text-decoration: underline;
  }
  &:hover {
    text-decoration: none;
  }
  &:active {
    text-decoration: none;
  }
  &:disabled {
    opacity: 50%;
    cursor: auto;
  }
`

export const ButtonText = styled(BaseButton)`
  padding: 0;
  width: fit-content;
  background: none;
  text-decoration: none;
  &:focus {
    text-decoration: underline;
  }
  &:hover {
    opacity: 0.9;
  }
  &:active {
    text-decoration: underline;
  }
  &:disabled {
    opacity: 50%;
    cursor: auto;
  }
`

const ButtonConfirmedStyle = styled(BaseButton)`
  background-color: ${({ theme }) => theme.surface2};
  color: ${({ theme }) => theme.neutral1};
  /* border: 1px solid ${({ theme }) => theme.success}; */

  &:disabled {
    opacity: 50%;
    background-color: ${({ theme }) => theme.surface3};
    color: ${({ theme }) => theme.neutral2};
    cursor: auto;
  }
`

const ButtonErrorStyle = styled(BaseButton)`
  background-color: ${({ theme }) => theme.critical};
  border: 1px solid ${({ theme }) => theme.critical};

  &:focus {
    box-shadow: 0 0 0 1pt ${({ theme }) => darken(0.05, theme.critical)};
    background-color: ${({ theme }) => darken(0.05, theme.critical)};
  }
  &:hover {
    background-color: ${({ theme }) => darken(0.05, theme.critical)};
  }
  &:active {
    box-shadow: 0 0 0 1pt ${({ theme }) => darken(0.1, theme.critical)};
    background-color: ${({ theme }) => darken(0.1, theme.critical)};
  }
  &:disabled {
    opacity: 50%;
    cursor: auto;
    box-shadow: none;
    background-color: ${({ theme }) => theme.critical};
    border: 1px solid ${({ theme }) => theme.critical};
  }
`

export function ButtonConfirmed({
  confirmed,
  altDisabledStyle,
  ...rest
}: { confirmed?: boolean; altDisabledStyle?: boolean } & ButtonProps) {
  if (confirmed) {
    return <ButtonConfirmedStyle {...rest} />
  } else {
    return <ButtonPrimary {...rest} altDisabledStyle={altDisabledStyle} />
  }
}

export function ButtonError({ error, ...rest }: { error?: boolean } & BaseButtonProps) {
  if (error) {
    return <ButtonErrorStyle {...rest} />
  } else {
    return <ButtonPrimary {...rest} />
  }
}

export function ButtonDropdownLight({ disabled = false, children, ...rest }: { disabled?: boolean } & ButtonProps) {
  return (
    <ButtonOutlined {...rest} disabled={disabled}>
      <RowBetween>
        <Flex style={{ display: 'flex', alignItems: 'center' }}>{children}</Flex>
        <ChevronDown size={24} />
      </RowBetween>
    </ButtonOutlined>
  )
}

export enum ButtonSize {
  small = 0,
  medium = 1,
  large = 2,
}
export enum ButtonEmphasis {
  high = 0,
  promotional = 1,
  highSoft = 2,
  medium = 3,
  low = 4,
  warning = 5,
  destructive = 6,
  failure = 7,
}
