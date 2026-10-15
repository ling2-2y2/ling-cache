/**
 * Named store registry of the cache hub.
 * @module dsh-cache/src/registry
 */

import type { CacheStore } from './types.ts'
import { CacheError } from '../kit/error.ts'

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

/**
 * Mutable name → store table. Multiple stores stay mounted side by side
 * (`redis`, a second Redis instance, …); which store serves which consumer
 * is the consumer's configuration, never a hub-global choice.
 */
export class CacheStoreRegistry {
  private readonly stores = new Map<string, CacheStore>()

  /**
   * Register a named store. Registration is an effect: the returned
   * disposer removes the name. Disposal does NOT close the store — the
   * owning provider disconnects it after unregistering.
   * @param name - Registry name, e.g. `redis`.
   * @param store - The store facade owned by one provider row.
   * @returns the disposer that unregisters the name.
   */
  register(name: string, store: CacheStore): () => void {
    if (this.stores.has(name)) {
      throw new CacheError('duplicate-store', `cache store '${name}' is already registered`)
    }
    this.stores.set(name, store)
    return () => {
      // Remove only this registration's contribution: after dispose + re-register,
      // a stale disposer firing again must not remove the successor.
      if (this.stores.get(name) === store) {
        this.stores.delete(name)
      }
    }
  }

  /**
   * Resolve a store by name. Unknown names fail loud, listing what is
   * actually mounted, because a silent miss would send a consumer to no
   * store at all.
   * @param name - Registered store name.
   * @returns the store facade.
   */
  get(name: string): CacheStore {
    const store = this.stores.get(name)
    if (!store) {
      throw new CacheError(
        'store-not-found',
        `cache store '${name}' is not registered (registered: ${[...this.stores.keys()].join(', ') || 'none'})`,
      )
    }
    return store
  }

  /**
   * Registered store names, for diagnostics.
   * @returns a snapshot array of names.
   */
  names(): string[] {
    return [...this.stores.keys()]
  }
}
