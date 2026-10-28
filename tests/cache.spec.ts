/**
 * Hub registry, in-memory store, and mounted-hub tests — no server
 * required. Covers TS-CA-001/002/003/004/005/006/007 for the
 * MemoryCacheStore seam (TS-CA-007 asserts 001–004 equivalence).
 * @module @ling2/ling-cache/tests/cache
 */

import { Context, type Fiber } from '@ling2/ling-coris'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Cache, { CacheError, MemoryCacheStore, cacheStoreServiceKey } from '../src/index.ts'
import { CacheStoreRegistry } from '../src/core/registry.ts'

describe('CacheStoreRegistry', () => {
  it('registers, resolves, and unregisters by name', () => {
    const registry = new CacheStoreRegistry()
    const store = new MemoryCacheStore()
    const dispose = registry.register('redis', store)
    expect(registry.names()).toEqual(['redis'])
    expect(registry.get('redis')).toBe(store)
    dispose()
    expect(registry.names()).toEqual([])
  })

  it('rejects duplicate names', () => {
    const registry = new CacheStoreRegistry()
    registry.register('redis', new MemoryCacheStore())
    expect(() => registry.register('redis', new MemoryCacheStore())).toThrow(CacheError)
    try {
      registry.register('redis', new MemoryCacheStore())
    } catch (error) {
      expect((error as CacheError).code).toBe('duplicate-store')
    }
  })

  it('fails loud on unknown names, listing what is registered (TS-CA-005 shape)', () => {
    const registry = new CacheStoreRegistry()
    registry.register('redis', new MemoryCacheStore())
    expect(() => registry.get('nope')).toThrow(/'nope' is not registered \(registered: redis\)/)
    expect(() => registry.get('nope')).toThrow(CacheError)
    try {
      registry.get('nope')
    } catch (error) {
      expect((error as CacheError).code).toBe('store-not-found')
    }
  })

  it('a stale disposer cannot remove a successor registration', () => {
    const registry = new CacheStoreRegistry()
    const first = new MemoryCacheStore()
    const second = new MemoryCacheStore()
    const disposeFirst = registry.register('redis', first)
    disposeFirst()
    const disposeSecond = registry.register('redis', second)
    disposeFirst() // stale: fires again after the successor registered
    expect(registry.get('redis')).toBe(second)
    disposeSecond()
    expect(registry.names()).toEqual([])
  })
})

