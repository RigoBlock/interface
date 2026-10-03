// Ordering is intentional and must be preserved: sideEffects followed by functionality.
import '~/sideEffects'
import { PrivyProvider } from '@privy-io/react-auth'
import { ApiInit, getEntryGatewayUrl, provideSessionService } from '@universe/api'
import { ComplianceClientProvider } from '@universe/compliance'
import { isDevEnv, isTestEnv } from '@universe/environment'
import type { StatsigUser } from '@universe/gating'
import { getIsHashcashSolverEnabled, getIsTurnstileSolverEnabled } from '@universe/gating'
import { PortalProvider } from '@universe/mycelium/portal'
import {
  type ChallengeSolver,
  ChallengeType,
  createChallengeSolverService,
  createCrossOriginWorker,
  createHashcashMockSolver,
  createHashcashSolver,
  createHashcashWorkerChannel,
  createPerformanceTracker,
  createSessionInitializationService,
  createTurnstileMockSolver,
  createTurnstileSolver,
} from '@universe/sessions'
// Must stay a plain `?worker&url` import statement — Vite's worker detection is
// syntactic (vitejs/vite#13680).
// oxlint-disable-next-line import/default, no-restricted-imports -- Vite ?worker&url virtual module; linter can't resolve the default export
import hashcashWorkerUrl from '@universe/sessions/src/challenge-solvers/hashcash/worker/hashcash.worker.ts?worker&url'
import { NuqsAdapter } from 'nuqs/adapters/react-router/v7'
import type { PropsWithChildren, ReactNode } from 'react'
import { lazy, StrictMode, Suspense, useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import { Helmet, HelmetProvider } from 'react-helmet-async/lib/index'
import { I18nextProvider } from 'react-i18next'
import { configureReanimatedLogger } from 'react-native-reanimated'
import { Provider } from 'react-redux'
import { BrowserRouter, HashRouter, useLocation } from 'react-router'
import { ReactRouterUrlProvider } from 'uniswap/src/contexts/UrlContext'
import { initializePortfolioQueryOverrides } from 'uniswap/src/data/apiClients/dataApiService/balances/portfolioBalanceOverrides'
import { StatsigProviderWrapper } from 'uniswap/src/features/gating/StatsigProviderWrapper'
import { LocalizationContextProvider } from 'uniswap/src/features/language/LocalizationContext'
import i18n from 'uniswap/src/i18n'
import { getLogger } from 'utilities/src/logger/logger'
import { useEvent } from 'utilities/src/react/hooks'
// oxlint-disable-next-line no-restricted-imports -- custom useAccount hook requires statsig
import { useAccount } from 'wagmi'
import { App } from '~/App'
import { WebUniswapProvider } from '~/app/WebUniswapContext'
import { QueryClientPersistProvider } from '~/components/PersistQueryClient'
import { createWeb3Provider, WalletCapabilitiesEffects } from '~/components/Web3Provider/createWeb3Provider'
import { getConfig, getPrivyAppId, getPrivyConfig } from '~/config'
import { wagmiConfig } from '~/connection/wagmiConfig'
import { AccountsStoreDevTool } from '~/features/accounts/store/devtools'
import { WebAccountsStoreProvider } from '~/features/accounts/store/provider'
import { TransactionWatcherProvider } from '~/features/transactions/TransactionWatcherProvider'
import { ConnectWalletMutationProvider } from '~/features/wallet/connection/hooks/useConnectWalletMutation'
import { ExternalWalletProvider } from '~/features/wallet/providers/ExternalWalletProvider'
import { useAmplitudeDeviceId } from '~/hooks/useAmplitudeDeviceId'
import { useDeferredComponent } from '~/hooks/useDeferredComponent'
import { isPrivyConfigured } from '~/hooks/useMaybePrivy'
import { LanguageProvider } from '~/i18n/LanguageProvider'
import { BlockNumberProvider } from '~/lib/hooks/useBlockNumber'
import { WebNotificationServiceManager } from '~/notification-service/WebNotificationService'
import { onHashcashSolveCompleted, onTurnstileSolveCompleted, sessionInitAnalytics } from '~/sessions/analytics'
import store from '~/state'
import { LivePricesProvider } from '~/state/livePrices/LivePricesProvider'
import { ColorSchemeProvider } from '~/theme/colorSchemeProvider'
import { DeprecatedThemeProvider } from '~/theme/index'
import { isBrowserRouterEnabled } from '~/utils/env'
import { unregister as unregisterServiceWorker } from '~/utils/serviceWorker'
import { getIsSessionServiceEnabledOnWeb } from '~/utils/sessionService'
import { getCanonicalUrl } from '~/utils/urlRoutes'

if (window.ethereum) {
  window.ethereum.autoRefreshOnNetworkChange = false
}

if (__DEV__ && !isTestEnv()) {
  configureReanimatedLogger({
    strict: false,
  })
}

initializePortfolioQueryOverrides({ store })

const loadListsUpdater = () => import('~/state/lists/updater')
const loadApplicationUpdater = () => import('~/state/application/updater')
const loadActivityStateUpdater = () => import('~/state/activity/updater')
const loadFiatOnRampTransactionsUpdater = () => import('~/state/fiatOnRampTransactions/updater')
const loadWebAccountsStoreUpdater = () => import('~/features/accounts/store/updater')
const loadLogsUpdater = () => import('~/state/logs/updater')

const provideSessionInitService = () => {
  // Platform-specific: uses web's performance.now() API
  const performanceTracker = createPerformanceTracker({
    getNow: () => performance.now(),
  })

  // Turnstile runs on web only; hashcash runs on all platforms.
  const solvers = new Map<ChallengeType, ChallengeSolver>()

  if (getIsTurnstileSolverEnabled()) {
    solvers.set(
      ChallengeType.TURNSTILE,
      createTurnstileSolver({
        performanceTracker,
        getLogger,
        onSolveCompleted: onTurnstileSolveCompleted,
      }),
    )
  } else {
    solvers.set(ChallengeType.TURNSTILE, createTurnstileMockSolver())
  }

  if (getIsHashcashSolverEnabled()) {
    solvers.set(
      ChallengeType.HASHCASH,
      createHashcashSolver({
        performanceTracker,
        getWorkerChannel: () =>
          createHashcashWorkerChannel({
            getWorker: () => createCrossOriginWorker(hashcashWorkerUrl),
          }),
        onSolveCompleted: onHashcashSolveCompleted,
        getLogger,
      }),
    )
  } else {
    solvers.set(ChallengeType.HASHCASH, createHashcashMockSolver())
  }

  return createSessionInitializationService({
    performanceTracker,
    getSessionService: () =>
      provideSessionService({
        getBaseUrl: getEntryGatewayUrl,
        getIsSessionServiceEnabled: getIsSessionServiceEnabledOnWeb,
        getLogger,
      }),
    challengeSolverService: createChallengeSolverService({
      solvers,
      getLogger,
    }),
    getLogger,
    analytics: sessionInitAnalytics,
  })
}

function Updaters() {
  const location = useLocation()

  const ListsUpdater = useDeferredComponent(loadListsUpdater)
  const ApplicationUpdater = useDeferredComponent(loadApplicationUpdater)
  const ActivityStateUpdater = useDeferredComponent(loadActivityStateUpdater)
  const FiatOnRampTransactionsUpdater = useDeferredComponent(loadFiatOnRampTransactionsUpdater)
  const WebAccountsStoreUpdater = useDeferredComponent(loadWebAccountsStoreUpdater)
  const LogsUpdater = useDeferredComponent(loadLogsUpdater)

  return (
    <>
      <Helmet>
        <link rel="canonical" href={getCanonicalUrl(location.pathname, location.search)} />
      </Helmet>
      {ListsUpdater && <ListsUpdater />}
      {ApplicationUpdater && <ApplicationUpdater />}
      {ActivityStateUpdater && <ActivityStateUpdater />}
      {FiatOnRampTransactionsUpdater && <FiatOnRampTransactionsUpdater />}
      {WebAccountsStoreUpdater && <WebAccountsStoreUpdater />}
      {LogsUpdater && <LogsUpdater />}
      <AccountsStoreDevTool />
      <ApiInit getSessionInitService={provideSessionInitService} />
    </>
  )
}

// Production Web3Provider – always reconnects on mount and runs capability effects.
const Web3Provider = createWeb3Provider({ wagmiConfig })

function StatsigProvider({ children }: PropsWithChildren) {
  const account = useAccount()
  const { deviceId, isDeviceIdPending, didTimeOut } = useAmplitudeDeviceId()

  // `useClientAsyncInit` captures the user once at client construction — later changes to
  // deviceId/address never reach Statsig. The deps here only matter for pre-init renders.
  const statsigUser: StatsigUser = useMemo(
    () => ({
      userID: deviceId,
      customIDs: { address: account.address ?? '' },
      custom: {
        appVersion: getConfig().appVersion || 'unknown',
      },
    }),
    [deviceId, account.address],
  )

  // Datadog RUM disabled – RigoBlock does not collect user data. `onStatsigInit` therefore no
  // longer initializes RUM; only the device-id timeout warning is still reported.
  const onStatsigInit = useEvent(() => {
    if (didTimeOut) {
      getLogger().warn(
        'index.tsx',
        'StatsigProvider',
        'Timed out waiting for Amplitude device id; Statsig initialized without a userID',
      )
    }
  })

  // Don't initialize Statsig until the device id is available (bounded) — the SDK keeps the
  // first user it sees, so an undefined userID would persist for the whole session
  if (isDeviceIdPending) {
    return null
  }

  return (
    <StatsigProviderWrapper user={statsigUser} onInit={onStatsigInit}>
      {children}
    </StatsigProviderWrapper>
  )
}

// RigoBlock: Privy's auth iframe has a frame-ancestors CSP that only allows app.uniswap.org.
// When running on app.rigoblock.com the iframe is blocked, producing a CSP console error and
// ERR_FAILED for the auth resource. Only enable Privy on the Uniswap domain so the error
// is suppressed on RigoBlock without requiring a separate Privy app configuration.
const PRIVY_APP_ID = window.location.hostname === 'app.uniswap.org' ? getPrivyAppId() : undefined

function MaybePrivyProvider({ children }: { children: ReactNode }) {
  if (!isPrivyConfigured() || !PRIVY_APP_ID) {
    return <>{children}</>
  }
  const { appId, clientId } = getPrivyConfig(false)
  return (
    <PrivyProvider appId={appId} clientId={clientId} config={{ loginMethods: ['email', 'google', 'apple'] }}>
      {children}
    </PrivyProvider>
  )
}

// Gated by `__DEV__` (Vite build-time constant) so Rollup DCE's the `import('agentation')`
// call in production builds and no chunk is emitted.
const AgentationLazy = __DEV__ ? lazy(() => import('agentation').then((m) => ({ default: m.Agentation }))) : null

const container = document.getElementById('root') as HTMLElement

const Router = isBrowserRouterEnabled() ? BrowserRouter : HashRouter

const RootApp = (): JSX.Element => {
  return (
    <StrictMode>
      <HelmetProvider>
        <ReactRouterUrlProvider>
          <Provider store={store}>
            <QueryClientPersistProvider>
              <ComplianceClientProvider>
                <NuqsAdapter>
                  <Router>
                    <MaybePrivyProvider>
                      <I18nextProvider i18n={i18n}>
                        <LanguageProvider>
                          <Web3Provider>
                            <StatsigProvider>
                              <WalletCapabilitiesEffects />
                              <ExternalWalletProvider>
                                <ConnectWalletMutationProvider>
                                  <WebAccountsStoreProvider>
                                    <WebUniswapProvider>
                                      <TransactionWatcherProvider>
                                        <LivePricesProvider>
                                          <LocalizationContextProvider>
                                            <BlockNumberProvider>
                                              <Updaters />
                                              <ColorSchemeProvider>
                                                <DeprecatedThemeProvider>
                                                  <PortalProvider>
                                                    <WebNotificationServiceManager />
                                                    <App />
                                                    {AgentationLazy && isDevEnv() && (
                                                      <Suspense fallback={null}>
                                                        <AgentationLazy />
                                                      </Suspense>
                                                    )}
                                                  </PortalProvider>
                                                </DeprecatedThemeProvider>
                                              </ColorSchemeProvider>
                                            </BlockNumberProvider>
                                          </LocalizationContextProvider>
                                        </LivePricesProvider>
                                      </TransactionWatcherProvider>
                                    </WebUniswapProvider>
                                  </WebAccountsStoreProvider>
                                </ConnectWalletMutationProvider>
                              </ExternalWalletProvider>
                            </StatsigProvider>
                          </Web3Provider>
                        </LanguageProvider>
                      </I18nextProvider>
                    </MaybePrivyProvider>
                  </Router>
                </NuqsAdapter>
              </ComplianceClientProvider>
            </QueryClientPersistProvider>
          </Provider>
        </ReactRouterUrlProvider>
      </HelmetProvider>
    </StrictMode>
  )
}

createRoot(container).render(<RootApp />)

// We once had a ServiceWorker, and users who have not visited since then may still have it registered.
// This ensures it is truly gone.
unregisterServiceWorker()
