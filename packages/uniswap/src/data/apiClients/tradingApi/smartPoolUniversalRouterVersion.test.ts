import { TradingApi } from '@universe/api'
import {
  getSmartPoolUniversalRouterVersion,
  initializeSmartPoolUniversalRouterVersion,
  resetSmartPoolUniversalRouterVersionForTests,
  UR_2_0_0_APPLICATION_ADAPTERS,
} from 'uniswap/src/data/apiClients/tradingApi/smartPoolUniversalRouterVersion'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The adapter governance CURRENTLY maps the UR selectors to (pool decodes UR 2.0 calldata).
const MAINNET_UR200_ADAPTER = UR_2_0_0_APPLICATION_ADAPTERS[1] as string
// Any other non-zero address simulates a future governance upgrade to a 2.1.2-capable adapter.
const UPGRADED_ADAPTER = '0x8E0F4Cb68e276e31cF48B33EddD40325f5a736D2'
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

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
    initWith({ adapter: UPGRADED_ADAPTER })
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

  it('keeps UR 2.0 while the mapping still points at the UR-2.0.0 adapter (current onchain state)', async () => {
    initWith({ adapter: MAINNET_UR200_ADAPTER })
    await expect(getSmartPoolUniversalRouterVersion(1)).resolves.toBeUndefined()
  })

  it('matches the UR-2.0.0 adapter case-insensitively', async () => {
    initWith({ adapter: '0x' + MAINNET_UR200_ADAPTER.slice(2).toUpperCase() })
    await expect(getSmartPoolUniversalRouterVersion(1)).resolves.toBeUndefined()
  })

  it('resolves UR 2.1.2 when governance has re-mapped the selector to a new adapter', async () => {
    initWith({ adapter: UPGRADED_ADAPTER })
    await expect(getSmartPoolUniversalRouterVersion(1)).resolves.toBe(TradingApi.UniversalRouterVersion._2_1_2)
  })

  it('throws when the mapping returns the zero address instead of failing soft', async () => {
    initWith({ adapter: ZERO_ADDRESS })
    await expect(getSmartPoolUniversalRouterVersion(1)).rejects.toThrow(/returned no adapter/)
  })

  it('throws when the adapter read returns nothing', async () => {
    initWith({ adapter: undefined })
    await expect(getSmartPoolUniversalRouterVersion(1)).rejects.toThrow(/returned no adapter/)
  })

  it('propagates RPC errors instead of falling back to a version guess', async () => {
    const getApplicationAdapter = vi.fn().mockRejectedValue(new Error('rpc down'))
    initializeSmartPoolUniversalRouterVersion({
      getActiveSmartPool: () => POOL,
      getApplicationAdapter,
    })

    await expect(getSmartPoolUniversalRouterVersion(1)).rejects.toThrow('rpc down')
  })

  it('returns undefined on a chain with no known UR-2.0.0 adapter even when an adapter is mapped', async () => {
    expect(UR_2_0_0_APPLICATION_ADAPTERS[999]).toBeUndefined()
    const getApplicationAdapter = initWith({ pool: { ...POOL, chainId: 999 }, adapter: UPGRADED_ADAPTER })

    await expect(getSmartPoolUniversalRouterVersion(999)).resolves.toBeUndefined()
    expect(getApplicationAdapter).toHaveBeenCalled()
  })

  it('caches a positive (upgraded) resolution for 60s without re-reading the chain', async () => {
    const getApplicationAdapter = initWith({ adapter: UPGRADED_ADAPTER })

    await expect(getSmartPoolUniversalRouterVersion(1)).resolves.toBe(TradingApi.UniversalRouterVersion._2_1_2)
    vi.advanceTimersByTime(30_000)
    await expect(getSmartPoolUniversalRouterVersion(1)).resolves.toBe(TradingApi.UniversalRouterVersion._2_1_2)
    expect(getApplicationAdapter).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(31_000)
    await expect(getSmartPoolUniversalRouterVersion(1)).resolves.toBe(TradingApi.UniversalRouterVersion._2_1_2)
    expect(getApplicationAdapter).toHaveBeenCalledTimes(2)
  })

  it('caches a negative (still-2.0) resolution for 15s before retrying', async () => {
    const getApplicationAdapter = initWith({ adapter: MAINNET_UR200_ADAPTER })

    await expect(getSmartPoolUniversalRouterVersion(1)).resolves.toBeUndefined()
    vi.advanceTimersByTime(10_000)
    await expect(getSmartPoolUniversalRouterVersion(1)).resolves.toBeUndefined()
    expect(getApplicationAdapter).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(6_000)
    await expect(getSmartPoolUniversalRouterVersion(1)).resolves.toBeUndefined()
    expect(getApplicationAdapter).toHaveBeenCalledTimes(2)
  })

  it('does not cache a failed read, so the next request retries it', async () => {
    const getApplicationAdapter = vi
      .fn()
      .mockRejectedValueOnce(new Error('rpc down'))
      .mockResolvedValue(MAINNET_UR200_ADAPTER)
    initializeSmartPoolUniversalRouterVersion({
      getActiveSmartPool: () => POOL,
      getApplicationAdapter,
    })

    await expect(getSmartPoolUniversalRouterVersion(1)).rejects.toThrow('rpc down')
    await expect(getSmartPoolUniversalRouterVersion(1)).resolves.toBeUndefined()
    expect(getApplicationAdapter).toHaveBeenCalledTimes(2)
  })
})
