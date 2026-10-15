/**
 * Consumer-facing contracts of the cache hub: one store shape and the
 * normalization rules every provider honors. The hub standardizes storage
 * transport (JSON values, TTL seconds, prefix operations); key naming and
 * TTL policy are consumer-owned — `keys.ts` carries the Ling replica for
 * consumers that must stay wire-compatible with Ling Cloud.
 * @module dsh-cache/src/types
 */

/**
 * One named cache store mounted on the hub. A provider row (e.g.
 * the redis provider) owns the connection; consumers never see connection
 * mechanics, only this facade. All values are JSON documents: non-JSON
 * numbers (NaN, Infinity) coerce to `null`, and `undefined`, functions,
 * and symbols are rejected loudly at `set`/`incrBy` time.
 */
export interface CacheStore {
  /**
   * Read one key's value.
   * @param key - Cache key (Ling literal, tenant-prefixed by the caller).
   * @returns the JSON-decoded value, or `undefined` when missing or expired.
   */
  get<T = unknown>(key: string): Promise<T | undefined>
  /**
   * Write one key's value, replacing any previous value and clearing its
   * previous expiry (Redis SET semantics).
   * @param key - Cache key.
   * @param value - JSON-representable value; `undefined`/functions/symbols
   * throw `CacheError('invalid-value')`.
   * @param ttlSec - Lifetime in seconds; omitted means persistent. Must be a
   * positive whole number when given.
   */
  set(key: string, value: unknown, ttlSec?: number): Promise<void>
  /**
   * Delete one key. Deleting a missing key is a no-op, never an error.
   * @param key - Cache key.
   */
  del(key: string): Promise<void>
  /**
   * Delete every live key starting with `prefix`.
   * @param prefix - Key prefix, e.g. `getUserAuthorize('000')`.
   * @returns the number of keys removed.
   */
  delPrefix(prefix: string): Promise<number>
  /**
   * Write one key's value only when the key is absent (Redis `SET NX [EX]`
   * semantics) — the atomic primitive behind distributed locks and dedup
   * sets (Ling's `redisUtil.exists` + `insert` check-then-write pairs are
   * its in-process ancestors).
   * @param key - Cache key.
   * @param value - JSON-representable value; same rejection rules as
   * {@link CacheStore.set}.
   * @param ttlSec - Lifetime in seconds; omitted means persistent. Must be a
   * positive whole number when given.
   * @returns `true` when the key was newly written; `false` when a live key
   * already existed (an expired key counts as absent).
   */
  setNx(key: string, value: unknown, ttlSec?: number): Promise<boolean>
  /**
   * Atomically add `delta` to the integer stored at `key`; a missing key
   * counts as 0 (Redis INCRBY semantics). Incrementing a non-numeric value
   * fails loud.
   * @param key - Cache key.
   * @param delta - Integer (positive or negative) to add.
   * @param ttlSec - When given, sets or overwrites the expiry after the
   * increment; when omitted the key keeps its current expiry state.
   * @returns the value after the increment.
   */
  incrBy(key: string, delta: number, ttlSec?: number): Promise<number>
  /**
   * List live keys starting with `prefix` (scan-based; unordered).
   * Policy filtering — e.g. Ling's `findKeysContaining` excluding
   * `idgenerator_` and lock keys — is consumer-owned, not store behavior.
   * @param prefix - Key prefix; `''` lists every key.
   * @returns the matching key literals.
   */
  keys(prefix: string): Promise<string[]>
  /**
   * Remaining lifetime in seconds: `-1` when persistent, `-2` when missing
   * or expired (Redis TTL semantics, matching Ling's
   * `RedisUtil.getLiveTime`).
   * @param key - Cache key.
   * @returns remaining seconds, `-1`, or `-2`.
   */
  ttl(key: string): Promise<number>
}
