/**
 * Provider tests. The fail-loud and config suites run ungated against a
 * closed local port (no server needed). The remaining suites set
 * `DSH_REDIS_URL` (e.g. `redis://:password@192.168.74.129:6379/15` — use a
 * dedicated db) to run; without it they are skipped because no Redis server
 * ships with the repository. Keys are namespaced per test and cleaned up.
 * Covers TS-CA-001/002/003/004/006/008 on the Redis provider.
 * @module @ling2/ling-cache/tests/cache-redis/redis
 */

import { Context, type Fiber } from '@ling2/ling-cordis'
import { beforeEach, describe, expect, it } from 'vitest'
import Cache, { type CacheStore } from '../../src/index.ts'
import { apply, Config, DEFAULT_CONNECT_TIMEOUT_MS, type Config as ConfigType } from '../../src/cache-redis/index.ts'
import type { RedisCacheStore } from '../../src/cache-redis/store.ts'

const url = process.env.DSH_REDIS_URL
const hasServer = typeof url === 'string' && url.length > 0

describe('cache-redis config', () => {
  it('defaults cache name, port, password, db, and connect timeout', () => {
    const parse = Config as unknown as (value: unknown) => ConfigType
    expect(parse({ host: 'cache.example' })).toMatchObject({
      cache: 'redis',
      host: 'cache.example',
      port: 6379,
      password: '',
      db: 0,
      connectTimeoutMs: 10_000,
    })
  })
})

describe('cache-redis fail loud (TS-CA-008, no server needed)', () => {
  it('rejects the plugin row when Redis is unreachable, leaving the registry empty', async () => {
    const ctx = new Context()
    await ctx.plugin(Cache)
    const failure = ctx.plugin({ name: 'cache-redis', inject: ['cache'], apply },
      { cache: 'broken', host: '127.0.0.1', port: 1, connectTimeoutMs: 250 } satisfies ConfigType)
    await expect(failure).rejects.toThrow()
    expect(ctx.cache.store.names()).toEqual([])
  })

  it('does not silently fall back to another store', async () => {
    const ctx = new Context()
    await ctx.plugin(Cache)
    // a pre-registered store must not absorb the failed provider row's name
    ctx.cache.store.register('redis', {
      async get() { return 'phantom' },
      async set() {}, async del() {}, async delPrefix() { return 0 },
      async incrBy() { return 0 }, async keys() { return [] }, async ttl() { return -2 },
    })
    const failure = ctx.plugin({ name: 'cache-redis', inject: ['cache'], apply },
      { cache: 'redis', host: '127.0.0.1', port: 1, connectTimeoutMs: 250 } satisfies ConfigType)
    await expect(failure).rejects.toThrow()
  })
})

