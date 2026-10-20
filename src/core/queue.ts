/**
 * 键式延迟任务队列（分布式锁的姊妹原语）：基于 CacheStore 门面的最小延迟
 * 队列——消息=键（`taskq:{queue}:item:{id}`，JSON 值编解码由门面托管），
 * 认领=setNx 原子占位（多实例互斥；租约 TTL 到期自动失守，持有方崩溃后
 * 任务可被重新认领），重试=失败重写消息的 nextRunAt（MaxRetry 上限+指数
 * 退避 8s×2^(n-1)+抖动），完成=删除消息键（出队），重试耗尽=落 `dead:` 键
 * 留存死信（排障走键扫描）。轮询=秒级延迟档（调用方自带定时循环）。
 *
 * store 缺席=进程内 Map 回落（「cache 缺席回落进程内」立法同 createDistLock：
 * 单实例语义不变，跨重启持久让位给有 Redis store 的部署）。
 * @module @ling2/ling-cache/core/queue
 */
import { randomUUID } from 'node:crypto'

/** 队列存储缝：CacheStore 门面的结构子集（真件直接结构兼容，测试注假件）。 */
export interface TaskQueueStore {
  get<T = unknown>(key: string): Promise<T | undefined>
  set(key: string, value: unknown, ttlSec?: number): Promise<void>
  del(key: string): Promise<void>
  setNx(key: string, value: unknown, ttlSec?: number): Promise<boolean>
  keys(prefix: string): Promise<string[]>
}

/** 队列消息（键值；attempt=已执行次数，nextRunAt=ISO 时刻——到期才可认领）。 */
export interface QueueMessage {
  readonly id: string
  readonly type: string
  readonly payload: Record<string, unknown>
  readonly attempt: number
  readonly enqueuedAt: string
  readonly nextRunAt: string
}

/** worker 轮询间隔建议值（毫秒；秒级延迟档——调用方定时循环取用）。 */
export const TASK_QUEUE_POLL_MS = 1_000
/** 重试上限（首跑不计，总执行 ≤ maxRetry+1；缺省 3）。 */
export const TASK_QUEUE_MAX_RETRY = 3
/** 认领租约秒数（缺省 2 小时——残租约到期可重认领）。 */
export const TASK_QUEUE_LEASE_SEC = 2 * 60 * 60
/** 重试退避基数毫秒（第 n 次重试延迟 = base×2^(n-1)+0~1s 抖动）。 */
export const TASK_QUEUE_BACKOFF_BASE_MS = 8_000

const KEY_ROOT = 'taskq'

const itemKey = (queue: string, id: string): string => `${KEY_ROOT}:${queue}:item:${id}`
const activeKey = (queue: string, id: string): string => `${KEY_ROOT}:${queue}:active:${id}`
const deadKey = (queue: string, id: string): string => `${KEY_ROOT}:${queue}:dead:${id}`

// ── 进程内回落态（store 缺席形态；键路径与 Redis 布局一致，租约带到期检查） ──

const memoryItems = new Map<string, QueueMessage>()
const memoryActiveUntil = new Map<string, number>()
const memoryDead = new Map<string, { message: QueueMessage; error: string; failedAt: string }>()

/** 测试隔离钩（进程内回落态是模块单例——用例间清场）。 */
export function resetMemoryQueue(): void {
  memoryItems.clear()
  memoryActiveUntil.clear()
  memoryDead.clear()
}

/** 死信读取（store 缺席形态排障用；Redis 形态走 `taskq:{queue}:dead:` 前缀扫描）。 */
export function memoryDeadLetters(queue: string): ReadonlyArray<{ message: QueueMessage; error: string; failedAt: string }> {
  const prefix = deadKey(queue, '')
  return [...memoryDead.entries()].filter(([key]) => key.startsWith(prefix)).map(([, record]) => record)
}

/** 第 n 次重试的退避毫秒（n 从 1 计：8s/16s/32s+抖动）。 */
export function taskQueueBackoffMs(attempt: number, rng: () => number = Math.random): number {
  return TASK_QUEUE_BACKOFF_BASE_MS * 2 ** (attempt - 1) + Math.floor(rng() * 1000)
}

/**
 * 入队（store 缺席=进程内回落）。每次入队都是独立任务（不去重）——同业务键
 * 重复入队=两条独立消息，由幂等执行体消化。
 * @returns 任务 id（randomUUID）。
 */
export async function enqueueQueueTask(
  store: TaskQueueStore | undefined, queue: string, type: string,
  payload: Record<string, unknown>, now: () => Date = (): Date => new Date(),
): Promise<string> {
  const id = randomUUID()
  const at = now().toISOString()
  const message: QueueMessage = { id, type, payload, attempt: 0, enqueuedAt: at, nextRunAt: at }
  if (store === undefined) memoryItems.set(itemKey(queue, id), message)
  else await store.set(itemKey(queue, id), message)
  return id
}

