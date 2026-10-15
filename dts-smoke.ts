/**
 * dts 冒烟——以外部消费者视角钉发布类型面（对应外部装包后的 import 形态）。
 * 坑#1 主靶：单文件打包 dts 会把相对模块增强悬空（消费者类型静默丢失），
 * 本文件在 check:dts 门禁里证明双管线（tsc 直出模块树）的类型树完整：
 * ①根出口值面/类型面符号齐全；②default 导出在位；③declare module 对
 * @ling2/ling-cordis 的 `Context.cache` 增强可见。
 */
import Cache, {
  CacheError,
  CacheStoreRegistry,
  MemoryCacheStore,
  assertTtlSec,
  cacheKeyWithTenant,
  cacheStoreServiceKey,
  createDistLock,
  decodeCacheValue,
  encodeCacheValue,
  CACHE_KEYS,
  TTL_AUTHORIZE_SEC,
  type CacheErrorCode,
  type CacheStore,
  type DistLockDeps,
  type DistLockHandle,
} from '@ling2/ling-cache'
import type { Context } from '@ling2/ling-cordis'

// ① 值面符号齐全
const _values: unknown[] = [
  CacheError,
  CacheStoreRegistry,
  MemoryCacheStore,
  cacheStoreServiceKey,
  cacheKeyWithTenant,
  encodeCacheValue,
  decodeCacheValue,
  assertTtlSec,
  createDistLock,
  CACHE_KEYS,
]

// ② 常量与类型面出口
const _ttl: number = TTL_AUTHORIZE_SEC
const _iface = (_code: CacheErrorCode, _store: CacheStore, _handle: DistLockHandle, _deps: DistLockDeps): void => {}

// ③ default 导出在位（service 类形态，桥/打包都不得丢）
const _default: unknown = Cache

// ④ 模块增强可见性：ctx.cache 必须随包 d.ts 出现在 Context 上
declare const ctx: Context
const _hub: Cache = ctx.cache
const _registry: CacheStoreRegistry = _hub.store

void _values
void _ttl
void _iface
void _default
void _hub
void _registry
