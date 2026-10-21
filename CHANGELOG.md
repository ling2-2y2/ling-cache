# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本语义遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [1.2.0] - 2026-10-21

### 新增

- **令牌持有可续期分布式锁**（`cache-redis/token-lock.ts`）：属主令牌（16 字节 hex）+ 比较删除/比较续期两段 Lua——释放与续期只认仍归本令牌的锁；获取等待 25~75ms 随机抖动退避；`withRenewableLock` 运行期周期续期，续期失败即中止所有权信号并聚合入账，释放未删且续期无错=所有权丢失显式上报。`core/lock.ts`（setNx+TTL+del 简式）的长临界区强化姊妹件：持有方可能超过租期、或释放必须查属主时用本件。
- **裸命令窄面**（`cache-redis/raw-commands.ts`）：绕过 hub JSON 信封的原生命令子集（GET/SET NX/PX/DEL/EXISTS/PEXPIRE/HGETALL/EVAL/SCAN）——比较改写型原语（令牌锁、Lua 守护文档）需要在存储文本内匹配字段名，值必须逐字存储。`RedisCacheStore.rawConnection()` 暴露既有连接供适配（同一连接两面）。

## [1.1.0] - 2026-10-21

### 新增

- **键式延迟任务队列**（`core/queue.ts`，分布式锁的姊妹原语）：消息=键（`taskq:{queue}:item:{id}`）、认领=`setNx` 原子占位（租约 TTL 到期自动失守，持有方崩溃后可重认领）、失败重试=重写消息 `nextRunAt`（`TASK_QUEUE_MAX_RETRY`(3) + 指数退避 `8s×2^(n-1)`+抖动）、完成=删除消息键、重试耗尽=落 `taskq:{queue}:dead:` 死信键。`enqueueQueueTask` / `pollQueueOnce`（每拍至多消化一条，多实例靠认领互斥）；store 缺席=进程内 Map 回落（`resetMemoryQueue` 测试隔离钩 + `memoryDeadLetters` 排障读取）。

## [1.0.1] - 2026-10-15

### 文档

- README 双语补「环境变量」节：`DSH_REDIS_URL` 集成测试门控示例（`redis://:password@host:6379/15`）与专用测试库纪律。

## [1.0.0] - 2026-10-15

### 首发内容

- **缓存 hub**：`Cache` 服务（`ctx.cache`，`declare module '@ling2/ling-cordis'` 模块增强随包发布）+ `CacheStoreRegistry` 命名存储注册表（重名 fail loud / 未知名 fail loud / disposer 只除名不关连接）。
- **键名复刻**：`core/keys.ts` 携带 Ling `CacheKeyUtil` 键名/TTL 常量逐字复刻（`CACHE_KEYS`、`getLoginToken`、`getUserAuthorize` 等二十余键 + `TTL_AUTHORIZE_SEC` 等常量），供跨系统 wire 兼容；禁止改值。
- **内存存储**：`MemoryCacheStore`（JSON 编解码、TTL、`setNx`/`incrBy`/`delPrefix` 全套 `CacheStore` 门面）。
- **分布式锁**：`createDistLock`（`setNx` 原子占位 + 有界重试 + TTL 死锁兜底；`resolveStore` 缝注入，`undefined` 回落进程内互斥）。
- **Redis 提供者**：`cache-redis/` 域（ioredis 连接一处一行；源码随包分发，运行装配需宿主提供连接参数）。eager open fails loud、瞬态握手失败有界重试、注册即 effect 可逆。
- **结构**：`src/` 按域组织——`core/`（注册表+键名+锁+内存实现+存储契约）、`kit/`（零依赖编解码+错误类型）、`cache-redis/`（ioredis 提供者）；根出口为聚合面。
- **发布形态**：tsdown 打 JS + tsc 直出 d.ts 模块树（`dts-smoke.ts` 以外部消费者视角钉类型面与 `Context.cache` 增强可见性）。
