import { TokenProtectionWarning } from 'uniswap/src/features/tokens/warnings/types'

export const TOKEN_PROTECTION_FOT_HONEYPOT_BREAKPOINT = 100
export const TOKEN_PROTECTION_FOT_HIGH_FEE_BREAKPOINT = 80
export const TOKEN_PROTECTION_FOT_FEE_BREAKPOINT = 15

export function getFeeWarning(feePercent: number): TokenProtectionWarning {
  // WarningSeverity for styling. Same logic as getTokenWarningSeverity but without non-fee-related cases.
  // If fee >= 5% then HIGH, else 0% < fee < 5% then MEDIUM, else NONE
  let tokenProtectionWarning = TokenProtectionWarning.None
  if (feePercent >= TOKEN_PROTECTION_FOT_HONEYPOT_BREAKPOINT) {
    tokenProtectionWarning = TokenProtectionWarning.MaliciousHoneypot
  } else if (feePercent >= TOKEN_PROTECTION_FOT_HIGH_FEE_BREAKPOINT) {
    tokenProtectionWarning = TokenProtectionWarning.FotVeryHigh
  } else if (feePercent >= TOKEN_PROTECTION_FOT_FEE_BREAKPOINT) {
    tokenProtectionWarning = TokenProtectionWarning.FotHigh
  } else if (feePercent > 0) {
    tokenProtectionWarning = TokenProtectionWarning.FotLow
  }
  return tokenProtectionWarning
}
