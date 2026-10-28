# ling-cache

面向 cordis 系 TypeScript 宿主的**缓存 hub**：在 `ctx.cache` 上挂载一个或多个命名缓存存储，按名字解析、面向同一份传输契约编码——内置内存实现、分布式锁和基于 ioredis 的 Redis 提供者。键名部分逐字复刻 Ling 的 `CacheKeyUtil`，保证跨系统 wire 兼容。

> English documentation see [README.md](./README.md)。

## 特性

- **Hub 不做 IO** —— `ctx.cache` 是命名存储注册表（`ctx.cache.store.get(name)`）；hub 自身不持有任何连接。提供者一行挂一个存储、自持驱动。
- **一份存储契约** —— `CacheStore`：`get` / `set` / `setNx` / `incrBy` / `del` / `delPrefix` / `keys` / `ttl`；值走 JSON 编解码，非 JSON 数字与函数一律 fail loud。
- **内存存储** —— `MemoryCacheStore` 即插即用，测试与单机形态首选。
- **Redis 提供者** —— `cache-redis`：一个存储一条 ioredis 连接；eager open fails loud（起服即暴露连接问题）；瞬态握手失败有界重试；注册即 effect 可逆（先除名后断连）。
- **分布式锁** —— `createDistLock`：`setNx` 原子占位 + 有界重试 + TTL 死锁兜底；`resolveStore` 缝注入——传存储=多实例互斥，传 `undefined`=进程内兜底。
- **延迟任务队列** —— `enqueueQueueTask` / `pollQueueOnce`：消息=键的持久延迟队列，跑在 `CacheStore` 门面上——`setNx` 认领租约（持有方崩溃后租约到期可重认领）+ 封顶指数退避重试 + 死信键；store 传 `undefined`=进程内回落。
- **令牌持有可续期锁** —— `cache-redis/token-lock.ts` 的 `withRenewableLock`：属主令牌 + 比较删除/比较续期两段 Lua（释放与续期只认属主）、获取抖动退避、所有权丢失显式上报；附裸命令窄面（`raw-commands.ts`），供需要在存储文本内匹配字段的比较改写型原语使用。
- **Ling 键名复刻** —— `CACHE_KEYS` + 键构造器 + TTL 常量逐字取自 Ling `CacheKeyUtil`，缓存键跨系统字节一致。**禁止改值**。

## 安装

```sh
npm install @ling2/ling-cache
# peer: @ling2/ling-coris ^2.0.0
```

## 快速上手

```ts
import { MemoryCacheStore, cacheKeyWithTenant, CACHE_KEYS } from '@ling2/ling-cache'

const memory = new MemoryCacheStore()
await memory.set(cacheKeyWithTenant('000000', CACHE_KEYS.getLoginToken('u1')), { token: '...' }, 300)
const session = await memory.get<{ token: string }>(cacheKeyWithTenant('000000', CACHE_KEYS.getLoginToken('u1')))
```

在 cordis 应用里挂载 hub 服务，然后注册存储：

```ts
import { Cache } from '@ling2/ling-cache'          // 也有 default 导出

// 宿主接线：ctx.plugin(Cache) 提供 ctx.cache
ctx.cache.store.register('memory', new MemoryCacheStore())
const store = ctx.cache.store.get('memory')
```

Redis 提供者经 cordis 插件（`cache-redis`）挂载：一行配置 = 一个命名存储 + 一条独立连接。

## 结构

```text
src/
├── index.ts        # 聚合根（hub 服务 + 再出口；default = Cache）
├── core/           # 注册表、Ling 键名复刻、分布式锁、内存实现、CacheStore 契约
├── kit/            # 零依赖 JSON 编解码 + CacheError
└── cache-redis/    # ioredis 提供者（cordis 插件）
```

## 开发

```sh
pnpm install
pnpm typecheck     # tsc --noEmit
pnpm test          # vitest（Redis 集成按 DSH_REDIS_URL 门控；无实例=skip 非 fail）
pnpm build         # tsdown（js）+ tsc d.ts 模块树 -> dist/
pnpm check:dts     # 外部消费者视角 d.ts 冒烟（符号/default/Context.cache 增强）
pnpm smoke         # 可跑示例：examples/memory-hub
```

## 环境变量

| 变量 | 消费方 | 示例 |
|---|---|---|
| `DSH_REDIS_URL` | `cache-redis` 集成测试（门控；缺省=skip 非失败） | `redis://:password@192.168.74.129:6379/15` |

门控套件务必指向**专用测试库**（示例的 db 15）：测试键按用例随机前缀并在用例后清理，但绝不要指向共享业务实例。

## 许可

[MIT](./LICENSE)
