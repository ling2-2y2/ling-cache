# ling-cache

A **cache hub** for cordis-based TypeScript hosts: mount one or many named cache stores on `ctx.cache`, resolve them by name, and code against one transport contract — with an in-memory implementation, a distributed lock, and an ioredis-backed Redis provider in the box. Key naming ships as a verbatim replica of Ling's `CacheKeyUtil` for cross-system wire compatibility.

> 简体中文文档见 [README.zh-CN.md](./README.zh-CN.md)。

## Features

- **Hub, not IO** — `ctx.cache` is a named store registry (`ctx.cache.store.get(name)`); the hub owns no connections. Providers mount one store per row and own their drivers.
- **One store contract** — `CacheStore`: `get` / `set` / `setNx` / `incrBy` / `del` / `delPrefix` / `keys` / `ttl`, JSON values with loud rejection of non-JSON numbers and functions.
- **Memory store** — drop-in `MemoryCacheStore` for tests and single-instance hosts.
- **Redis provider** — `cache-redis`: one ioredis connection per store, eager open that fails loud, bounded retries for transient handshakes, effect-reversible registration (unregister before disconnect).
- **Distributed lock** — `createDistLock`: `setNx`-based atomic acquire with bounded retries and a TTL deadlock guard; inject `resolveStore` for multi-instance mutual exclusion or `undefined` for in-process fallback.
- **Ling key replica** — `CACHE_KEYS` + key builders + TTL constants copied verbatim from Ling's `CacheKeyUtil`, so cache keys stay byte-compatible across systems. Never change these values.

## Install

```sh
npm install @ling2/ling-cache
# peer: @ling2/ling-cordis ^2.0.0
```

## Quick start

```ts
import { MemoryCacheStore, cacheKeyWithTenant, CACHE_KEYS } from '@ling2/ling-cache'

const memory = new MemoryCacheStore()
await memory.set(cacheKeyWithTenant('000000', CACHE_KEYS.getLoginToken('u1')), { token: '...' }, 300)
const session = await memory.get<{ token: string }>(cacheKeyWithTenant('000000', CACHE_KEYS.getLoginToken('u1')))
```

Mount the hub service in a cordis app, then register stores:

```ts
import { Cache } from '@ling2/ling-cache'          // default export, too

// host wiring: ctx.plugin(Cache) provides ctx.cache
ctx.cache.store.register('memory', new MemoryCacheStore())
const store = ctx.cache.store.get('memory')
```

The Redis provider mounts through its cordis plugin (`cache-redis`): one config row = one named store with its own connection.

## Structure

```text
src/
├── index.ts        # aggregate root (hub service + re-exports; default = Cache)
├── core/           # registry, Ling key replica, lock, memory store, CacheStore contract
├── kit/            # dependency-free JSON codec + CacheError
└── cache-redis/    # ioredis provider (cordis plugin)
```

## Development

```sh
pnpm install
pnpm typecheck     # tsc --noEmit
pnpm test          # vitest (redis integration gated by DSH_REDIS_URL; no server = skip, not fail)
pnpm build         # tsdown (js) + tsc d.ts module tree -> dist/
pnpm check:dts     # external-consumer d.ts smoke (symbols, default export, Context.cache augmentation)
pnpm smoke         # runnable example: examples/memory-hub
```

## Environment variables

| Variable | Used by | Example |
|---|---|---|
| `DSH_REDIS_URL` | `cache-redis` integration tests (gated; unset = skip, not fail) | `redis://:password@192.168.74.129:6379/15` |

Always point gated suites at a **dedicated test database** (db 15 in the example): test keys are namespaced per case and cleaned up, but never aim them at a shared business instance.

## License

[MIT](./LICENSE)
