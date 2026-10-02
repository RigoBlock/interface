import { FeatureFlags, useFeatureFlag } from '@universe/gating'
import { Flex } from '@universe/mycelium'
import { PortfolioConnectWalletBanner } from '~/pages/Portfolio/ConnectWalletBanner'
import { ConnectWalletFixedBottomButton } from '~/pages/Portfolio/ConnectWalletFixedBottomButton'
import { PortfolioHeader } from '~/pages/Portfolio/Header/Header'
import { usePortfolioRoutes } from '~/pages/Portfolio/Header/hooks/usePortfolioRoutes'
import { usePortfolioAddresses } from '~/pages/Portfolio/hooks/usePortfolioAddresses'
import { usePortfolioHeartbeatCoordinator } from '~/pages/Portfolio/hooks/usePortfolioHeartbeatCoordinator'
import { useShowDemoView } from '~/pages/Portfolio/hooks/useShowDemoView'
import { PortfolioContent } from '~/pages/Portfolio/PortfolioContent'
import { PortfolioOutageProvider } from '~/pages/Portfolio/PortfolioOutageContext'
import { PortfolioStakingProvider } from '~/pages/Portfolio/PortfolioStakingContext'

interface PortfolioPageInnerProps {
  mb?: number
}

export function PortfolioPageInner({ mb }: PortfolioPageInnerProps): JSX.Element {
  const showDemoView = useShowDemoView()
  const { tab, chainId } = usePortfolioRoutes()
  const portfolioAddresses = usePortfolioAddresses()
  const portfolioPoolsBalancesEnabled = useFeatureFlag(FeatureFlags.PortfolioPoolsBalances)

  usePortfolioHeartbeatCoordinator({ tab, poolsEnabled: portfolioPoolsBalancesEnabled })

  return (
    <PortfolioOutageProvider>
      <PortfolioStakingProvider address={portfolioAddresses.evmAddress} chainId={chainId}>
        <Flex
          flexDirection="column"
          gap="$spacing40"
          maxWidth={1200}
          width="100%"
          p="$spacing24"
          pt="$none"
          position="relative"
          mb={mb}
          $sm={{ p: '$spacing8' }}
        >
          {showDemoView && <PortfolioConnectWalletBanner />}
          {showDemoView && <ConnectWalletFixedBottomButton />}
          {/* Animated Content Area - All routes show same content, filtered by chain */}
          <Flex gap="$spacing24">
            <PortfolioHeader enableScrollCompact={!showDemoView} />
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
