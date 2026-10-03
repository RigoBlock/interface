import { TradingApi } from '@universe/api'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getSmartPoolUniversalRouterVersion,
  initializeSmartPoolUniversalRouterVersion,
  resetSmartPoolUniversalRouterVersionForTests,
} from 'uniswap/src/data/apiClients/tradingApi/smartPoolUniversalRouterVersion'

const POOL = { address: '0xEfa4bDf566aE50537A507863612638680420645C', chainId: 1 }
const OTHER_CHAIN_POOL = { address: '0x27213E28D7fDA5c57Fe9e5dd923818DBCcf71c47', chainId: 137 }

function initWith({ pool = POOL, version }: { pool?: typeof POOL; version?: string }) {
  const getSmartPoolVersion = vi.fn().mockResolvedValue(version)
  initializeSmartPoolUniversalRouterVersion({
    getActiveSmartPool: () => pool,
    getSmartPoolVersion,
  })
  return getSmartPoolVersion
}

describe('getSmartPoolUniversalRouterVersion', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-03T00:00:00Z'))
  })

  afterEach(() => {
    resetSmartPoolUniversalRouterVersionForTests()
    vi.useRealTimers()
  })

  it('returns undefined when no context has been injected', async () => {
    await expect(getSmartPoolUniversalRouterVersion(1)).resolves.toBeUndefined()
  })

  it('returns undefined when the request has no chainId', async () => {
    initWith({ version: '4.4.7' })
    await expect(getSmartPoolUniversalRouterVersion(undefined)).resolves.toBeUndefined()
  })

  it('returns undefined when there is no active smart pool', async () => {
    const getSmartPoolVersion = vi.fn()
    initializeSmartPoolUniversalRouterVersion({
      getActiveSmartPool: () => undefined,
      getSmartPoolVersion,
    })

    await expect(getSmartPoolUniversalRouterVersion(1)).resolves.toBeUndefined()
    expect(getSmartPoolVersion).not.toHaveBeenCalled()
  })

  it('returns undefined when the active pool is on a different chain than the request', async () => {
    const getSmartPoolVersion = initWith({ pool: OTHER_CHAIN_POOL, version: '4.4.7' })

    await expect(getSmartPoolUniversalRouterVersion(1)).resolves.toBeUndefined()
    expect(getSmartPoolVersion).not.toHaveBeenCalled()
  })

  it('resolves UR 2.1.2 when the pool is on the request chain and VERSION is 4.4.7', async () => {
    initWith({ version: '4.4.7' })
    await expect(getSmartPoolUniversalRouterVersion(1)).resolves.toBe(TradingApi.UniversalRouterVersion._2_1_2)
  })

  it('resolves UR 2.1.2 for a higher protocol version (4.5.0)', async () => {
    initWith({ version: '4.5.0' })
    await expect(getSmartPoolUniversalRouterVersion(1)).resolves.toBe(TradingApi.UniversalRouterVersion._2_1_2)
  })

  it('ignores non-numeric suffixes in the version string ("4.4.7-beta")', async () => {
    initWith({ version: '4.4.7-beta' })
    await expect(getSmartPoolUniversalRouterVersion(1)).resolves.toBe(TradingApi.UniversalRouterVersion._2_1_2)
  })

  it('returns undefined when the pool protocol is below 4.4.7 (4.4.6)', async () => {
    initWith({ version: '4.4.6' })
    await expect(getSmartPoolUniversalRouterVersion(1)).resolves.toBeUndefined()
  })

  it('returns undefined when the version string has no numeric component', async () => {
    initWith({ version: 'beta' })
    await expect(getSmartPoolUniversalRouterVersion(1)).resolves.toBeUndefined()
  })

  it('returns undefined when the version read fails', async () => {
    const getSmartPoolVersion = vi.fn().mockRejectedValue(new Error('rpc down'))
    initializeSmartPoolUniversalRouterVersion({
      getActiveSmartPool: () => POOL,
      getSmartPoolVersion,
    })

    await expect(getSmartPoolUniversalRouterVersion(1)).resolves.toBeUndefined()
  })

  it('caches a positive resolution for 60s without re-reading the chain', async () => {
    const getSmartPoolVersion = initWith({ version: '4.4.7' })

    await expect(getSmartPoolUniversalRouterVersion(1)).resolves.toBe(TradingApi.UniversalRouterVersion._2_1_2)
    vi.advanceTimersByTime(30_000)
    await expect(getSmartPoolUniversalRouterVersion(1)).resolves.toBe(TradingApi.UniversalRouterVersion._2_1_2)
    expect(getSmartPoolVersion).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(31_000)
    await expect(getSmartPoolUniversalRouterVersion(1)).resolves.toBe(TradingApi.UniversalRouterVersion._2_1_2)
    expect(getSmartPoolVersion).toHaveBeenCalledTimes(2)
  })

  it('caches a negative resolution for 15s before retrying', async () => {
    const getSmartPoolVersion = initWith({ version: '4.4.6' })

    await expect(getSmartPoolUniversalRouterVersion(1)).resolves.toBeUndefined()
    vi.advanceTimersByTime(10_000)
    await expect(getSmartPoolUniversalRouterVersion(1)).resolves.toBeUndefined()
    expect(getSmartPoolVersion).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(6_000)
    await expect(getSmartPoolUniversalRouterVersion(1)).resolves.toBeUndefined()
    expect(getSmartPoolVersion).toHaveBeenCalledTimes(2)
  })
})
