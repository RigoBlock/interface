import { usePortfolioStaking } from 'pages/Portfolio/hooks/usePortfolioStaking'

export function useStakingValue(address?: string) {
  return usePortfolioStaking(address)
}
