/**
 * 键式延迟任务队列单测（MemoryCacheStore 承载+进程内回落两形态）：入队→轮询
 * 成功出队（完成即删）/未到期跳过/失败重试退避（nextRunAt 后移）至死信落键/
 * 认领互斥（他方持有=跳过）/store 缺席进程内回落端到端。
 * @module @ling2/ling-cache/tests/queue
 */

import { beforeEach, describe, expect, it } from 'vitest'
import {
  MemoryCacheStore, enqueueQueueTask, memoryDeadLetters, pollQueueOnce, resetMemoryQueue,
  taskQueueBackoffMs,
} from '../src/index.ts'
import type { QueueMessage, TaskQueueStore } from '../src/index.ts'

/** 步进时钟（重试退避跳等待——不真睡）。 */
function stepper(): { now: () => Date; advance: (ms: number) => void } {
  let cur = Date.parse('2026-10-21T08:00:00Z')
  return { now: () => new Date(cur), advance: ms => { cur += ms } }
}

describe('enqueueQueueTask + pollQueueOnce（MemoryCacheStore 承载）', () => {
  let store: MemoryCacheStore

  beforeEach(() => {
    store = new MemoryCacheStore()
    resetMemoryQueue()
  })

  it('入队→轮询：handler 收到消息；完成即删（item/active 键双清）', async () => {
    const clock = stepper()
    const id = await enqueueQueueTask(store, 'q1', 'demo', { x: 1 }, clock.now)
    const seen: QueueMessage[] = []
    const consumed = await pollQueueOnce({ store, queue: 'q1', handler: async m => { seen.push(m) }, now: clock.now })
    expect(consumed).toBe(true)
    expect(seen).toHaveLength(1)
    expect(seen[0]!.id).toBe(id)
    expect(seen[0]!.type).toBe('demo')
    expect(seen[0]!.payload).toEqual({ x: 1 })
    expect(seen[0]!.attempt).toBe(0)
    expect(await store.keys('taskq:q1:item:')).toEqual([])
    expect(await store.keys('taskq:q1:active:')).toEqual([])
    // 已空队列再轮询=false（不空转）
    expect(await pollQueueOnce({ store, queue: 'q1', handler: async () => undefined, now: clock.now })).toBe(false)
  })

  it('未到期消息跳过（nextRunAt 在未来）', async () => {
    const clock = stepper()
    await enqueueQueueTask(store, 'q2', 'demo', {}, clock.now)
    const before = new Date(clock.now().getTime() - 1000)
    let ran = 0
    const consumed = await pollQueueOnce({ store, queue: 'q2', handler: async () => { ran += 1 }, now: () => before })
    expect(consumed).toBe(false)
    expect(ran).toBe(0)
    expect(await pollQueueOnce({ store, queue: 'q2', handler: async () => { ran += 1 }, now: clock.now })).toBe(true)
    expect(ran).toBe(1)
  })

  it('失败重试：退避期内跳过；连续失败至 MaxRetry(3) 耗尽落死信键', async () => {
    const clock = stepper()
    await enqueueQueueTask(store, 'q3', 'boom', {}, clock.now)
    const handler = async (): Promise<never> => { throw new Error('执行失败注入') }
    // 第 1 次执行失败 → attempt=1，退避 [8s,9s] 内跳过
    expect(await pollQueueOnce({ store, queue: 'q3', handler, now: clock.now })).toBe(true)
    expect(await pollQueueOnce({ store, queue: 'q3', handler, now: clock.now })).toBe(false)
    clock.advance(taskQueueBackoffMs(1) + 1000)
    expect(await pollQueueOnce({ store, queue: 'q3', handler, now: clock.now })).toBe(true)
    clock.advance(taskQueueBackoffMs(2) + 1000)
    expect(await pollQueueOnce({ store, queue: 'q3', handler, now: clock.now })).toBe(true)
    clock.advance(taskQueueBackoffMs(3) + 1000)
    // 第 4 次执行失败 → attempt=4 > MaxRetry(3) → 死信
    expect(await pollQueueOnce({ store, queue: 'q3', handler, now: clock.now })).toBe(true)
    const deadKeys = await store.keys('taskq:q3:dead:')
    expect(deadKeys).toHaveLength(1)
    const dead = await store.get<{ message: QueueMessage; error: string }>(deadKeys[0]!)
    expect(dead!.error).toBe('执行失败注入')
    expect(dead!.message.attempt).toBe(4)
    expect(await store.keys('taskq:q3:item:')).toEqual([])
    expect(await store.keys('taskq:q3:active:')).toEqual([])
  })

  it('认领互斥：他方持有 active 租约=跳过不执行', async () => {
    const clock = stepper()
    const id = await enqueueQueueTask(store, 'q4', 'demo', {}, clock.now)
    await store.setNx(`taskq:q4:active:${id}`, 'other-worker', 600)
    let ran = 0
    expect(await pollQueueOnce({ store, queue: 'q4', handler: async () => { ran += 1 }, now: clock.now })).toBe(false)
    expect(ran).toBe(0)
  })
})

describe('进程内回落（store=undefined）', () => {
  beforeEach(() => {
    resetMemoryQueue()
  })

  it('入队+轮询端到端；死信走 memoryDeadLetters 排障读取', async () => {
    const clock = stepper()
    await enqueueQueueTask(undefined, 'q5', 'boom', {}, clock.now)
    const handler = async (): Promise<never> => { throw new Error('回落形态失败') }
    for (let i = 1; i <= 4; i += 1) {
      expect(await pollQueueOnce({ store: undefined, queue: 'q5', handler, now: clock.now })).toBe(true)
      clock.advance(taskQueueBackoffMs(i) + 1000) // 按次退避步进（8/16/32s 指数增长）
    }
    const dead = memoryDeadLetters('q5')
    expect(dead).toHaveLength(1)
    expect(dead[0]!.error).toBe('回落形态失败')
    // 死信后队列空
    expect(await pollQueueOnce({ store: undefined, queue: 'q5', handler, now: clock.now })).toBe(false)
  })

  it('两队列互不串扰（键路径按 queue 隔离）', async () => {
    const clock = stepper()
    await enqueueQueueTask(undefined, 'qa', 'demo', { which: 'a' }, clock.now)
    await enqueueQueueTask(undefined, 'qb', 'demo', { which: 'b' }, clock.now)
    const seen: string[] = []
    await pollQueueOnce({ store: undefined, queue: 'qa', handler: async m => { seen.push(String(m.payload['which'])) }, now: clock.now })
    await pollQueueOnce({ store: undefined, queue: 'qb', handler: async m => { seen.push(String(m.payload['which'])) }, now: clock.now })
    expect(seen.sort()).toEqual(['a', 'b'])
  })
})

describe('TaskQueueStore 结构缝（真 CacheStore 直接兼容）', () => {
  it('MemoryCacheStore 满足 TaskQueueStore 结构（编译面+运行面双证）', async () => {
    const store: TaskQueueStore = new MemoryCacheStore()
    const clock = stepper()
    await enqueueQueueTask(store, 'q6', 'demo', {}, clock.now)
    expect(await pollQueueOnce({ store, queue: 'q6', handler: async () => undefined, now: clock.now })).toBe(true)
  })
})
