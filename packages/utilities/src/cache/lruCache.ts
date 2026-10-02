/**
 * Bounded, TTL-aware in-process cache with least-recently-used eviction.
 *
 * For values worth keeping across requests — request-scoped caches should use
 * a `WeakMap` keyed on the request instead, so the GC clears them. Bounded two
 * ways rather than growing with the number of distinct keys the process has
 * ever seen:
 *
 * - `ttlMs` expires an entry a fixed time after it was written
 * - `maxSize` evicts the least recently used entry once the cache is full
 *
 * A `Map` preserves insertion order, which is what makes recency tracking
 * cheap: reading an entry re-inserts it as the newest, so the oldest key is
 * always the first one the iterator yields.
 */

export interface LruCache<T> {
  /** Returns the cached value, or undefined if absent or expired. */
  get(key: string): T | undefined
  /** Writes a value, evicting the least recently used entry if full. */
  set(key: string, value: T): void
  /** Drops an entry. Returns whether one was present. */
  delete(key: string): boolean
  /** Drops every entry. Intended for tests and process-level resets. */
  clear(): void
  /** Current entry count, including entries that have expired but not been read. */
  readonly size: number
}

export function createLruCache<T>({ maxSize, ttlMs }: { maxSize: number; ttlMs: number }): LruCache<T> {
  if (maxSize < 1) {
    throw new Error(`createLruCache: maxSize must be at least 1, got ${maxSize}`)
  }

  const entries = new Map<string, { value: T; expiresAt: number }>()

  return {
    get(key) {
      const entry = entries.get(key)
      if (!entry) {
        return undefined
      }

      // Expired entries are deleted on read rather than swept on a timer: a
      // long-lived key that nobody asks for again is eventually evicted by
      // maxSize anyway, so a timer would only add a handle to keep alive.
      if (entry.expiresAt <= Date.now()) {
        entries.delete(key)
        return undefined
      }

      // Re-insert to mark this key as the most recently used.
      entries.delete(key)
      entries.set(key, entry)
      return entry.value
    },

    set(key, value) {
      // Delete first so an overwrite moves the key to the newest position
      // instead of keeping its original insertion order.
      entries.delete(key)
      entries.set(key, { value, expiresAt: Date.now() + ttlMs })

      while (entries.size > maxSize) {
        const oldestKey = entries.keys().next().value
        if (oldestKey === undefined) {
          break
        }
        entries.delete(oldestKey)
      }
    },

    delete(key) {
      return entries.delete(key)
    },

    clear() {
      entries.clear()
    },

    get size() {
      return entries.size
    },
  }
}
