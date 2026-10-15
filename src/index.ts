/**
 * Cache hub (`ctx.cache`): a named cache-store registry. Providers (e.g.
 * dsh-cache-redis) mount one {@link CacheStore} per row under a registry
 * name; consumers resolve by that name and code against the transport
 * contract in `types.ts`. The hub performs no IO itself. Key naming and
 * TTL policy are consumer-owned; `keys.ts` carries the verbatim Ling
 * CacheKeyUtil replica for wire compatibility.
 * @module dsh-cache
 */

import { Context, Service } from '@ling2/ling-cordis'
import { CacheStoreRegistry } from './registry.ts'

export { CacheStoreRegistry } from './registry.ts'
export { CacheError } from './error.ts'
export type { CacheErrorCode } from './error.ts'
export { encodeCacheValue, decodeCacheValue, assertTtlSec } from './codec.ts'
export { MemoryCacheStore } from './memory.ts'
export { createDistLock } from './lock.ts'
export type { DistLockHandle, DistLockDeps } from './lock.ts'
export {
  CACHE_KEYS,
  cacheKeyWithTenant,
  getOrganizeInfoList,
  getVisiualData,
  getCompanySelect,
  getOrganizeList,
  getDictionary,
  getDynamic,
  getPositionList,
  getAllUser,
  getSystemInfo,
  getWechatConfig,
  getSocialsConfig,
  getValidCode,
  getSmsValidCode,
  getLoginToken,
  getLoginOnline,
  getMobileLoginOnline,
  getMobileDeviceList,
  getUserAuthorize,
  userAuthorizeKey,
  TTL_AUTHORIZE_SEC,
  TTL_PERMISSION_MAP_SEC,
  CAHCETIME,
  CAHCEHOUR,
  CAHCEDAY,
  CAHCEWEEK,
  CAHCEMONTH,
  CAHCEYEAR,
} from './keys.ts'
export type { CacheStore } from './types.ts'

/**
 * Derive the Cordis lifecycle service that one named cache-store provider
 * row supplies. Consumers inject these keys so activation cannot race
 * provider registration even though callers continue resolving stores
 * through the hub registry.
 * @param name - Store registry name, e.g. `redis`.
 * @returns the corresponding lifecycle-only service key.
 */
export function cacheStoreServiceKey(name: string): string {
  return `cache.store.${name}`
}

declare module '@ling2/ling-cordis' {
  interface Context {
    cache: Cache
  }
}

/**
 * The cache hub service. Provider rows register stores under `store`;
 * consumers resolve with `ctx.cache.store.get(name)`.
 */
export class Cache extends Service {
  /** Named store table; multiple stores stay mounted side by side. */
  readonly store: CacheStoreRegistry = new CacheStoreRegistry()

  constructor(ctx: Context) {
    super(ctx, 'cache')
  }
}

// Service packages default-export their service class and nothing else
// plugin-shaped: mixing a default export with a function-plugin `apply`
// makes the Loader drop the plugin namespace.
export default Cache