/** 轮询选项（store 缺席=进程内回落；handler 抛错走重试/死信结算）。 */
export interface TaskQueuePollOptions {
  readonly store?: TaskQueueStore | undefined
  readonly queue: string
  readonly maxRetry?: number
  readonly leaseSec?: number
  readonly handler: (message: QueueMessage) => Promise<void>
  readonly now?: () => Date
  readonly rng?: () => number
}

/**
 * 轮询消费一圈（认领→执行→结算；每拍至多消化一条=串行并发 1，多实例部署靠
 * setNx 认领互斥）。未到期（nextRunAt 在未来）与他方持有的消息跳过。
 * @returns 本拍是否消化了消息（true=执行过一次 handler，成败均算）。
 */
export async function pollQueueOnce(options: TaskQueuePollOptions): Promise<boolean> {
  const { store, queue, handler } = options
  const maxRetry = options.maxRetry ?? TASK_QUEUE_MAX_RETRY
  const leaseSec = options.leaseSec ?? TASK_QUEUE_LEASE_SEC
  const now = options.now ?? ((): Date => new Date())
  const nowMs = now().getTime()
  const prefix = `${KEY_ROOT}:${queue}:item:`
  const keys = store === undefined
    ? [...memoryItems.keys()].filter(key => key.startsWith(prefix))
    : await store.keys(prefix)
  for (const key of keys) {
    const candidate = store === undefined ? memoryItems.get(key) : await store.get<QueueMessage>(key)
    if (candidate === undefined || Date.parse(candidate.nextRunAt) > nowMs) continue
    // 认领=setNx 原子占位（租约 TTL——持有方崩溃后到期自动失守，可重认领）
    const won = store === undefined
      ? claimMemoryActive(activeKey(queue, candidate.id), nowMs, leaseSec)
      : await store.setNx(activeKey(queue, candidate.id), 'lease', leaseSec)
    if (!won) continue
    // 认领后重读（并发方可能已在两次读之间执行完毕并删除消息——空则释放租约）
    const message = store === undefined ? memoryItems.get(key) : await store.get<QueueMessage>(key)
    if (message === undefined) {
      if (store === undefined) memoryActiveUntil.delete(activeKey(queue, candidate.id))
      else await store.del(activeKey(queue, candidate.id))
      continue
    }
    try {
      await handler(message)
      await settleSuccess(store, queue, message.id)
    } catch (error: unknown) {
      await settleFailure(store, queue, message, error, { maxRetry, now, rng: options.rng })
    }
    return true
  }
  return false
}

/** 成功结算：消息删除（完成即出队）+租约释放。 */
async function settleSuccess(store: TaskQueueStore | undefined, queue: string, id: string): Promise<void> {
  if (store === undefined) {
    memoryItems.delete(itemKey(queue, id))
    memoryActiveUntil.delete(activeKey(queue, id))
    return
  }
  await store.del(itemKey(queue, id))
  await store.del(activeKey(queue, id))
}

/** 失败结算：attempt≤maxRetry 重写消息退避重试；耗尽落 dead 键（死信留存）。 */
async function settleFailure(
  store: TaskQueueStore | undefined, queue: string, message: QueueMessage, error: unknown,
  ctx: { maxRetry: number; now: () => Date; rng?: () => number },
): Promise<void> {
  const attempt = message.attempt + 1
  const summary = error instanceof Error ? error.message : String(error)
  if (store === undefined) memoryActiveUntil.delete(activeKey(queue, message.id))
  else await store.del(activeKey(queue, message.id))
  if (attempt <= ctx.maxRetry) {
    const retryAt = new Date(ctx.now().getTime() + taskQueueBackoffMs(attempt, ctx.rng)).toISOString()
    const next: QueueMessage = { ...message, attempt, nextRunAt: retryAt }
    if (store === undefined) memoryItems.set(itemKey(queue, message.id), next)
    else await store.set(itemKey(queue, message.id), next)
    return
  }
  const record = { message: { ...message, attempt } as QueueMessage, error: summary, failedAt: ctx.now().toISOString() }
  if (store === undefined) {
    memoryDead.set(deadKey(queue, message.id), record)
    memoryItems.delete(itemKey(queue, message.id))
    return
  }
  await store.set(deadKey(queue, message.id), record)
  await store.del(itemKey(queue, message.id))
}

/** 进程内认领（残租约到期=lazy 失守——与 Redis TTL 同语义）。 */
function claimMemoryActive(key: string, nowMs: number, leaseSec: number): boolean {
  const until = memoryActiveUntil.get(key)
  if (until !== undefined && until > nowMs) return false
  memoryActiveUntil.set(key, nowMs + leaseSec * 1000)
  return true
}
