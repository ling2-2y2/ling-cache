/**
 * 分布式锁原语（dsh-cache 消费侧公共件，2026-10-06 gitSeed 手动播种批）：
 * `setNx` 原子抢锁 + TTL 死锁兜底（不续期）+ `del` 释放——Ling Lock4J 的
 * 最小对位（CACHE_KEYS.LOCK 前缀键族）。cache 行缺席时回落**进程内** Map
 * 单飞互斥（照 ling-dsh-admin/src/common/dist-sync.ts「cache 缺席回落进程
 * 内」先例：单机形态语义不变，多实例互斥让位给有 cache 的部署）。
 *
 * 键命名：消费方只传业务域键（如 `memory.gitseed`），实键恒为本包
 * `CACHE_KEYS.LOCK`（`lock:`）前缀——锁记录永不与业务键族相撞。
 * @module dsh-cache/src/lock
 */

import { randomUUID } from 'node:crypto'
import { CACHE_KEYS } from './keys.ts'
import type { CacheStore } from './types.ts'

/**
 * 一次抢锁的结果句柄：`ok=false` 表示重试耗尽锁仍被占（`release` 为安全
 * 空操作）；`ok=true` 表示已持锁，用毕**必须** `release()`（finally 语义）。
 */
export interface DistLockHandle {
  /** 是否抢到锁。 */
  ok: boolean
  /** 释放（= 删键）；未持锁时调用是安全空操作。 */
  release(): Promise<void>
}

/** {@link createDistLock} 依赖缝。 */
export interface DistLockDeps {
  /**
   * 存储解析缝：返回 CacheStore = 分布式形态（多实例互斥）；返回
   * undefined = 进程内兜底（单实例互斥）。
   */
  resolveStore: () => CacheStore | undefined
  /** 业务域锁键（不带 `lock:` 前缀，本件统一补 CACHE_KEYS.LOCK 前缀）。 */
  key: string
  /** 锁 TTL 秒数（死锁兜底，持锁方崩溃后自动过期；不续期）。缺省 600。 */
  ttlSec?: number
  /** 首抢失败后的重试次数（总尝试 = 1 + retries）。缺省 3。 */
  retries?: number
  /** 每次重试的间隔毫秒。缺省 2000。 */
  retryIntervalMs?: number
}

/**
 * 进程内兜底锁表（模块级：同进程所有锁件共享同一张表——「全局同一时刻
 * 至多一个持锁方」的语义在单机形态下不随 createDistLock 调用次数稀释）。
 * 值 = 持有者 owner（释放按键整删，与 CacheStore.del 路径同语义）。
 */
const processLocks = new Map<string, string>()

/**
 * 构造一把分布式锁：抢锁 = `setNx(实键, owner, ttl)` 原子占位；失败等
 * `retryIntervalMs` 再抢，共 `retries` 次重试，耗尽回 `{ ok: false }`；
 * 释放 = `del(实键)`。owner = randomUUID（占位值，便于 Redis 侧排障辨识）。
 * @param deps - 依赖缝（resolveStore/key 必填；TTL 与重试参数可选）。
 * @returns 锁件（`acquire()` 抢锁，返回 {@link DistLockHandle}）。
 */
export function createDistLock(deps: DistLockDeps): { acquire(): Promise<DistLockHandle> } {
  const ttlSec = deps.ttlSec ?? 600
  const retries = deps.retries ?? 3
  const retryIntervalMs = deps.retryIntervalMs ?? 2000
  const fullKey = CACHE_KEYS.LOCK + deps.key
  const sleep = (ms: number): Promise<void> => new Promise(resolve => { setTimeout(resolve, ms) })
  return {
    acquire: async (): Promise<DistLockHandle> => {
      const owner = randomUUID()
      for (let attempt = 0; ; attempt += 1) {
        const store = deps.resolveStore()
        let won: boolean
        if (store === undefined) {
          // 进程内兜底：Map 单飞互斥（同进程语义与 setNx 一致——缺席即占）
          won = !processLocks.has(fullKey)
          if (won) processLocks.set(fullKey, owner)
        } else {
          won = await store.setNx(fullKey, owner, ttlSec)
        }
        if (won) {
          return {
            ok: true,
            release: async () => {
              const holder = deps.resolveStore()
              if (holder === undefined) processLocks.delete(fullKey)
              else await holder.del(fullKey)
            },
          }
        }
        if (attempt >= retries) return { ok: false, release: async () => undefined }
        await sleep(retryIntervalMs)
      }
    },
  }
}
