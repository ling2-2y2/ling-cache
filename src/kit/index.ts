/**
 * Kit domain of the cache hub: dependency-free value codec and error type
 * shared by every store implementation.
 * @module @ling2/ling-dsh-cache/kit
 */

export { encodeCacheValue, decodeCacheValue, assertTtlSec } from './codec.ts'
export { CacheError } from './error.ts'
export type { CacheErrorCode } from './error.ts'
