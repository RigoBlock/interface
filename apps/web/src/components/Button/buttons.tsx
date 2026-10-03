import type { CSSProperties, MouseEvent, ReactNode } from 'react'
import { Button } from 'ui/src'

export { default as LoadingButtonSpinner } from './LoadingButtonSpinner'

/**
 * Legacy button family for the RigoBlock governance/earn pages, implemented as
 * thin adapters over the shared `Button` from `ui/src` — the same component
 * the rest of the app uses — so RigoBlock gold (`branded` = `$accent1`) and
 * dark-mode theming come from the theme for free. Only the variants still
 * consumed by legacy pages are exported; prefer `Button` from `ui/src`
 * directly in new code.
 */

export type LegacyButtonProps = {
  children?: ReactNode
  className?: string
  id?: string
  style?: CSSProperties
  onClick?: (event: MouseEvent<HTMLElement>) => void
  disabled?: boolean
  /** Legacy: a disabled button that keeps the enabled (accent) look. */
  altDisabledStyle?: boolean
  /** Legacy layout props, folded into `style`. */
  padding?: string
  width?: string
  $borderRadius?: string
}

function adaptButtonProps({
  padding,
  width,
  $borderRadius,
  altDisabledStyle,
  style,
  onClick,
  disabled,
  ...rest
}: LegacyButtonProps) {
  // altDisabledStyle: legacy "looks enabled but doesn't react" — detach interaction, keep styling.
  const passive = Boolean(altDisabledStyle && disabled)
  return {
    ...rest,
    onClick: passive ? undefined : onClick,
    disabled: passive ? false : disabled,
    style: {
      ...(padding !== undefined ? { padding } : null),
      ...(width !== undefined ? { width } : null),
      ...($borderRadius !== undefined ? { borderRadius: $borderRadius } : null),
      ...style,
    },
  }
}

export function ButtonPrimary(props: LegacyButtonProps) {
  return <Button variant="branded" size="large" {...adaptButtonProps(props)} />
}

export function ButtonError({ error, ...rest }: { error?: boolean } & LegacyButtonProps) {
  if (error) {
    return <Button variant="critical" size="large" {...adaptButtonProps(rest)} />
  }
  return <ButtonPrimary {...rest} />
}

export function ButtonConfirmed({ confirmed, ...rest }: { confirmed?: boolean } & LegacyButtonProps) {
  if (confirmed) {
    return <Button variant="default" emphasis="secondary" size="large" {...adaptButtonProps(rest)} />
  }
  return <ButtonPrimary {...rest} />
}
