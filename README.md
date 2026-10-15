# dsh-cache

缓存公共层（Service Definition）：`ctx.cache` hub + 命名缓存注册表 + TTL 语义 + Ling `CacheKeyUtil` 键名/TTL 1:1 复刻。供 bsh-scratch-plugin 内其他插件（satoken、rbac……）共享，自身不做任何 IO——连接与驱动由提供者（如 `dsh-cache-redis`）拥有。

## 形态

- `ctx.cache.store` — 命名注册表（`register(name, store)` 返回 disposer；重名 throw；`get(name)` 未知名 throw 并列出现有名）。多存储并存，哪个消费者用哪个存储是消费者配置。
- `cacheStoreServiceKey(name)` — 防激活竞态的生命周期 key。提供者 `ctx.provide` 该 key；消费者 `[Service.init]` 里 `ctx.inject([key], …)` 建栅栏。
- `CacheStore` 接口 — `get/set(key,val,ttlSec?)/setNx(key,val,ttlSec?)/del/delPrefix(prefix)/incrBy(key,delta,ttlSec?)/keys(prefix)/ttl(key)`；值 JSON 序列化（非 JSON 值 fail loud）；TTL 秒级、缺省持久；`ttl` 答复 Redis 语义（-1 持久 / -2 缺失）；`incrBy` 不带 TTL 时保留现有效期（Redis INCRBY 语义）；`setNx` 仅在键缺席时写入并返回是否抢到（Redis `SET NX [EX]`，分布式锁/去重集的原子原语；Ling `redisUtil.exists`+`insert` 检查-写入对的分布式等价物——TTL 归消费者传）。
- `MemoryCacheStore` — 内存假实现（测试接缝，design §2.1；懒过期、无后台定时器、JSON 往返与 Redis provider 等价），供消费者单测注入。
- `src/keys.ts` — Ling `CacheKeyUtil`（`ez2-ling-common-tool/.../CacheKeyUtil.java:15-257`）逐字复刻：26 个键常量 + 18 个租户前缀 getter（租户作显式参数，拼接规则不变：非空租户直接前置、无分隔符）+ `userAuthorizeKey`（`{tenant}authorize_{moduleId}_{userId}`，AuthorizeServiceImpl.java:809 同式）+ TTL 锚点（authorize 300s、permission map 86400s、RedisUtil CAHCE* 时长族）。

## 约定

- 键名/有效期策略归消费者（`keys.ts` 只是 Ling 复刻的权威携带者）；hub 只标准化存储传输。
- `keys(prefix)` 是纯前缀扫描；Ling `findKeysContaining` 对 `idgenerator_`/锁键的排除属运维策略，归消费者（CacheManage 面）。
- Ling `RedisUtil.insert(key, obj)` 无 TTL 时隐式 8h 过期的行为**不**复刻——design.md §2.1 明确缺省持久。

## 测试

```sh
cd scratch-plugin/bsh-scratch-plugin/dsh-cache
npx vitest run   # 纯内存，无需服务器
```
