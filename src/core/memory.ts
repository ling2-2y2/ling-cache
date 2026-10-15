/**
 * In-memory {@link CacheStore} fake for consumer unit tests (design §2.1
 * test seam; not published as a product provider). Values round-trip through
 * the shared JSON codec so behavior — including serialization artifacts —
 * matches the Redis provider. Expiry is evaluated lazily on access: no
 * background timer, deterministic under fake timers.
 * @module dsh-cache/src/memory
 */

import { CacheError } from '../kit/error.ts'
import { assertTtlSec, decodeCacheValue, encodeCacheValue } from '../kit/codec.ts'
import type { CacheStore } from './types.ts'

/** One stored entry: the JSON document plus its absolute expiry. */
interface MemoryEntry {
  readonly raw: string
  readonly expiresAtMs: number | undefined
}

/**
 * Map-backed CacheStore. TTL semantics mirror Redis: `set` without TTL
 * clears any previous expiry, `incrBy` without TTL keeps it, `ttl` answers
 * `-1`/`-2` for persistent/missing keys.
 */
export class MemoryCacheStore implements CacheStore {
  private readonly entries = new Map<string, MemoryEntry>()

  private static expiryMs(ttlSec: number | undefined): number | undefined {
    return ttlSec === undefined ? undefined : Date.now() + ttlSec * 1000
  }

  /** Entry for `key` when still live; expired entries are deleted on sight. */
  private liveEntry(key: string): MemoryEntry | undefined {
    const entry = this.entries.get(key)
    if (entry === undefined) return undefined
    if (entry.expiresAtMs !== undefined && entry.expiresAtMs <= Date.now()) {
      this.entries.delete(key)
      return undefined
    }
    return entry
  }

  async get<T = unknown>(key: string): Promise<T | undefined> {
    const entry = this.liveEntry(key)
    return entry === undefined ? undefined : decodeCacheValue<T>(entry.raw)
  }

  async set(key: string, value: unknown, ttlSec?: number): Promise<void> {
    assertTtlSec(ttlSec)
    this.entries.set(key, { raw: encodeCacheValue(value), expiresAtMs: MemoryCacheStore.expiryMs(ttlSec) })
  }

  async setNx(key: string, value: unknown, ttlSec?: number): Promise<boolean> {
    assertTtlSec(ttlSec)
    // 过期条目视同缺席（liveEntry 顺手清扫），与 Redis 过期键语义一致
    if (this.liveEntry(key) !== undefined) return false
    this.entries.set(key, { raw: encodeCacheValue(value), expiresAtMs: MemoryCacheStore.expiryMs(ttlSec) })
    return true
  }

  async del(key: string): Promise<void> {
    this.entries.delete(key)
  }

  async delPrefix(prefix: string): Promise<number> {
    let deleted = 0
    for (const key of [...this.entries.keys()]) {
      if (key.startsWith(prefix) && this.liveEntry(key) !== undefined) {
        this.entries.delete(key)
        deleted += 1
      }
    }
    return deleted
  }

  async incrBy(key: string, delta: number, ttlSec?: number): Promise<number> {
    assertTtlSec(ttlSec)
    const entry = this.liveEntry(key)
    const current = entry === undefined ? 0 : decodeCacheValue<number>(entry.raw)
    if (!Number.isFinite(current)) {
      throw new CacheError('invalid-value', `cannot incrBy key '${key}': cached value is not numeric`)
    }
    const next = current + delta
    this.entries.set(key, {
      raw: encodeCacheValue(next),
      expiresAtMs: ttlSec !== undefined ? MemoryCacheStore.expiryMs(ttlSec) : entry?.expiresAtMs,
    })
    return next
  }

  async keys(prefix: string): Promise<string[]> {
    const found: string[] = []
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix) && this.liveEntry(key) !== undefined) found.push(key)
    }
    return found
  }

  async ttl(key: string): Promise<number> {
    const entry = this.liveEntry(key)
    if (entry === undefined) return -2
    if (entry.expiresAtMs === undefined) return -1
    return Math.ceil((entry.expiresAtMs - Date.now()) / 1000)
  }

  /**
   * Drop every entry regardless of prefix; test-isolation helper for
   * consumers that mount this fake fresh.
   */
  clear(): void {
    this.entries.clear()
  }
}
