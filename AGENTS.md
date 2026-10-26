# AGENTS.md — ling-cache（缓存/队列/锁子仓）

独立子仓（@ling2/ling-cache）：redis 缓存、消息队列、分布式锁三件套——**直接用，禁在业务包重建**。树内消费统一经 `@ling2/ling-cache` shim 桥（树根 scripts/build/link-alias.mjs 再生）。

## 目录速览

| 目录 | 职责 |
|---|---|
| core | 缓存核心 + 队列原语（core/queue.ts，删除级联队列等消费范本） |
| cache-redis | redis 实现 |
| kit | 分布式锁等姊妹件 |
| examples / index.ts | smoke 例程 / 出口 |

## 常用命令

| 命令 | 用途 |
|---|---|
| `pnpm typecheck` / `pnpm test` / `pnpm build` / `pnpm check:dts` / `pnpm smoke` | 门禁五件（prepublishOnly=typecheck+test+build） |

## 本模块纪律与坑 ⭐

- **fiber.inject 白名单坑**：消费方 `ctx.cache` 直访必抛——唯一正路=`ctx.inject(['cache'], (ctx) => …)` 栅栏回调参取（点分键同理，勿再用）。
- **子仓推送走发布序**：同 ling-rdb（deploy-stack-remote.mjs --release 单命令，GitHub+gitee 双源核对，禁手工分步推）。

---

全局规范见树根 [AGENTS.md](../AGENTS.md)；此处只列本模块增量。
