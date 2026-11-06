import {
  type StatsigOptions,
  StatsigClient,
  StatsigProvider,
  type StatsigUser,
  type StorageProvider,
} from '@universe/gating'
import { type ReactNode, useEffect, useMemo } from 'react'
import { config } from 'uniswap/src/config'
import { statsigBaseConfig } from 'uniswap/src/features/gating/statsigBaseConfig'
import { logger } from 'utilities/src/logger/logger'

type StatsigProviderWrapperProps = {
  user: StatsigUser
  children: ReactNode
  onInit?: () => void
  options?: Partial<StatsigUser>
  storageProvider?: StorageProvider
}

export function StatsigProviderWrapper({
  children,
  options,
  user,
  storageProvider,
  onInit,
}: StatsigProviderWrapperProps): ReactNode {
  if (!config.statsigApiKey) {
    throw new Error('statsigApiKey is not set')
  }

  const statsigOptions = useMemo<StatsigOptions>(
    () => ({
      ...statsigBaseConfig,
      storageProvider,
      ...options,
    }),
    [storageProvider, options],
  )

  // RigoBlock fork: SKIP Statsig network initialization entirely — construct the client
  // but never call initializeAsync (no /v1/statsig-proxy relay traffic, no error or
  // initialization_failure events). Uninitialized, every gate evaluates to its call-site
  // default (false). Safe for the fork:
  //  - the `uniswapx` gate is neutralized in filterProtocols regardless of its value;
  //  - UR version selection is onchain governance mapping, not Statsig;
  //  - no fork feature depends on a gate being ON (demo view is connection-state driven).
  // Upstream's behavior is one line away: swap back to useClientAsyncInit(config.statsigApiKey,
  // user, statsigOptions). (The SDK's useClientBootstrapInit would also work at runtime but
  // its shipped types are wrong, hence the direct construction.)
  const client = useMemo(
    () => new StatsigClient(config.statsigApiKey, user, statsigOptions),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mirror the upstream hook's keying: recreate only when identity inputs change
    [config.statsigApiKey, user, statsigOptions],
  )


  // Never loading in the fork (no network init) — fire the init callback once on mount.
  // onInit is a useEvent-stable identity upstream (index.tsx documents this), so this fires once.
  useEffect(() => {
    onInit?.()
  }, [onInit])

  useEffect(() => {
    const errorHandler = (event: unknown): void => {
      logger.error('StatsigProviderWrapper', {
        tags: { file: 'StatsigProviderWrapper', function: 'error' },
        extra: {
          event,
        },
      })
    }
    client.on('error', errorHandler)
    client.on('initialization_failure', errorHandler)
    return () => {
      client.off('error', errorHandler)
      client.off('initialization_failure', errorHandler)
    }
  }, [client])

  return <StatsigProvider client={client}>{children}</StatsigProvider>
}
