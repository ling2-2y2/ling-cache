/**
 * Value codec shared by every {@link CacheStore}: values are JSON documents,
 * so the Redis provider and the in-memory fake observe identical round-trip
 * semantics. Ling stored JSON strings the same way
 * (`RedisUtil.toJson`, RedisUtil.java:197-203).
 * @module dsh-cache/src/codec
 */

import { CacheError } from './error.ts'

/**
 * Serialize one cache value for storage.
 * @param value - JSON-representable value. `undefined`, functions, and
 * symbols stringify to `undefined` and are rejected; BigInt throws the
 * engine TypeError. NaN and Infinity coerce to `null` per the JSON standard.
 * @returns the JSON document to store.
 * @throws {CacheError} `invalid-value` when the value has no JSON form.
 */
export function encodeCacheValue(value: unknown): string {
  const raw = JSON.stringify(value)
  if (raw === undefined) {
    throw new CacheError(
      'invalid-value',
      'cache values must be JSON-representable (undefined, function, or symbol have no JSON form)',
    )
  }
  return raw
}

/**
 * Deserialize one stored document.
 * @param raw - JSON document as stored by {@link encodeCacheValue}.
 * @returns the decoded value; corrupt documents reject with the engine
 * SyntaxError so data corruption surfaces loudly.
 */
export function decodeCacheValue<T>(raw: string): T {
  return JSON.parse(raw) as T
}

/**
 * Validate a TTL before it reaches a store, so both the Redis provider and
 * the in-memory fake reject the same inputs with the same error (Redis
 * `SET ... EX 0` would error server-side otherwise).
 * @param ttlSec - Lifetime in seconds, or `undefined` for persistent.
 * @throws {CacheError} `invalid-value` when given a non-integer or
 * non-positive TTL.
 */
export function assertTtlSec(ttlSec: number | undefined): void {
  if (ttlSec !== undefined && (!Number.isInteger(ttlSec) || ttlSec <= 0)) {
    throw new CacheError(
      'invalid-value',
      `ttlSec must be a positive whole number of seconds, got ${String(ttlSec)}`,
    )
  }
}
