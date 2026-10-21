/**
 * Token lock orchestration over a scripted raw-command fake. The two Lua
 * scripts are exercised byte-for-byte against a live Redis in an
 * environment-gated integration suite; here the fake stands in for the
 * server so the ownership/renewal/release *choreography* is pinned without
 * infrastructure. (Same split as the queue suite: fake in unit, real server
 * gated by `DSH_REDIS_URL`.)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  LockOwnershipLostError, acquireLock, newLockToken,
  releaseLock, renewLock, tryAcquireLock, withRenewableLock,
} from '../../src/cache-redis/token-lock.ts'
import type { RedisRawCommands } from '../../src/cache-redis/raw-commands.ts'

/** Scripted store: `eval` replies are consumed from a queue, everything else is recorded. */
function scriptedStore(replies: Array<{ match: RegExp; value: unknown }>): { store: RedisRawCommands; evals: Array<{ keys: string[]; args: string[] }> } {
  const evals: Array<{ keys: string[]; args: string[] }> = []
  const store: RedisRawCommands = {
    get: async () => null,
    setNx: async () => true,
    setNxPx: async () => true,
    setPx: async () => undefined,
    del: async () => 1,
    exists: async () => 0,
    pExpire: async () => undefined,
    hGetAll: async () => ({}),
    async eval(script, keys, args) {
      evals.push({ keys, args })
      const hit = replies.find((r) => r.match.test(script))
      if (hit === undefined) throw new Error(`unexpected eval: ${script.slice(0, 40)}`)
      replies.splice(replies.indexOf(hit), 1)
      if (hit.value instanceof Error) throw hit.value
      return hit.value
    },
    scan: async () => ['0', []],
  }
  return { store, evals }
}

describe('token lock primitives', () => {
  it('compare-delete only reports released when the script deleted (token still owned)', async () => {
    const { store } = scriptedStore([{ match: /DEL/, value: 1 }])
    await expect(releaseLock(store, 'lock:k', 'tok')).resolves.toBe(true)
    const { store: miss } = scriptedStore([{ match: /DEL/, value: 0 }])
    await expect(releaseLock(miss, 'lock:k', 'tok')).resolves.toBe(false)
  })

  it('compare-renew honors the script verdict and rejects invalid leases', async () => {
    const { store } = scriptedStore([{ match: /PEXPIRE/, value: 1 }])
    await expect(renewLock(store, 'lock:k', 'tok', 1_000)).resolves.toBe(true)
    await expect(renewLock(store, 'lock:k', 'tok', 0)).rejects.toThrow('lease must be positive')
  })

  it('acquire retries on a false verdict then succeeds (jittered backoff path)', async () => {
    const { store, evals } = scriptedStore([])
    const setNxPx = store.setNxPx.bind(store)
    let calls = 0
    store.setNxPx = async (...args: Parameters<typeof setNxPx>) => {
      calls++
      return calls >= 3
    }
    await acquireLock(store, 'lock:k', 'tok', 1_000)
    expect(calls).toBe(3)
    expect(evals).toHaveLength(0)
  })

  it('acquire aborts when the caller signal fires mid-wait', async () => {
    const { store } = scriptedStore([])
    store.setNxPx = async () => false
    const controller = new AbortController()
    const pending = acquireLock(store, 'lock:k', 'tok', 1_000, controller.signal)
    setTimeout(() => controller.abort(), 10)
    await expect(pending).rejects.toThrow('aborted')
  })

  it('withRenewableLock: happy path runs fn, releases, and surfaces the fn value', async () => {
    const { store, evals } = scriptedStore([{ match: /DEL/, value: 1 }])
    const outcome = await withRenewableLock(store, 'lock:k', 10_000, 100, async () => 'done')
    expect(outcome).toBe('done')
    // 退出链恰一次比较释放（RELEASE 脚本含 DEL 原语）
    expect(evals).toHaveLength(1)
    expect(evals[0]!.keys).toEqual(['lock:k'])
  })

  it('withRenewableLock: failed renewal aborts ownership and joins the error into the outcome', async () => {
    const { store, evals } = scriptedStore([
      { match: /PEXPIRE/, value: new Error('renew lost') },
      { match: /DEL/, value: 1 },
    ])
    let ownershipSignal: AbortSignal | undefined
    const outcome = await withRenewableLock(store, 'lock:k', 10_000, 20, async ({ signal }) => {
      ownershipSignal = signal
      await new Promise((resolve) => setTimeout(resolve, 200))
      return 'ignored'
    }).then(() => null, (error: unknown) => error)
    // 单错直抛（fn 无错、释放成功——唯一错误=续期丢失）
    expect(outcome).toBeInstanceOf(LockOwnershipLostError)
    expect(ownershipSignal?.aborted).toBe(true)
    expect(evals.length).toBeGreaterThanOrEqual(2)
  })

  it('withRenewableLock: release deleting nothing with no renewal error = ownership lost', async () => {
    const { store } = scriptedStore([{ match: /DEL/, value: 0 }])
    await expect(withRenewableLock(store, 'lock:k', 10_000, 500, async () => 'ok'))
      .rejects.toThrow('ownership lost')
  })

  it('withRenewableLock rejects renewal intervals that are not inside the lease', async () => {
    const { store } = scriptedStore([])
    await expect(withRenewableLock(store, 'lock:k', 1_000, 1_000, async () => 'x'))
      .rejects.toThrow('renewal interval')
    await expect(withRenewableLock(store, 'lock:k', 1_000, 0, async () => 'x'))
      .rejects.toThrow('renewal interval')
  })

  it('newLockToken yields distinct hex tokens', () => {
    const a = newLockToken()
    const b = newLockToken()
    expect(a).toMatch(/^[0-9a-f]{32}$/)
    expect(a).not.toBe(b)
  })

  it('tryAcquireLock maps the SET NX PX verdict directly', async () => {
    const { store } = scriptedStore([])
    store.setNxPx = async () => false
    await expect(tryAcquireLock(store, 'lock:k', 'tok', 1_000)).resolves.toBe(false)
  })

  afterEach(() => { vi.restoreAllMocks() })
})
