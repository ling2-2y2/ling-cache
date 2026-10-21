/**
 * Raw Redis command face: the narrow, string-exact command set that
 * compare-and-set style primitives (token locks, Lua-guarded documents) need
 * and the JSON-codec {@link CacheStore} facade deliberately does not expose.
 * Values here are stored verbatim — no hub envelope, no codec — because Lua
 * scripts match field names inside the stored text.
 * @module @ling2/ling-cache/cache-redis/raw-commands
 */

import type { RedisCacheStore } from './store.ts'

/**
 * The raw command subset consumers may rely on. Every method maps 1:1 onto a
 * native Redis command; semantic concessions (expiry units, scan cursoring)
 * are documented per method and mirror the server's own behavior.
 */
export interface RedisRawCommands {
  /** GET — returns the stored string verbatim, or `null` when missing. */
  get(key: string): Promise<string | null>
  /** SET key value NX — create-if-absent with **no** expiry (persistent key). */
  setNx(key: string, value: string): Promise<boolean>
  /** SET key value PX ms NX — create-if-absent with a millisecond lease. */
  setNxPx(key: string, value: string, pxMs: number): Promise<boolean>
  /** SET key value PX ms — unconditional write with a millisecond lease. */
  setPx(key: string, value: string, pxMs: number): Promise<void>
  /** DEL — number of keys actually removed. */
  del(key: string): Promise<number>
  /** EXISTS — 1 when the key lives, 0 otherwise. */
  exists(key: string): Promise<number>
  /** PEXPIRE — millisecond expiry; no-op on a missing key. */
  pExpire(key: string, ms: number): Promise<void>
  /** HGETALL — empty object when the key is missing or not a hash. */
  hGetAll(key: string): Promise<Record<string, string>>
  /**
   * EVAL script keys args — the atomic channel for compare-and-* scripts.
   * Replies come back as the script produced them (integers as numbers,
   * `redis.error_reply` as a rejected promise whose message carries the
   * error text).
   */
  eval(script: string, keys: string[], args: string[]): Promise<unknown>
  /**
   * SCAN cursor MATCH match COUNT count — returns `[nextCursor, keys]`;
   * `'0'` as the next cursor means the full keyspace has been walked.
   */
  scan(cursor: string, match: string, count: number): Promise<[string, string[]]>
}

/** Adapter options for {@link createRawRedisCommands} over an open store. */
export type RawRedisCommandsOptions = Record<string, never>

/**
 * Bind a {@link RedisRawCommands} face onto a {@link RedisCacheStore}'s own
 * connection — one client, two facades. The store must be `open()`ed first;
 * every call goes through its connection guard, so a closed store rejects
 * with the store's own `store-closed` error instead of leaking a raw client.
 */
export function createRawRedisCommands(store: RedisCacheStore): RedisRawCommands {
  type IoredisClient = ReturnType<RedisCacheStore['rawConnection']>
  const conn = (): IoredisClient => store.rawConnection()
  const px = (ms: number): string => String(Math.max(1, Math.floor(ms)))
  return {
    async get(key) { return await conn().get(key) },
    async setNx(key, value) { return (await conn().set(key, value, 'NX')) === 'OK' },
    async setNxPx(key, value, pxMs) { return (await conn().set(key, value, 'PX', px(pxMs), 'NX')) === 'OK' },
    async setPx(key, value, pxMs) { await conn().set(key, value, 'PX', px(pxMs)) },
    async del(key) { return await conn().del(key) },
    async exists(key) { return await conn().exists(key) },
    async pExpire(key, ms) { await conn().pexpire(key, px(ms)) },
    async hGetAll(key) { return await conn().hgetall(key) },
    async eval(script, keys, args) { return await conn().eval(script, keys.length, ...keys, ...args) },
    async scan(cursor, match, count) {
      const [next, batch] = await conn().scan(cursor === '' ? '0' : cursor, 'MATCH', match, 'COUNT', String(count))
      return [next, batch as string[]]
    },
  }
}
