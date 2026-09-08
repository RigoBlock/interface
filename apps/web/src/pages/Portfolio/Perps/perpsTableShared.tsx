/**
 * Shared table scaffolding for the Perps tab sections (GMX + Hyperliquid):
 * fixed column widths, header/data cell components, and USD/price formatting.
 * Extracted from Perps.tsx so both sections render identically aligned tables.
 */
import { Flex, Text } from 'ui/src'

const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

export function formatUsd(value: number): string {
  return usdFormatter.format(value)
}

export function formatSignedUsd(value: number): string {
  const formatted = formatUsd(Math.abs(value))
  if (value > 0) {
    return `+${formatted}`
  }
  return value < 0 ? `-${formatted}` : formatted
}

export function formatPrice(value?: number): string {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return '—'
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(value)
}

export type PnlColor = '$neutral1' | '$statusSuccess' | '$statusCritical'

export function pnlColor(value: number): PnlColor {
  if (value > 0) {
    return '$statusSuccess'
  }
  return value < 0 ? '$statusCritical' : '$neutral1'
}

// Shared fixed column widths so header and data cells always stay aligned
export const COLUMN = {
  market: { width: 180 },
  side: { width: 64 },
  size: { width: 100 },
  netValue: { width: 100 },
  leverage: { width: 72 },
  entry: { width: 100 },
  mark: { width: 100 },
  liq: { width: 100 },
  pnl: { width: 140 },
  actions: { width: 72 },
} as const

export const TABLE_MIN_WIDTH = 1120

/** Caps each section's table height so a long position list can't push the other section off-screen */
export const TABLE_MAX_HEIGHT = 420

export function TableScrollContainer({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <Flex width="100%" maxHeight={TABLE_MAX_HEIGHT} style={{ overflowX: 'auto', overflowY: 'auto' }}>
      {children}
    </Flex>
  )
}

export function HeaderCell({ label, alignLeft }: { label: React.ReactNode; alignLeft?: boolean }): JSX.Element {
  return (
    <Text variant="body4" color="$neutral2" textAlign={alignLeft ? 'left' : 'right'} numberOfLines={1}>
      {label}
    </Text>
  )
}

export function CellText({ children, color = '$neutral1' }: { children: React.ReactNode; color?: PnlColor }): JSX.Element {
  return (
    <Text variant="body3" color={color} textAlign="right" numberOfLines={1}>
      {children}
    </Text>
  )
}
