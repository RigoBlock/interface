/* oxlint-disable eslint-js/no-restricted-syntax -- wrapper for the connected wallet account on portfolio pages */
import { useAccount } from '~/hooks/useAccount'

/**
 * Returns the connected wallet account for actions initiated from the portfolio page
 * (transaction signing, operator checks, connected-chain checks). These must always
 * originate from the wallet, so this hook intentionally does NOT apply the portfolio
 * display priority chain (URL address > smart pool > wallet) — that resolution lives in
 * `usePortfolioAddresses` and is only for data display.
 */
export function usePortfolioAddress(): ReturnType<typeof useAccount> {
  return useAccount()
}
