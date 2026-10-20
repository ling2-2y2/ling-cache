/**
 * Core domain of the cache hub: named store registry, key naming replica,
 * TTL policy constants, distributed lock, in-memory store, transport
 * contract. Every symbol here is re-exported by the package root.
 * @module @ling2/ling-cache/core
 */

export { CacheStoreRegistry, cacheStoreServiceKey } from './registry.ts'
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
export { createDistLock } from './lock.ts'
export type { DistLockHandle, DistLockDeps } from './lock.ts'
export {
  enqueueQueueTask, pollQueueOnce, resetMemoryQueue, memoryDeadLetters, taskQueueBackoffMs,
  TASK_QUEUE_POLL_MS, TASK_QUEUE_MAX_RETRY, TASK_QUEUE_LEASE_SEC, TASK_QUEUE_BACKOFF_BASE_MS,
} from './queue.ts'
export type { TaskQueueStore, QueueMessage, TaskQueuePollOptions } from './queue.ts'
export { MemoryCacheStore } from './memory.ts'
export type { CacheStore } from './types.ts'
