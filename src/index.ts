/**
 * Cache hub (`ctx.cache`): a named cache-store registry. Providers (e.g.
 * cache-redis) mount one {@link CacheStore} per row under a registry name;
 * consumers resolve by that name and code against the transport contract in
 * `core/types.ts`. The hub performs no IO itself. Key naming and TTL policy
 * are consumer-owned; `core/keys.ts` carries the verbatim Ling CacheKeyUtil
 * replica for wire compatibility.
 * @module @ling2/ling-cache
 */

import { Context, Service } from '@ling2/ling-cordis'
import { CacheStoreRegistry } from './core/index.ts'

export * from './core/index.ts'
export * from './kit/index.ts'

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
