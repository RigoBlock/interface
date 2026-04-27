import { Flex } from 'ui/src'
import { PortfolioConnectWalletBanner } from '~/pages/Portfolio/ConnectWalletBanner'
import { ConnectWalletFixedBottomButton } from '~/pages/Portfolio/ConnectWalletFixedBottomButton'
import { PortfolioHeader } from '~/pages/Portfolio/Header/Header'
import { useShowDemoView } from '~/pages/Portfolio/hooks/useShowDemoView'
import { PortfolioContent } from '~/pages/Portfolio/PortfolioContent'
import { PortfolioOutageProvider } from '~/pages/Portfolio/PortfolioOutageContext'

interface PortfolioPageInnerProps {
  scrollY: number
  isBannerVisible: boolean
  mb?: number | string
}

export function PortfolioPageInner({ scrollY, isBannerVisible, mb }: PortfolioPageInnerProps): JSX.Element {
  const showDemoView = useShowDemoView()

  return (
    <PortfolioOutageProvider>
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
    </PortfolioOutageProvider>
  )
}
