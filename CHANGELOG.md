# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本语义遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [1.0.0] - 2026-10-15

### 首发内容

- **缓存 hub**：`Cache` 服务（`ctx.cache`，`declare module '@ling2/ling-cordis'` 模块增强随包发布）+ `CacheStoreRegistry` 命名存储注册表（重名 fail loud / 未知名 fail loud / disposer 只除名不关连接）。
- **键名复刻**：`core/keys.ts` 携带 Ling `CacheKeyUtil` 键名/TTL 常量逐字复刻（`CACHE_KEYS`、`getLoginToken`、`getUserAuthorize` 等二十余键 + `TTL_AUTHORIZE_SEC` 等常量），供跨系统 wire 兼容；禁止改值。
- **内存存储**：`MemoryCacheStore`（JSON 编解码、TTL、`setNx`/`incrBy`/`delPrefix` 全套 `CacheStore` 门面）。
- **分布式锁**：`createDistLock`（`setNx` 原子占位 + 有界重试 + TTL 死锁兜底；`resolveStore` 缝注入，`undefined` 回落进程内互斥）。
- **Redis 提供者**：`cache-redis/` 域（ioredis 连接一处一行；源码随包分发，运行装配需宿主提供连接参数）。eager open fails loud、瞬态握手失败有界重试、注册即 effect 可逆。
- **结构**：`src/` 按域组织——`core/`（注册表+键名+锁+内存实现+存储契约）、`kit/`（零依赖编解码+错误类型）、`cache-redis/`（ioredis 提供者）；根出口为聚合面。
- **发布形态**：tsdown 打 JS + tsc 直出 d.ts 模块树（`dts-smoke.ts` 以外部消费者视角钉类型面与 `Context.cache` 增强可见性）。
