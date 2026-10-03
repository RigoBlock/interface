import { TradingApi } from '@universe/api'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getSmartPoolUniversalRouterVersion,
  initializeSmartPoolUniversalRouterVersion,
  resetSmartPoolUniversalRouterVersionForTests,
  UR_2_1_2_APPLICATION_ADAPTERS,
} from 'uniswap/src/data/apiClients/tradingApi/smartPoolUniversalRouterVersion'

const MAINNET_ADAPTER = UR_2_1_2_APPLICATION_ADAPTERS[1] as string
const OLD_ADAPTER = '0x27213E28D7fDA5c57Fe9e5dd923818DBCcf71c47'

const POOL = { address: '0xEfa4bDf566aE50537A507863612638680420645C', chainId: 1 }
const OTHER_CHAIN_POOL = { address: '0x27213E28D7fDA5c57Fe9e5dd923818DBCcf71c47', chainId: 137 }

function initWith({ pool = POOL, adapter }: { pool?: typeof POOL; adapter?: string }) {
  const getApplicationAdapter = vi.fn().mockResolvedValue(adapter)
  initializeSmartPoolUniversalRouterVersion({
    getActiveSmartPool: () => pool,
    getApplicationAdapter,
  })
  return getApplicationAdapter
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
    initWith({ adapter: MAINNET_ADAPTER })
    await expect(getSmartPoolUniversalRouterVersion(undefined)).resolves.toBeUndefined()
  })

  it('returns undefined when there is no active smart pool', async () => {
    const getApplicationAdapter = vi.fn()
    initializeSmartPoolUniversalRouterVersion({
      getActiveSmartPool: () => undefined,
      getApplicationAdapter,
    })

    await expect(getSmartPoolUniversalRouterVersion(1)).resolves.toBeUndefined()
    expect(getApplicationAdapter).not.toHaveBeenCalled()
  })

  it('returns undefined when the active pool is on a different chain than the request', async () => {
    const getApplicationAdapter = initWith({ pool: OTHER_CHAIN_POOL, adapter: undefined })

    await expect(getSmartPoolUniversalRouterVersion(1)).resolves.toBeUndefined()
    expect(getApplicationAdapter).not.toHaveBeenCalled()
  })

  it('resolves UR 2.1.2 when the governance adapter matches', async () => {
    initWith({ adapter: MAINNET_ADAPTER })
    await expect(getSmartPoolUniversalRouterVersion(1)).resolves.toBe(TradingApi.UniversalRouterVersion._2_1_2)
  })

  it('matches the governance adapter case-insensitively', async () => {
    initWith({ adapter: '0x' + MAINNET_ADAPTER.slice(2).toUpperCase() })
    await expect(getSmartPoolUniversalRouterVersion(1)).resolves.toBe(TradingApi.UniversalRouterVersion._2_1_2)
  })

  it('returns undefined when the pool still resolves the old adapter', async () => {
    initWith({ adapter: OLD_ADAPTER })
    await expect(getSmartPoolUniversalRouterVersion(1)).resolves.toBeUndefined()
  })

  it('returns undefined when the pool resolves no adapter', async () => {
    initWith({ adapter: undefined })
    await expect(getSmartPoolUniversalRouterVersion(1)).resolves.toBeUndefined()
  })

  it('returns undefined on a chain with no governance-mapped adapter even when an adapter is returned', async () => {
    expect(UR_2_1_2_APPLICATION_ADAPTERS[999]).toBeUndefined()
    const getApplicationAdapter = initWith({ pool: { ...POOL, chainId: 999 }, adapter: MAINNET_ADAPTER })

    await expect(getSmartPoolUniversalRouterVersion(999)).resolves.toBeUndefined()
    expect(getApplicationAdapter).toHaveBeenCalled()
  })

  it('returns undefined when the adapter read fails', async () => {
    const getApplicationAdapter = vi.fn().mockRejectedValue(new Error('rpc down'))
    initializeSmartPoolUniversalRouterVersion({
      getActiveSmartPool: () => POOL,
      getApplicationAdapter,
    })

    await expect(getSmartPoolUniversalRouterVersion(1)).resolves.toBeUndefined()
  })

  it('caches a positive resolution for 60s without re-reading the chain', async () => {
    const getApplicationAdapter = initWith({ adapter: MAINNET_ADAPTER })

    await expect(getSmartPoolUniversalRouterVersion(1)).resolves.toBe(TradingApi.UniversalRouterVersion._2_1_2)
    vi.advanceTimersByTime(30_000)
    await expect(getSmartPoolUniversalRouterVersion(1)).resolves.toBe(TradingApi.UniversalRouterVersion._2_1_2)
    expect(getApplicationAdapter).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(31_000)
    await expect(getSmartPoolUniversalRouterVersion(1)).resolves.toBe(TradingApi.UniversalRouterVersion._2_1_2)
    expect(getApplicationAdapter).toHaveBeenCalledTimes(2)
  })

  it('caches a negative resolution for 15s before retrying', async () => {
    const getApplicationAdapter = initWith({ adapter: OLD_ADAPTER })

    await expect(getSmartPoolUniversalRouterVersion(1)).resolves.toBeUndefined()
    vi.advanceTimersByTime(10_000)
    await expect(getSmartPoolUniversalRouterVersion(1)).resolves.toBeUndefined()
    expect(getApplicationAdapter).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(6_000)
    await expect(getSmartPoolUniversalRouterVersion(1)).resolves.toBeUndefined()
    expect(getApplicationAdapter).toHaveBeenCalledTimes(2)
  })
})
