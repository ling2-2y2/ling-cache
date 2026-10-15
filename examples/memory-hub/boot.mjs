// 自含示例：内存存储挂上命名注册表，走一轮 set/get/锁原语后退出（pnpm smoke）。
// 消费者视角换包名 import 即同款：import { MemoryCacheStore, ... } from '@ling2/ling-cache'
import {
  CACHE_KEYS,
  CacheError,
  CacheStoreRegistry,
  MemoryCacheStore,
  assertTtlSec,
  cacheKeyWithTenant,
  createDistLock,
} from '../../src/index.ts'

const registry = new CacheStoreRegistry()
const memory = new MemoryCacheStore()
const dispose = registry.register('memory', memory)

// ① 值往返（含 TTL 语义）
await memory.set('demo:key', { hello: '世界' }, 60)
const roundtrip = await memory.get('demo:key')
if (roundtrip?.hello !== '世界') throw new Error('set/get 往返失败')
if ((await memory.get('demo:missing')) !== undefined) throw new Error('缺失键应返回 undefined')

// ② 分布式锁原语：首抢必中；同键二抢（零重试）必须 ok:false
const lock = createDistLock({ resolveStore: () => memory, key: 'demo', ttlSec: 5, retries: 0 })
const first = await lock.acquire()
if (!first.ok) throw new Error('首抢应成功')
const second = await lock.acquire()
if (second.ok) throw new Error('锁未互斥')
await first.release()
const third = await lock.acquire()
if (!third.ok) throw new Error('释放后应可重抢')
await third.release()

// ③ 键名复刻与 TTL 卫兵
const tenantKey = cacheKeyWithTenant('000000', CACHE_KEYS.LOGINTOKEN + 'u1')
if (!tenantKey.includes('000000')) throw new Error('租户前缀缺失')
let rejected = false
try {
  assertTtlSec(0)
} catch {
  rejected = true
}
if (!rejected) throw new Error('非法 TTL 应被拒绝')

// ④ 注册表语义：先除名，同名重挂；未知名 fail loud
dispose()
registry.register('memory', memory)
try {
  registry.get('nope')
  throw new Error('未知名应 fail loud')
} catch (e) {
  if (!(e instanceof CacheError)) throw e
}

console.log('smoke OK')
