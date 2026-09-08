import { useTranslation } from 'react-i18next'
import { Flex, Text } from 'ui/src'
import { InterfacePageName } from 'uniswap/src/features/telemetry/constants'
import Trace from 'uniswap/src/features/telemetry/Trace'
import { GmxPerpsSection } from '~/pages/Portfolio/Perps/gmx/GmxPerpsSection'
import { HyperliquidPerpsSection } from '~/pages/Portfolio/Perps/hyperliquid/HyperliquidPerpsSection'

export function PortfolioPerps(): JSX.Element {
  const { t } = useTranslation()

  return (
    <Trace logImpression page={InterfacePageName.PortfolioPerpsPage}>
      <Flex gap="$spacing24">
        <Flex gap="$spacing4">
          <Text variant="heading2">{t('portfolio.perps.title')}</Text>
          <Text variant="body3" color="$neutral2">
            {t('portfolio.perps.subtitle')}
          </Text>
        </Flex>

        <GmxPerpsSection />
        <HyperliquidPerpsSection />
      </Flex>
    </Trace>
  )
}