describe('MemoryCacheStore (TS-CA-007: 001–004 semantics)', () => {
  let store: MemoryCacheStore

  beforeEach(() => {
    vi.useFakeTimers()
    store = new MemoryCacheStore()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('TS-CA-001: set then immediate get returns the value; ttl ∈ (0, ttlSec]', async () => {
    await store.set('k', 'val', 300)
    expect(await store.get('k')).toBe('val')
    const remaining = await store.ttl('k')
    expect(remaining).toBeGreaterThan(0)
    expect(remaining).toBeLessThanOrEqual(300)
  })

  it('TS-CA-001 edge: persistent key answers -1, missing key answers -2', async () => {
    await store.set('forever', 'v')
    expect(await store.ttl('forever')).toBe(-1)
    expect(await store.ttl('never-set')).toBe(-2)
  })

  it('TS-CA-002: a 1s TTL expires; get misses and keys no longer contain it', async () => {
    await store.set('p:gone', 'v', 1)
    expect(await store.get('p:gone')).toBe('v')
    vi.advanceTimersByTime(1000)
    expect(await store.get('p:gone')).toBeUndefined()
    expect(await store.keys('p:')).toEqual([])
    expect(await store.ttl('p:gone')).toBe(-2)
  })

  it('TS-CA-002 edge: set without TTL is persistent and overwrites a previous expiry', async () => {
    await store.set('k', 'first', 1)
    vi.advanceTimersByTime(500)
    await store.set('k', 'second')
    vi.advanceTimersByTime(10_000)
    expect(await store.get('k')).toBe('second')
    expect(await store.ttl('k')).toBe(-1)
  })

  it('TS-CA-003: delPrefix removes every key of the prefix and leaves others untouched', async () => {
    await store.set('auth:a', 1)
    await store.set('auth:b', 2)
    await store.set('auth:c', 3)
    await store.set('other:x', 4)
    const deleted = await store.delPrefix('auth:')
    expect(deleted).toBe(3)
    expect(await store.keys('auth:')).toEqual([])
    expect(await store.get('other:x')).toBe(4)
    expect(await store.delPrefix('auth:')).toBe(0)
  })

  it('TS-CA-003 edge: delPrefix counts only live keys; expired ones already read as absent', async () => {
    await store.set('auth:dead', 1, 1)
    await store.set('other:live', 2)
    vi.advanceTimersByTime(1000)
    expect(await store.delPrefix('auth:')).toBe(0)
    expect(await store.keys('auth:')).toEqual([])
    expect(await store.get('other:live')).toBe(2)
  })

  it('TS-CA-004: ten concurrent incrBy(1) land on 10 (atomic in-process)', async () => {
    await Promise.all(Array.from({ length: 10 }, () => store.incrBy('count', 1)))
    expect(await store.get('count')).toBe(10)
  })

  it('TS-CA-004 edge: missing key starts at 0; negative deltas apply; TTL set/kept per call', async () => {
    expect(await store.incrBy('n', 5)).toBe(5)
    expect(await store.incrBy('n', -2)).toBe(3)
    await store.incrBy('n', 1, 300)
    const remaining = await store.ttl('n')
    expect(remaining).toBeGreaterThan(0)
    expect(remaining).toBeLessThanOrEqual(300)
    await store.incrBy('n', 1) // no TTL: keeps the current expiry
    expect(await store.ttl('n')).toBeLessThanOrEqual(300)
    expect(await store.get('n')).toBe(5)
  })

  it('values round-trip as JSON documents, matching the Redis provider seam', async () => {
    const value = { list: [1, 'two', { three: true }], none: null }
    await store.set('json', value)
    expect(await store.get('json')).toEqual(value)
    const shared = { n: 1 }
    await store.set('a', shared)
    shared.n = 2
    expect(await store.get('a')).toEqual({ n: 1 })
  })

  it('rejects non-JSON values, non-positive or fractional TTLs, and non-numeric incrBy targets loudly', async () => {
    await expect(store.set('bad', undefined)).rejects.toThrow(CacheError)
    await expect(store.set('bad', () => 1)).rejects.toThrow(CacheError)
    await expect(store.set('bad', 'v', 0)).rejects.toThrow(CacheError)
    await expect(store.set('bad', 'v', -5)).rejects.toThrow(CacheError)
    await expect(store.set('bad', 'v', 1.5)).rejects.toThrow(CacheError)
    await store.set('str', 'not-a-number')
    await expect(store.incrBy('str', 1)).rejects.toThrow(CacheError)
    try {
      await store.set('bad', undefined)
    } catch (error) {
      expect((error as CacheError).code).toBe('invalid-value')
    }
  })

  it('del on a missing key is a no-op', async () => {
    await expect(store.del('nothing')).resolves.toBeUndefined()
  })

  it('setNx writes only when absent (SET NX EX 语义)；ten concurrent acquires yield exactly one winner', async () => {
    const winners = await Promise.all(Array.from({ length: 10 }, () => store.setNx('lock:dir', 'true', 60)))
    expect(winners.filter(Boolean)).toHaveLength(1)
    expect(await store.get('lock:dir')).toBe('true')
    const remaining = await store.ttl('lock:dir')
    expect(remaining).toBeGreaterThan(0)
    expect(remaining).toBeLessThanOrEqual(60)
    // 已持有时 false；del 后可重新占位
    await expect(store.setNx('lock:dir', 'true', 60)).resolves.toBe(false)
    await store.del('lock:dir')
    await expect(store.setNx('lock:dir', 'again')).resolves.toBe(true)
    expect(await store.ttl('lock:dir')).toBe(-1)
  })

  it('setNx treats an expired key as absent and rejects the same invalid inputs as set', async () => {
    expect(await store.setNx('k', 1, 1)).toBe(true)
    vi.advanceTimersByTime(1000)
    expect(await store.setNx('k', 2, 1)).toBe(true)
    expect(await store.get('k')).toBe(2)
    await expect(store.setNx('bad', undefined)).rejects.toThrow(CacheError)
    await expect(store.setNx('bad', 'v', 0)).rejects.toThrow(CacheError)
  })
})

describe('ctx.cache hub mount', () => {
  /** Mount the hub plus a fake provider row shaped like the redis provider. */
  async function mountFakeProvider(): Promise<{ ctx: Context; fiber: Fiber; store: MemoryCacheStore }> {
    const store = new MemoryCacheStore()
    const ctx = new Context()
    await ctx.plugin(Cache)
    const fiber = await ctx.plugin({
      name: 'cache-fake-provider',
      inject: ['cache'],
      apply(innerCtx: Context) {
        innerCtx.effect(() => {
          const dispose = innerCtx.cache.store.register('redis', store)
          return () => {
            dispose()
            store.clear()
          }
        }, 'cache-fake.registerStore')
      },
    })
    return { ctx, fiber, store }
  }

  it('TS-CA-005: unregistered names fail loud through ctx.cache, listing available names', async () => {
    const { ctx, fiber } = await mountFakeProvider()
    try {
      expect(() => ctx.cache.store.get('nope')).toThrow(/'nope' is not registered \(registered: redis\)/)
      expect(() => ctx.cache.store.get('nope')).toThrow(CacheError)
    } finally {
      await fiber.dispose()
    }
  })

  it('TS-CA-006: provider disposal recycles the registration; later access fails loud, nothing leaks', async () => {
    const { ctx, fiber, store } = await mountFakeProvider()
    await store.set('login_token_x', 'token', 60)
    await fiber.dispose()
    expect(ctx.cache.store.names()).toEqual([])
    expect(() => ctx.cache.store.get('redis')).toThrow(/'redis' is not registered \(registered: none\)/)
    // the fake provider's disposer recycled the store with it
    expect(await store.keys('')).toEqual([])
  })

  it('derives the lifecycle service key providers fence on', () => {
    expect(cacheStoreServiceKey('redis')).toBe('cache.store.redis')
  })
})
