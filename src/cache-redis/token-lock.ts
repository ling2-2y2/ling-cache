/**
 * Token-owned distributed lock with atomic renewal and release, over the raw
 * Redis command face. Callers must treat loss of ownership as loss of
 * exclusive access: the owner token is the only credential the compare-and-*
 * scripts honor, so a renewed lock can never be released or expired away by
 * a stale holder.
 *
 * Two Lua scripts carry the atomicity — compare-delete and compare-renew —
 * everything else is plain commands. Acquisition retries on a jittered
 * 25–75 ms backoff so a thundering herd of waiters spreads out instead of
 * hammering one key in lockstep.
 *
 * This is the stronger sibling of `core/lock.ts`: that primitive is
 * setNx+TTL+del (first-arrival release deletes anyone's lock, no renewal);
 * use this one when a holder may outlive its lease or releases must be
 * owner-checked (long critical sections, crash-recovery sweeps).
 * @module @ling2/ling-cache/cache-redis/token-lock
 */

import { randomBytes } from 'node:crypto'

import type { RedisRawCommands } from './raw-commands.ts'

/** Release gets its own budget: shutdown paths must not hang on a sick daemon. */
export const TOKEN_LOCK_RELEASE_TIMEOUT_MS = 5_000

/** Raised when exclusive ownership can no longer be guaranteed. */
export class LockOwnershipLostError extends Error {
  readonly code = 'redis-lock-ownership-lost'
  constructor(message = 'redis lock ownership lost') { super(message) }
}

/** compare-delete: DEL only while the stored value still equals our token. */
const RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
	return redis.call('DEL', KEYS[1])
end
return 0
`

/** compare-renew: PEXPIRE only while the stored value still equals our token. */
const RENEW_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
	return redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return 0
`

/** Random owner token (16 bytes hex) — the credential compare-and-* scripts match on. */
export function newLockToken(): string {
  return randomBytes(16).toString('hex')
}

function validateOperation(key: string, token: string, leaseMs: number): void {
  if (key === '' || token === '') throw new Error('redis lock key and token are required')
  if (!(leaseMs > 0)) throw new Error('redis lock lease must be positive')
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** One SET NX PX attempt; `true` when this caller wrote the key. */
export async function tryAcquireLock(
  client: RedisRawCommands, key: string, token: string, leaseMs: number,
): Promise<boolean> {
  validateOperation(key, token, leaseMs)
  try {
    return await client.setNxPx(key, token, leaseMs)
  } catch (error) {
    throw new Error(`acquire redis lock ${JSON.stringify(key)}: ${messageOf(error)}`)
  }
}

/**
 * Wait until acquired or the caller's signal aborts; retry backoff is a
 * random 25–75 ms so concurrent waiters de-synchronize.
 */
export async function acquireLock(
  client: RedisRawCommands, key: string, token: string, leaseMs: number, signal?: AbortSignal,
): Promise<void> {
  for (;;) {
    if (signal?.aborted === true) throw new Error('redis lock acquire aborted')
    if (await tryAcquireLock(client, key, token, leaseMs)) return
    const delayMs = 25 + (randomBytes(1)[0]! % 50)
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, delayMs)
      signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('redis lock acquire aborted')) }, { once: true })
    })
  }
}

/** Compare-delete: only a lock still owned by `token` goes away. */
export async function releaseLock(client: RedisRawCommands, key: string, token: string): Promise<boolean> {
  if (key === '' || token === '') throw new Error('redis lock key and token are required')
  try {
    return Number(await client.eval(RELEASE_SCRIPT, [key], [token])) !== 0
  } catch (error) {
    throw new Error(`release redis lock ${JSON.stringify(key)}: ${messageOf(error)}`)
  }
}

/** Compare-renew: only a lock still owned by `token` gets its lease extended. */
export async function renewLock(
  client: RedisRawCommands, key: string, token: string, leaseMs: number,
): Promise<boolean> {
  validateOperation(key, token, leaseMs)
  try {
    return Number(await client.eval(RENEW_SCRIPT, [key], [token, String(leaseMs)])) !== 0
  } catch (error) {
    throw new Error(`renew redis lock ${JSON.stringify(key)}: ${messageOf(error)}`)
  }
}

/**
 * Acquire, renew on an interval while `fn` runs, atomically release on exit.
 * A failed renewal aborts the ownership signal handed to `fn` (ownership is
 * gone; the critical section must stop trusting its exclusivity) and the
 * error joins the outcome. A release that deletes nothing — with no renewal
 * error to explain it — is reported as ownership lost, never swallowed.
 *
 * @param signal - caller cancellation for the acquisition wait only; `fn` is
 *   not cancelled by it (destructive cleanup outlives the request).
 */
export async function withRenewableLock<T>(
  client: RedisRawCommands,
  key: string,
  leaseMs: number,
  renewIntervalMs: number,
  fn: (ownership: { signal: AbortSignal }) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!(renewIntervalMs > 0) || renewIntervalMs >= leaseMs) {
    throw new Error('redis lock renewal interval must be positive and shorter than the lease')
  }
  const token = newLockToken()
  await acquireLock(client, key, token, leaseMs, signal)

  const ownership = new AbortController()
  let renewError: Error | undefined
  let settleRenewal: (() => void) | undefined
  const renewalDone = new Promise<void>((resolve) => { settleRenewal = resolve })
  const timer = setInterval(() => {
    void renewLock(client, key, token, leaseMs).then((renewed) => {
      if (renewed) return
      renewError = new LockOwnershipLostError(`redis lock ownership lost for ${JSON.stringify(key)}`)
      ownership.abort(renewError)
    }).catch((error: unknown) => {
      renewError = new LockOwnershipLostError(`redis lock ownership lost: ${messageOf(error)}`)
      ownership.abort(renewError)
    }).finally(() => {
      if (renewError !== undefined) {
        clearInterval(timer)
        settleRenewal?.()
      }
    })
  }, renewIntervalMs)
  timer.unref?.()

  let result: T | undefined
  let fnError: unknown
  try {
    result = await fn({ signal: ownership.signal })
  } catch (error) {
    fnError = error
  } finally {
    clearInterval(timer)
    settleRenewal?.()
    await renewalDone
  }

  let releaseError: Error | undefined
  try {
    const released = await Promise.race([
      releaseLock(client, key, token),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), TOKEN_LOCK_RELEASE_TIMEOUT_MS).unref?.()),
    ])
    if (!released && renewError === undefined) {
      releaseError = new LockOwnershipLostError(`redis lock ownership lost for ${JSON.stringify(key)}`)
    }
  } catch (error) {
    releaseError = error instanceof Error ? error : new Error(String(error))
  }

  const errors = [fnError, renewError, releaseError].filter((e) => e !== undefined)
  if (errors.length === 0) return result as T
  if (errors.length === 1) throw errors[0]
  throw new AggregateError(errors, `redis lock ${JSON.stringify(key)} lifecycle errors`)
}
