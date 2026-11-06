import {
  type StatsigOptions,
  StatsigProvider,
  type StatsigUser,
  type StorageProvider,
  useClientAsyncInit,
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

  const { client, isLoading: isStatsigLoading } = useClientAsyncInit(config.statsigApiKey, user, statsigOptions)

  useEffect(() => {
    if (isStatsigLoading) {
      return
    }

    onInit?.()
  }, [isStatsigLoading, onInit])

  useEffect(() => {
    const errorHandler = (event: unknown): void => {
      // RigoBlock fork: the proxied Statsig relay (STATSIG_PROXY_URL_OVERRIDE -> the gateway's
      // /v1/statsig-proxy) emits recurring, non-actionable 'error' events (event-logging
      // hiccups, transient init retries) that upstream surfaces as console.error noise.
      // Downgrade to info — the events stay in the logs, but they no longer spam the error
      // console / trigger error-boundary telemetry. Gates still function identically.
      logger.info('StatsigProviderWrapper', 'error', 'statsig client error event', { event })
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
