import { UniverseChainId } from '@universe/chains'
import { Flex, Text } from '@universe/mycelium'
import { useTranslation } from 'react-i18next'
import { InterfacePageName } from 'uniswap/src/features/telemetry/constants'
import Trace from 'uniswap/src/features/telemetry/Trace'
import { usePortfolioRoutes } from '~/pages/Portfolio/Header/hooks/usePortfolioRoutes'
import { GMX_CHAIN_ID } from '~/pages/Portfolio/hooks/useGmxPositions'
import { GmxPerpsSection } from '~/pages/Portfolio/Perps/gmx/GmxPerpsSection'
import { HyperliquidPerpsSection } from '~/pages/Portfolio/Perps/hyperliquid/HyperliquidPerpsSection'

export function PortfolioPerps(): JSX.Element {
  const { t } = useTranslation()
  const { chainId } = usePortfolioRoutes()

  // Perps sections follow the same chain attribution as the portfolio totals: GMX v2
  // positions belong to Arbitrum, and the Hyperliquid account is presented as "Hyperliquid
  // positions on HyperEVM", so it belongs to HyperEVM (999) and the All Networks view. A
  // single-chain selection of any other chain shows neither section.
  const showGmxSection = chainId === undefined || chainId === GMX_CHAIN_ID
  const showHyperliquidSection = chainId === undefined || chainId === UniverseChainId.HyperEvm

  return (
    <Trace logImpression page={InterfacePageName.PortfolioPerpsPage}>
      <Flex gap="$spacing24">
        <Flex gap="$spacing4">
          <Text variant="heading2">{t('portfolio.perps.title')}</Text>
          <Text variant="body3" color="$neutral2">
            {t('portfolio.perps.subtitle')}
          </Text>
        </Flex>

        {showGmxSection && <GmxPerpsSection />}
        {showHyperliquidSection && <HyperliquidPerpsSection />}
      </Flex>
    </Trace>
  )
}
