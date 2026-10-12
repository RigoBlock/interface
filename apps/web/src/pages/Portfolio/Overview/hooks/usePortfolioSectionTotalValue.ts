import { UniverseChainId } from '@universe/chains'
import { PortfolioBalancePart } from 'uniswap/src/data/apiClients/dataApiService/balances/getWalletBalances/getWalletBalances'
import { usePortfolioBalanceBreakdown } from 'uniswap/src/features/dataApi/balances/balancesRest'
import { isBackendSupportedChainId } from 'uniswap/src/features/chains/utils'
import { useLocalizationContext } from 'uniswap/src/features/language/LocalizationContext'
import { NumberType } from 'utilities/src/format/types'
import { usePortfolioAddresses } from '~/pages/Portfolio/hooks/usePortfolioAddresses'

interface UsePortfolioSectionTotalValueParams {
  part: PortfolioBalancePart.Tokens | PortfolioBalancePart.Pools
  chainId?: UniverseChainId
  enabled: boolean
}

interface PortfolioSectionTotalValue {
  totalValueFormatted?: string
  totalValueNumeric?: number
  totalValueLoading: boolean
  /** Item count for the part (for Pools: open, non-spam positions). */
  count?: number
}

export function usePortfolioSectionTotalValue({
  part,
  chainId,
  enabled,
}: UsePortfolioSectionTotalValueParams): PortfolioSectionTotalValue {
  const { convertFiatAmountFormatted } = useLocalizationContext()
  const portfolioAddresses = usePortfolioAddresses()

  // For a non-backend-supported chain (e.g. HyperEVM 999) the backend either errors or returns
  // the full multichain set, so its breakdown is not attributable to the selected chain — don't
  // even request it.
  const isChainFilterSupported = chainId === undefined || isBackendSupportedChainId(chainId)

  const { data: portfolioBreakdown, loading } = usePortfolioBalanceBreakdown({
    evmAddress: portfolioAddresses.evmAddress,
    svmAddress: portfolioAddresses.svmAddress,
    chainIds: chainId ? [chainId] : undefined,
    enabled: enabled && isChainFilterSupported,
  })

  const partBreakdown = enabled && isChainFilterSupported ? portfolioBreakdown?.[part] : undefined
  const balanceUSD = partBreakdown?.balanceUSD

  return {
    totalValueFormatted:
      balanceUSD !== undefined ? convertFiatAmountFormatted(balanceUSD, NumberType.PortfolioBalance) : undefined,
    totalValueNumeric: balanceUSD,
    totalValueLoading: enabled && loading && balanceUSD === undefined,
    count: partBreakdown?.count,
  }
}
