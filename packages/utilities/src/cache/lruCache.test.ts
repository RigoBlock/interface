import { createLruCache } from 'utilities/src/cache/lruCache'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const TTL_MS = 60_000

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createLruCache', () => {
  it('reads back what was written', () => {
    const cache = createLruCache<string>({ maxSize: 2, ttlMs: TTL_MS })
    cache.set('a', 'value-a')

    expect(cache.get('a')).toBe('value-a')
    expect(cache.get('missing')).toBeUndefined()
  })

  it('rejects a maxSize that can never hold an entry', () => {
    expect(() => createLruCache<string>({ maxSize: 0, ttlMs: TTL_MS })).toThrow(/maxSize must be at least 1/)
  })

  it('expires an entry once its ttl elapses', () => {
    const cache = createLruCache<string>({ maxSize: 2, ttlMs: TTL_MS })
    cache.set('a', 'value-a')

    vi.advanceTimersByTime(TTL_MS - 1)
    expect(cache.get('a')).toBe('value-a')

    vi.advanceTimersByTime(1)
    expect(cache.get('a')).toBeUndefined()
  })

  it('drops an expired entry on read instead of leaving it in place', () => {
    const cache = createLruCache<string>({ maxSize: 2, ttlMs: TTL_MS })
    cache.set('a', 'value-a')
    vi.advanceTimersByTime(TTL_MS)

    expect(cache.size).toBe(1)
    cache.get('a')
    expect(cache.size).toBe(0)
  })

  it('dates the ttl from the write, so overwriting extends it', () => {
    const cache = createLruCache<string>({ maxSize: 2, ttlMs: TTL_MS })
    cache.set('a', 'value-a')

    vi.advanceTimersByTime(TTL_MS - 1)
    cache.set('a', 'value-a2')

    vi.advanceTimersByTime(TTL_MS - 1)
    expect(cache.get('a')).toBe('value-a2')
  })

  it('evicts the least recently used entry when full', () => {
    const cache = createLruCache<string>({ maxSize: 2, ttlMs: TTL_MS })
    cache.set('a', 'value-a')
    cache.set('b', 'value-b')
    cache.set('c', 'value-c')

    expect(cache.size).toBe(2)
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBe('value-b')
    expect(cache.get('c')).toBe('value-c')
  })

  it('counts a read as a use, so the read key survives eviction', () => {
    const cache = createLruCache<string>({ maxSize: 2, ttlMs: TTL_MS })
    cache.set('a', 'value-a')
    cache.set('b', 'value-b')

    // 'a' is the oldest by insertion, but reading it makes 'b' the LRU.
    expect(cache.get('a')).toBe('value-a')
    cache.set('c', 'value-c')

    expect(cache.get('a')).toBe('value-a')
    expect(cache.get('b')).toBeUndefined()
  })

  it('counts an overwrite as a use, so the rewritten key survives eviction', () => {
    const cache = createLruCache<string>({ maxSize: 2, ttlMs: TTL_MS })
    cache.set('a', 'value-a')
    cache.set('b', 'value-b')
    cache.set('a', 'value-a2')
    cache.set('c', 'value-c')

    expect(cache.get('a')).toBe('value-a2')
    expect(cache.get('b')).toBeUndefined()
  })

  it('stays bounded no matter how many distinct keys it sees', () => {
    const cache = createLruCache<number>({ maxSize: 3, ttlMs: TTL_MS })
    for (let i = 0; i < 500; i++) {
      cache.set(`key-${i}`, i)
    }

    expect(cache.size).toBe(3)
    expect(cache.get('key-499')).toBe(499)
    expect(cache.get('key-0')).toBeUndefined()
  })

  it('deletes and clears', () => {
    const cache = createLruCache<string>({ maxSize: 2, ttlMs: TTL_MS })
    cache.set('a', 'value-a')
    cache.set('b', 'value-b')

    expect(cache.delete('a')).toBe(true)
    expect(cache.delete('a')).toBe(false)
    expect(cache.size).toBe(1)

    cache.clear()
    expect(cache.size).toBe(0)
    expect(cache.get('b')).toBeUndefined()
  })
})
