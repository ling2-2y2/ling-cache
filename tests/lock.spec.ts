/**
 * 分布式锁单测（MemoryCacheStore 缝，照 tests/cache.spec.ts 姿势）：并发
 * 抢锁唯一胜者、释放后再抢、重试耗尽、进程内兜底互斥、TTL 过期再抢。
 * @module dsh-cache/tests/lock
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CacheStoreRegistry, MemoryCacheStore, createDistLock } from '../src/index.ts'
import type { CacheStore } from '../src/types.ts'

describe('createDistLock（CacheStore 承载）', () => {
  let store: MemoryCacheStore

  beforeEach(() => {
    store = new MemoryCacheStore()
  })

  it('并发 3 抢仅 1 胜，胜者锁键落在 lock: 前缀下', async () => {
    const lock = createDistLock({ resolveStore: () => store, key: 'memory.gitseed', ttlSec: 60, retries: 0 })
    const handles = await Promise.all([lock.acquire(), lock.acquire(), lock.acquire()])
    expect(handles.filter(h => h.ok)).toHaveLength(1)
    // 实键统一挂 CACHE_KEYS.LOCK（'lock:'）前缀——消费方业务键不裸落
    expect(await store.get('lock:memory.gitseed')).toBeTypeOf('string')
    const remaining = await store.ttl('lock:memory.gitseed')
    expect(remaining).toBeGreaterThan(0)
    expect(remaining).toBeLessThanOrEqual(60)
    // 败者 release 是安全空操作（不删胜者的锁）
    await Promise.all(handles.filter(h => !h.ok).map(h => h.release()))
    expect(await store.get('lock:memory.gitseed')).toBeTypeOf('string')
  })

  it('release 后可再抢；未持锁 release 是 no-op', async () => {
    const lock = createDistLock({ resolveStore: () => store, key: 'k', ttlSec: 60, retries: 0 })
    const first = await lock.acquire()
    expect(first.ok).toBe(true)
    await first.release()
    expect(await store.get('lock:k')).toBeUndefined()
    await first.release() // 重复释放：no-op 不炸
    const second = await lock.acquire()
    expect(second.ok).toBe(true)
  })

  it('重试耗尽回 ok:false（总尝试 = 1 + retries），重试间隔生效', async () => {
    const calls: string[] = []
    // 恒忙存储：原型链委托真 store、仅覆写 setNx 恒 false（锁被占）
    const busy: CacheStore = Object.assign(Object.create(store) as CacheStore, {
      async setNx(key: string): Promise<boolean> { calls.push(key); return false },
    })
    const holder = createDistLock({ resolveStore: () => store, key: 'k', ttlSec: 60, retries: 0 })
    expect((await holder.acquire()).ok).toBe(true)
    const t0 = Date.now()
    const lock = createDistLock({ resolveStore: () => busy, key: 'k', retries: 2, retryIntervalMs: 5 })
    const handle = await lock.acquire()
    expect(handle.ok).toBe(false)
    expect(calls).toHaveLength(3) // 首抢 + 2 重试
    expect(Date.now() - t0).toBeGreaterThanOrEqual(10) // 两次 5ms 间隔真等了
    await handle.release() // 败者释放不删持有者的锁
    expect(await store.get('lock:k')).toBeTypeOf('string')
  })

  it('TTL 过期后锁键视同缺席，可再抢（死锁兜底语义）', async () => {
    vi.useFakeTimers()
    try {
      const lock = createDistLock({ resolveStore: () => store, key: 'k', ttlSec: 1, retries: 0 })
      expect((await lock.acquire()).ok).toBe(true)
      vi.advanceTimersByTime(1000)
      // 不 release（模拟持锁方崩溃），TTL 过期后新抢直接成功
      expect((await lock.acquire()).ok).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('createDistLock（进程内兜底：resolveStore 回 undefined）', () => {
  // 模块级兜底表跨锁件共享——测试间用唯一键隔离
  const uniqueKey = `spec.${Date.now()}.${Math.random().toString(36).slice(2)}`

  it('同进程两把锁件同键互斥（Map 单飞），释放后可再抢', async () => {
    const a = createDistLock({ resolveStore: () => undefined, key: uniqueKey, retries: 0 })
    const b = createDistLock({ resolveStore: () => undefined, key: uniqueKey, retries: 0 })
    const first = await a.acquire()
    expect(first.ok).toBe(true)
    const second = await b.acquire()
    expect(second.ok).toBe(false) // 跨锁件实例互斥（模块级表）
    await first.release()
    expect((await b.acquire()).ok).toBe(true)
  })

  it('并发抢同键仅 1 胜（兜底形态与 setNx 形态同语义）', async () => {
    const lock = createDistLock({ resolveStore: () => undefined, key: uniqueKey + '.p', retries: 0 })
    const handles = await Promise.all([lock.acquire(), lock.acquire(), lock.acquire()])
    expect(handles.filter(h => h.ok)).toHaveLength(1)
    await Promise.all(handles.map(h => h.release()))
  })
})

describe('createDistLock（registry 缝）', () => {
  it('经 CacheStoreRegistry 注册的存储可作 resolveStore 缝消费', async () => {
    const registry = new CacheStoreRegistry()
    const store = new MemoryCacheStore()
    const dispose = registry.register('redis', store)
    const lock = createDistLock({
      resolveStore: () => (registry.names().includes('redis') ? registry.get('redis') : undefined),
      key: 'via-registry', retries: 0,
    })
    expect((await lock.acquire()).ok).toBe(true)
    dispose()
    // 卸载后 resolveStore 回 undefined——锁件自动落进程内兜底（不炸）
    const fallback = createDistLock({ resolveStore: () => undefined, key: 'via-registry.fallback', retries: 0 })
    expect((await fallback.acquire()).ok).toBe(true)
  })
})
