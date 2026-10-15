# dsh-cache-redis

Redis 提供者：为 `ctx.cache` hub 挂载一个命名 `CacheStore`（ioredis 连接）。对位 Ling 的 Redis 依赖，键名/TTL 语义由 hub（`dsh-cache`）与消费者携带，本包只实现存储传输。

## 形态

- 一行 = 一个命名存储：`config.cache`（缺省 `redis`）+ `host/port/password/db`。凭据经 cordis.yml `!!js` 插值自仓库根 `.env`（`REDIS_HOST/REDIS_PORT/REDIS_PASSWORD`，无 `DSH_` 前缀——启动环境类变量禁入 `.env`）。
- **eager open fails loud**：`apply` 内先 `store.open()`（连到 `ready` 才算过），连不上即整行报错，绝不静默回退。瞬态握手失败（ETIMEDOUT/ECONNRESET）有界重试 2 次（1s/5s，对齐 dsh-rdb-mysql 的池引导）；ECONNREFUSED 等立即失败。
- **注册即 effect 可逆**：`ctx.effect` 先 `register(cache, store)`，disposer **先除名后断连**——注册表使用方永远不会观察到名字背后是死连接；`ctx.provide(cacheStoreServiceKey(name))` 供消费者 `[Service.init]` 栅栏。
- 语义映射：`set`→`SET [EX ttl]`；`get`→`GET`（JSON 编解码，走 hub codec）；`del`→`DEL`；`delPrefix`/`keys`→`SCAN MATCH prefix* COUNT 1000`（永不用阻塞的 `KEYS`）+ `DEL`；`incrBy`→`INCRBY`（带 TTL 时 MULTI `INCRBY`+`EXPIRE`）；`setNx`→`SET key val NX [EX ttl]`（返回是否抢到）；`ttl`→`TTL`（-1 持久 / -2 缺失）。
- **驱动只装本目录**（CLAUDE.md 规则 #10）：`cd dsh-cache-redis && pnpm install --ignore-workspace --config.auto-install-peers=false`。目录移动/换机后必须重跑（症状：`Cannot find package 'ioredis'`）。
- 依赖方向铁律：hub（dsh-cache）永不 import 本包；本包经相对 import（`../../dsh-cache/src/index.ts`）实现 `CacheStore`。

## 测试

```sh
cd scratch-plugin/bsh-scratch-plugin/dsh-cache-redis
npx vitest run                                            # fail-loud/config 套件；Redis 集成按 DSH_REDIS_URL 门控 skip
DSH_REDIS_URL='redis://:pass@192.168.74.129:6379/15' npx vitest run   # 有实例时跑集成（务必专用 db；测试键带随机前缀并清理）
```
