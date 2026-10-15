/**
 * Redis implementation of the {@link CacheStore} facade: one ioredis client
 * per provider row, JSON values via the hub codec, TTL/prefix/incrBy mapped
 * onto native commands (SET EX, SCAN+DEL, INCRBY[+EXPIRE], TTL). The client
 * is created with internal retries disabled; transient handshake failures
 * are retried a bounded number of times here instead, mirroring
 * dsh-rdb-mysql's pool bootstrap.
 * @module dsh-cache-redis/src/store
 */

import Redis from 'ioredis'
import {
  CacheError,
  assertTtlSec,
  decodeCacheValue,
  encodeCacheValue,
} from '../kit/index.ts'
import type { CacheStore } from '../core/index.ts'

/** Client options resolved by the provider row's config. */
export interface RedisCacheStoreOptions {
  /** Registry name this store mounts under. */
  readonly name: string
  /** Redis server host. */
  readonly host: string
  /** Redis server port. */
  readonly port: number
  /** AUTH password; empty string means no authentication. */
  readonly password: string
  /** Logical database index. */
  readonly db: number
  /** Client-side connect budget in milliseconds. */
  readonly connectTimeoutMs: number
}

/**
 * Handshake failures a bounded retry can survive: harness boot compiles many
 * plugin entries under tsx while the first Redis connection is established,
 * and that load can starve the handshake (same rationale as
 * dsh-rdb-mysql/src/pool.ts).
 */
const TRANSIENT_CONNECT_CODES = new Set(['ETIMEDOUT', 'ECONNRESET'])

/**
 * Pause before each retried handshake attempt; three attempts in total.
 */
const CONNECT_RETRY_DELAYS_MS = [1_000, 5_000] as const

/** SCAN page size, matching Ling's `findKeysContaining` count. */
const SCAN_COUNT = 1000

function isTransientConnectError(error: unknown): boolean {
  return typeof error === 'object' && error !== null
    && TRANSIENT_CONNECT_CODES.has(String((error as { code?: unknown }).code))
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** One named Redis store on the hub, owning its connection. */
export class RedisCacheStore implements CacheStore {
  private client: Redis | undefined
  private opening: Promise<void> | undefined

  constructor(private readonly options: RedisCacheStoreOptions) {}

  /** Registry name this store mounts under. */
  get name(): string {
    return this.options.name
  }

  /** ioredis connection status (`wait`/`connecting`/`ready`/`end`/…). */
  get status(): string {
    return this.client?.status ?? 'unopened'
  }

  /**
   * Open the connection and verify it reaches `ready`, so an unreachable
   * server or refused credentials reject the opener (fail loud at plugin
   * load) instead of the first command.
   * @returns settlement of the store's one open operation.
   */
  open(): Promise<void> {
    this.opening ??= this.openClient()
    return this.opening
  }

  /** Disconnect; idempotent and safe from any status. */
  async close(): Promise<void> {
    this.client?.disconnect()
  }

  private async openClient(): Promise<void> {
    for (const delayMs of CONNECT_RETRY_DELAYS_MS) {
      try {
        this.client = await this.attemptConnect()
        return
      } catch (error: unknown) {
        if (!isTransientConnectError(error)) throw error
        await sleep(delayMs)
      }
    }
    this.client = await this.attemptConnect()
  }

  /** Connect one fresh client to `ready`; transient-friendly, no internal retries. */
  private async attemptConnect(): Promise<Redis> {
    const client = new Redis({
      host: this.options.host,
      port: this.options.port,
      password: this.options.password || undefined,
      db: this.options.db,
      connectTimeout: this.options.connectTimeoutMs,
      lazyConnect: true,
      retryStrategy: () => null,
    })
    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error): void => {
          cleanup()
          reject(error)
        }
        const onReady = (): void => {
          cleanup()
          resolve()
        }
        const cleanup = (): void => {
          client.off('error', onError)
          client.off('ready', onReady)
        }
        client.once('error', onError)
        client.once('ready', onReady)
        client.connect().catch((error: Error) => {
          cleanup()
          reject(error)
        })
      })
    } catch (error: unknown) {
      client.disconnect()
      throw error
    }
    // Post-ready connection errors surface through command rejections; this
    // listener only keeps ioredis from logging them as unhandled events.
    client.on('error', () => {})
    return client
  }

  private conn(): Redis {
    if (this.client === undefined) {
      throw new CacheError(
        'store-closed',
        `cache store '${this.options.name}' has no open connection (open() it first)`,
      )
    }
    return this.client
  }

  async get<T = unknown>(key: string): Promise<T | undefined> {
    const raw = await this.conn().get(key)
    return raw === null ? undefined : decodeCacheValue<T>(raw)
  }

  async set(key: string, value: unknown, ttlSec?: number): Promise<void> {
    assertTtlSec(ttlSec)
    const raw = encodeCacheValue(value)
    if (ttlSec === undefined) {
      await this.conn().set(key, raw)
    } else {
      await this.conn().set(key, raw, 'EX', ttlSec)
    }
  }

  async setNx(key: string, value: unknown, ttlSec?: number): Promise<boolean> {
    assertTtlSec(ttlSec)
    const raw = encodeCacheValue(value)
    const client = this.conn()
    // SET key value NX [EX sec]：原子占位，返回 'OK' 即首次写入
    const result = ttlSec === undefined
      ? await client.set(key, raw, 'NX')
      : await client.set(key, raw, 'EX', ttlSec, 'NX')
    return result === 'OK'
  }

  async del(key: string): Promise<void> {
    await this.conn().del(key)
  }

  async delPrefix(prefix: string): Promise<number> {
    const matches = await this.scanKeys(`${prefix}*`)
    if (matches.length === 0) return 0
    return Number(await this.conn().del(...matches))
  }

  async incrBy(key: string, delta: number, ttlSec?: number): Promise<number> {
    assertTtlSec(ttlSec)
    const client = this.conn()
    if (ttlSec === undefined) {
      return Number(await client.incrby(key, delta))
    }
    const results = await client.multi().incrby(key, delta).expire(key, ttlSec).exec()
    const first = results?.[0]
    if (!first || first[0]) {
      throw first?.[0] ?? new CacheError('store-closed', `redis MULTI on '${key}' returned no result`)
    }
    return Number(first[1])
  }

  async keys(prefix: string): Promise<string[]> {
    return this.scanKeys(`${prefix}*`)
  }

  async ttl(key: string): Promise<number> {
    return Number(await this.conn().ttl(key))
  }

  /** Cursor-based prefix scan; never the blocking KEYS command. */
  private async scanKeys(pattern: string): Promise<string[]> {
    const client = this.conn()
    const found: string[] = []
    let cursor = '0'
    do {
      const [next, batch] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', SCAN_COUNT)
      cursor = next
      found.push(...batch)
    } while (cursor !== '0')
    return found
  }
}
