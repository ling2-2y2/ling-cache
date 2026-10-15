/**
 * Redis provider for the `ctx.cache` hub. One roster row mounts one named
 * store (`config.cache`) with its own ioredis connection; mounting the same
 * server twice under different names is the supported way to reach two
 * logical databases. The provider opens eagerly inside `apply`, so an
 * unreachable server or refused credentials fail the row at load instead of
 * the first command — no silent fallback, ever.
 * @module @ling2/ling-dsh-cache/cache-redis
 */

import type { Context } from '@ling2/ling-cordis'
import { schemastery as z } from '@ling2/ling-cordis'
import { cacheStoreServiceKey } from '../core/index.ts'
import { RedisCacheStore } from './store.ts'

export { RedisCacheStore } from './store.ts'
export type { RedisCacheStoreOptions } from './store.ts'

/** Cordis plugin name. */
export const name = 'cache-redis'
/** The provider registers on the cache hub. */
export const inject = ['cache']

/**
 * Default client-side connect budget; generous so a booting host's plugin
 * compilation load cannot starve the first handshake.
 */
export const DEFAULT_CONNECT_TIMEOUT_MS = 10_000

/** Plugin configuration. Host/port/password arrive from the host's wiring (interpolated from its environment). */
export interface Config {
  /** Registry name consumers resolve this store by; defaults to `redis`. */
  cache: string
  /** Redis server host. */
  host: string
  /** Redis server port; defaults to 6379. */
  port: number
  /** AUTH password; empty string (default) means no authentication. */
  password: string
  /** Logical database index; defaults to 0. */
  db: number
  /** Client-side connect budget in milliseconds; defaults to 10000. */
  connectTimeoutMs: number
}

/** Schemastery validator for {@link Config}. */
export const Config: z<Config> = z.object({
  cache: z.string().default('redis'),
  host: z.string().required(),
  port: z.number().step(1).min(1).max(65535).default(6379),
  password: z.string().default(''),
  db: z.number().step(1).min(0).default(0),
  connectTimeoutMs: z.number().step(1).min(100).max(600_000).default(DEFAULT_CONNECT_TIMEOUT_MS),
})

/**
 * Open one Redis connection and register it on the hub. The disposer
 * unregisters the name first, then disconnects the client (registry
 * consumers can never observe a name backed by a dead connection).
 * @param ctx - Plugin context (must inject `cache`).
 * @param config - Validated plugin configuration.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const store = new RedisCacheStore({
    name: config.cache,
    host: config.host,
    port: config.port,
    password: config.password,
    db: config.db,
    connectTimeoutMs: config.connectTimeoutMs,
  })
  await store.open()
  ctx.effect(() => {
    const dispose = ctx.cache.store.register(config.cache, store)
    return async () => {
      dispose()
      await store.close()
    }
  }, 'cache-redis.registerStore')
  ctx.provide(cacheStoreServiceKey(config.cache), store)
}
