import { Flex } from 'ui/src'
import { PortfolioConnectWalletBanner } from '~/pages/Portfolio/ConnectWalletBanner'
import { ConnectWalletFixedBottomButton } from '~/pages/Portfolio/ConnectWalletFixedBottomButton'
import { usePortfolioRoutes } from '~/pages/Portfolio/Header/hooks/usePortfolioRoutes'
import { PortfolioHeader } from '~/pages/Portfolio/Header/Header'
import { usePortfolioAddresses } from '~/pages/Portfolio/hooks/usePortfolioAddresses'
import { useShowDemoView } from '~/pages/Portfolio/hooks/useShowDemoView'
import { PortfolioContent } from '~/pages/Portfolio/PortfolioContent'
import { PortfolioOutageProvider } from '~/pages/Portfolio/PortfolioOutageContext'
import { PortfolioStakingProvider } from '~/pages/Portfolio/PortfolioStakingContext'

interface PortfolioPageInnerProps {
  scrollY: number
  isBannerVisible: boolean
  mb?: number | string
}

export function PortfolioPageInner({ scrollY, isBannerVisible, mb }: PortfolioPageInnerProps): JSX.Element {
  const showDemoView = useShowDemoView()
  const portfolioAddresses = usePortfolioAddresses()
  const { chainId } = usePortfolioRoutes()

  return (
    <PortfolioOutageProvider>
      <PortfolioStakingProvider address={portfolioAddresses.evmAddress} chainId={chainId}>
        <Flex
          flexDirection="column"
          gap="$spacing40"
          maxWidth="$maxWidth1200"
          width="100%"
          p="$spacing24"
          pt="$none"
          position="relative"
          mb={mb}
          $sm={{ p: '$spacing8' }}
        >
          {showDemoView && <PortfolioConnectWalletBanner />}
          {showDemoView && <ConnectWalletFixedBottomButton shouldShow={!isBannerVisible} />}
          {/* Animated Content Area - All routes show same content, filtered by chain */}
          <Flex gap="$spacing24">
            <PortfolioHeader scrollY={showDemoView ? undefined : scrollY} />
            {showDemoView ? (
              <Flex cursor="not-allowed">
                <PortfolioContent disabled />
              </Flex>
            ) : (
              <PortfolioContent />
            )}
          </Flex>
        </Flex>
      </PortfolioStakingProvider>
    </PortfolioOutageProvider>
  )
}