describe.skipIf(!hasServer)('cache-redis (requires DSH_REDIS_URL)', () => {
  /** Parse DSH_REDIS_URL into provider config; called from test bodies only (skipped suites still collect describe bodies). */
  function parseConnection(): Pick<ConfigType, 'host' | 'port' | 'password' | 'db'> {
    const redisUrl = new URL(url as string)
    return {
      host: redisUrl.hostname,
      port: Number(redisUrl.port || 6379),
      password: decodeURIComponent(redisUrl.password),
      db: redisUrl.pathname === '' || redisUrl.pathname === '/' ? 0 : Number(redisUrl.pathname.slice(1)),
    }
  }

  /** Per-test key namespace so a shared db never bleeds across tests. */
  let ns = ''

  beforeEach(() => {
    ns = `dsh-cache-test-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  })

  /** Mount the hub plus one provider row; resolve the registered store. */
  async function mount(cache: string): Promise<{ ctx: Context; fiber: Fiber; store: CacheStore }> {
    const ctx = new Context()
    await ctx.plugin(Cache)
    const fiber = await ctx.plugin({ name: 'cache-redis', inject: ['cache'], apply },
      { ...parseConnection(), cache, connectTimeoutMs: DEFAULT_CONNECT_TIMEOUT_MS } satisfies ConfigType)
    return { ctx, fiber, store: ctx.cache.store.get(cache) }
  }

  const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

  /** ioredis flips to `end` on the socket close event (one tick after disconnect); poll for it. */
  async function waitStatus(store: RedisCacheStore, target: string, timeoutMs = 2_000): Promise<string> {
    const deadline = Date.now() + timeoutMs
    let status = store.status
    while (status !== target && Date.now() < deadline) {
      await sleep(20)
      status = store.status
    }
    return status
  }

  it('TS-CA-001: set then immediate get returns the value; ttl ∈ (0, ttlSec]', async () => {
    const { fiber, store } = await mount('probe')
    try {
      await store.set(`${ns}:k`, 'val', 300)
      expect(await store.get(`${ns}:k`)).toBe('val')
      const remaining = await store.ttl(`${ns}:k`)
      expect(remaining).toBeGreaterThan(0)
      expect(remaining).toBeLessThanOrEqual(300)
      await store.set(`${ns}:forever`, 'v')
      expect(await store.ttl(`${ns}:forever`)).toBe(-1)
      expect(await store.ttl(`${ns}:never-set`)).toBe(-2)
    } finally {
      await store.delPrefix(ns)
      await fiber.dispose()
    }
  })

  it('TS-CA-002: a 1s TTL expires; get misses and keys no longer contain it', async () => {
    const { fiber, store } = await mount('probe')
    try {
      await store.set(`${ns}:gone`, 'v', 1)
      expect(await store.get(`${ns}:gone`)).toBe('v')
      await sleep(1_200)
      expect(await store.get(`${ns}:gone`)).toBeUndefined()
      expect(await store.keys(ns)).toEqual([])
      expect(await store.ttl(`${ns}:gone`)).toBe(-2)
    } finally {
      await store.delPrefix(ns)
      await fiber.dispose()
    }
  })

  it('TS-CA-003: delPrefix removes every key of the prefix and leaves others untouched', async () => {
    const { fiber, store } = await mount('probe')
    try {
      await store.set(`${ns}:auth:a`, 1)
      await store.set(`${ns}:auth:b`, 2)
      await store.set(`${ns}:auth:c`, 3)
      await store.set(`${ns}:other:x`, 4)
      expect(await store.delPrefix(`${ns}:auth:`)).toBe(3)
      expect(await store.keys(`${ns}:auth:`)).toEqual([])
      expect(await store.get(`${ns}:other:x`)).toBe(4)
      expect(await store.delPrefix(`${ns}:auth:`)).toBe(0)
    } finally {
      await store.delPrefix(ns)
      await fiber.dispose()
    }
  })

  it('TS-CA-004: ten concurrent incrBy(1, ttl) land on 10, atomically, with expiry set', async () => {
    const { fiber, store } = await mount('probe')
    try {
      const results = await Promise.all(Array.from({ length: 10 }, () => store.incrBy(`${ns}:count`, 1, 300)))
      expect([...results].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
      expect(await store.get(`${ns}:count`)).toBe(10)
      const remaining = await store.ttl(`${ns}:count`)
      expect(remaining).toBeGreaterThan(0)
      expect(remaining).toBeLessThanOrEqual(300)
    } finally {
      await store.delPrefix(ns)
      await fiber.dispose()
    }
  })

  it('round-trips JSON documents like the memory seam', async () => {
    const { fiber, store } = await mount('probe')
    try {
      const value = { list: [1, 'two', { three: true }], none: null }
      await store.set(`${ns}:json`, value)
      expect(await store.get(`${ns}:json`)).toEqual(value)
    } finally {
      await store.delPrefix(ns)
      await fiber.dispose()
    }
  })

  it('TS-CA-006: provider disposal recycles the registration; later access fails loud, connection ends', async () => {
    const { ctx, fiber, store } = await mount('recycled')
    await store.set(`${ns}:login_token_x`, 'token', 60)
    await fiber.dispose()
    expect(ctx.cache.store.names()).toEqual([])
    expect(() => ctx.cache.store.get('recycled')).toThrow(/'recycled' is not registered \(registered: none\)/)
    expect(await waitStatus(store as RedisCacheStore, 'end')).toBe('end')
  })
})
