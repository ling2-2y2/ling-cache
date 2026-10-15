/**
 * Verbatim replica of Ling Cloud's `CacheKeyUtil`
 * (`ez2-ling-common-tool/.../datareport/common/util/CacheKeyUtil.java:15-257`):
 * every cache key literal (26 constants) and every tenant-prefixed getter
 * (18 functions), 1:1 — no renaming, no extra prefix, so keys stay
 * interoperable with a Ling Redis instance.
 *
 * Tenants arrive as an explicit argument instead of Ling's thread-local
 * `SecureUtil.getTenantId()`; the concatenation rule is unchanged: a
 * non-empty tenant id is prepended directly with **no separator**
 * (`'000' + 'authorize_'` → `000authorize_`). An empty or undefined tenant
 * yields the bare literal, exactly like Ling.
 * @module @ling2/ling-cache/core/keys
 */

/**
 * Every cache key literal from CacheKeyUtil.java:20-108, verbatim.
 * Property names mirror the Java constant names for auditability.
 */
export const CACHE_KEYS = {
  /** 系统配置 (system configuration). */
  SYSTEMINFO: 'systeminfo',
  /** 微信配置 (WeChat configuration). */
  WECHATCONFIG: 'wechatconfig',
  /** 第三方配置 (social-login configuration). */
  SOCIALSCONFIG: 'socialsConfig',
  /** 图形验证码 (image captcha). */
  VALIDCODE: 'validcode_',
  /** 短信验证码 (SMS captcha). */
  SMSVALIDCODE: 'sms_validcode_',
  /** 登陆 token (login token index). */
  LOGINTOKEN: 'login_token_',
  /** 登陆在线用户 (online users). */
  LOGINONLINE: 'login_online_',
  /** 登陆在线用户 - 移动 APP (online users, mobile). */
  MOBILELOGINONLINE: 'login_online_mobile_',
  /** 移动设备列表 (mobile device list). */
  MOBILEDEVICELIST: 'mobiledevicelist',
  /** 用户权限 (user authorize set). */
  USERAUTHORIZE: 'authorize_',
  /** 公司选择 (company selector). */
  COMPANYSELECT: 'companyselect',
  /** 组织选择 (organize selector). */
  ORGANIZELIST: 'organizeList',
  /** 字典数据 (dictionary data). */
  DICTIONARY: 'dictionary_',
  /** 远端数据 (remote/dynamic data). */
  DYNAMIC: 'dynamic_',
  /** 岗位列表 (position list). */
  POSITIONLIST: 'positionlist_',
  /** 所有用户 (all users). */
  ALLUSER: 'alluser',
  /** 可视化数据包 (visual-dev data pack). */
  VISIUALDATA: 'visiualdata_',
  /** ID 生成器 (id generator; never bulk-deleted — cluster machine numbers). */
  IDGENERATOR: 'idgenerator_',
  /** 组织信息集合 (organize info list). */
  ORGANIZEINFOLIST: 'organizeinfolist_',
  /** 系统控件缓存 key — 组织多级 (organize tree). */
  SYS_ORG_TREE: '_organizeTree',
  /** 系统控件缓存 key — 部门单个 id (department). */
  SYS_DEP: '_department',
  /** 系统控件缓存 key — 岗位 (position). */
  SYS_POS: '_position',
  /** 系统控件缓存 key — 用户 (user). */
  SYS_USER: '_user',
  /** 系统控件缓存 key — 角色 (role). */
  SYS_ROLE: '_role',
  /** 系统控件缓存 key — 组 (group). */
  SYS_GROUP: '_group',
  /** Lock4J 锁记录 (lock records; auto-expiring). */
  LOCK: 'lock:',
} as const

/**
 * Prepend a tenant id to a key literal exactly as Ling's getters do.
 * @param tenantId - Tenant id; empty or undefined yields the bare key.
 * @param key - Key literal from {@link CACHE_KEYS} (or a composed prefix).
 * @returns the tenant-prefixed key with no separator between the parts.
 */
export function cacheKeyWithTenant(tenantId: string | undefined, key: string): string {
  return tenantId ? tenantId + key : key
}

/**
 * 组织信息集合键（CacheKeyUtil.getOrganizeInfoList）。
 * @param tenantId - Tenant id; empty or undefined yields the bare literal.
 * @returns `{tenant}organizeinfolist_`.
 */
export function getOrganizeInfoList(tenantId?: string): string {
  return cacheKeyWithTenant(tenantId, CACHE_KEYS.ORGANIZEINFOLIST)
}

/**
 * 可视化数据包键（CacheKeyUtil.getVisiualData）。
 * @param tenantId - Tenant id; empty or undefined yields the bare literal.
 * @returns `{tenant}visiualdata_`.
 */
export function getVisiualData(tenantId?: string): string {
  return cacheKeyWithTenant(tenantId, CACHE_KEYS.VISIUALDATA)
}

/**
 * 公司选择键（CacheKeyUtil.getCompanySelect）。
 * @param tenantId - Tenant id; empty or undefined yields the bare literal.
 * @returns `{tenant}companyselect`.
 */
export function getCompanySelect(tenantId?: string): string {
  return cacheKeyWithTenant(tenantId, CACHE_KEYS.COMPANYSELECT)
}

/**
 * 组织选择键（CacheKeyUtil.getOrganizeList）。
 * @param tenantId - Tenant id; empty or undefined yields the bare literal.
 * @returns `{tenant}organizeList`.
 */
export function getOrganizeList(tenantId?: string): string {
  return cacheKeyWithTenant(tenantId, CACHE_KEYS.ORGANIZELIST)
}

/**
 * 字典数据键（CacheKeyUtil.getDictionary）。
 * @param tenantId - Tenant id; empty or undefined yields the bare literal.
 * @returns `{tenant}dictionary_`.
 */
export function getDictionary(tenantId?: string): string {
  return cacheKeyWithTenant(tenantId, CACHE_KEYS.DICTIONARY)
}

/**
 * 远端数据键（CacheKeyUtil.getDynamic）。
 * @param tenantId - Tenant id; empty or undefined yields the bare literal.
 * @returns `{tenant}dynamic_`.
 */
export function getDynamic(tenantId?: string): string {
  return cacheKeyWithTenant(tenantId, CACHE_KEYS.DYNAMIC)
}

/**
 * 岗位列表键（CacheKeyUtil.getPositionList）。
 * @param tenantId - Tenant id; empty or undefined yields the bare literal.
 * @returns `{tenant}positionlist_`.
 */
export function getPositionList(tenantId?: string): string {
  return cacheKeyWithTenant(tenantId, CACHE_KEYS.POSITIONLIST)
}

/**
 * 所有用户键（CacheKeyUtil.getAllUser）。
 * @param tenantId - Tenant id; empty or undefined yields the bare literal.
 * @returns `{tenant}alluser`.
 */
export function getAllUser(tenantId?: string): string {
  return cacheKeyWithTenant(tenantId, CACHE_KEYS.ALLUSER)
}

/**
 * 系统配置键（CacheKeyUtil.getSystemInfo）。
 * @param tenantId - Tenant id; empty or undefined yields the bare literal.
 * @returns `{tenant}systeminfo`.
 */
export function getSystemInfo(tenantId?: string): string {
  return cacheKeyWithTenant(tenantId, CACHE_KEYS.SYSTEMINFO)
}

/**
 * 微信配置键（CacheKeyUtil.getWechatConfig）。
 * @param tenantId - Tenant id; empty or undefined yields the bare literal.
 * @returns `{tenant}wechatconfig`.
 */
export function getWechatConfig(tenantId?: string): string {
  return cacheKeyWithTenant(tenantId, CACHE_KEYS.WECHATCONFIG)
}

/**
 * 第三方配置键（CacheKeyUtil.getSocialsConfig）。
 * @param tenantId - Tenant id; empty or undefined yields the bare literal.
 * @returns `{tenant}socialsConfig`.
 */
export function getSocialsConfig(tenantId?: string): string {
  return cacheKeyWithTenant(tenantId, CACHE_KEYS.SOCIALSCONFIG)
}

/**
 * 图形验证码键（CacheKeyUtil.getValidCode）。
 * @param tenantId - Tenant id; empty or undefined yields the bare literal.
 * @returns `{tenant}validcode_`.
 */
export function getValidCode(tenantId?: string): string {
  return cacheKeyWithTenant(tenantId, CACHE_KEYS.VALIDCODE)
}

/**
 * 短信验证码键（CacheKeyUtil.getSmsValidCode）。
 * @param tenantId - Tenant id; empty or undefined yields the bare literal.
 * @returns `{tenant}sms_validcode_`.
 */
export function getSmsValidCode(tenantId?: string): string {
  return cacheKeyWithTenant(tenantId, CACHE_KEYS.SMSVALIDCODE)
}

/**
 * 登陆 token 索引键（CacheKeyUtil.getLoginToken — Ling already took the
 * tenant as an explicit argument there）。
 * @param tenantId - Tenant id; empty or undefined yields the bare literal.
 * @returns `{tenant}login_token_`.
 */
export function getLoginToken(tenantId?: string): string {
  return cacheKeyWithTenant(tenantId, CACHE_KEYS.LOGINTOKEN)
}

/**
 * 登陆在线用户键（CacheKeyUtil.getLoginOnline）。
 * @param tenantId - Tenant id; empty or undefined yields the bare literal.
 * @returns `{tenant}login_online_`.
 */
export function getLoginOnline(tenantId?: string): string {
  return cacheKeyWithTenant(tenantId, CACHE_KEYS.LOGINONLINE)
}

/**
 * 移动端在线用户键（CacheKeyUtil.getMobileLoginOnline）。
 * @param tenantId - Tenant id; empty or undefined yields the bare literal.
 * @returns `{tenant}login_online_mobile_`.
 */
export function getMobileLoginOnline(tenantId?: string): string {
  return cacheKeyWithTenant(tenantId, CACHE_KEYS.MOBILELOGINONLINE)
}

/**
 * 移动设备列表键（CacheKeyUtil.getMobileDeviceList）。
 * @param tenantId - Tenant id; empty or undefined yields the bare literal.
 * @returns `{tenant}mobiledevicelist`.
 */
export function getMobileDeviceList(tenantId?: string): string {
  return cacheKeyWithTenant(tenantId, CACHE_KEYS.MOBILEDEVICELIST)
}

/**
 * 用户权限集合前缀键（CacheKeyUtil.getUserAuthorize）。
 * @param tenantId - Tenant id; empty or undefined yields the bare literal.
 * @returns `{tenant}authorize_`.
 */
export function getUserAuthorize(tenantId?: string): string {
  return cacheKeyWithTenant(tenantId, CACHE_KEYS.USERAUTHORIZE)
}

/**
 * Per-user data-authorize cache key, composed exactly as
 * `AuthorizeServiceImpl.getConditionSql` does (java:809):
 * `getUserAuthorize() + moduleId + '_' + userId`, TTL 300s (java:810).
 * @param tenantId - Tenant id; empty or undefined omits the prefix.
 * @param moduleId - Menu/module id.
 * @param userId - User id.
 * @returns `{tenant}authorize_{moduleId}_{userId}`.
 */
export function userAuthorizeKey(tenantId: string | undefined, moduleId: string, userId: string): string {
  return cacheKeyWithTenant(tenantId, CACHE_KEYS.USERAUTHORIZE) + moduleId + '_' + userId
}

/**
 * TTL of the per-user data-authorize cache: 300 seconds
 * (`AuthorizeServiceImpl.getConditionSql`, java:810 — `60 * 5`).
 */
export const TTL_AUTHORIZE_SEC = 300

/**
 * TTL of the permission column/form map: 86400 seconds
 * (BE-CACHE-03, `PermissionInterfaceImpl.setMap`).
 */
export const TTL_PERMISSION_MAP_SEC = 60 * 60 * 24

/**
 * Ling `RedisUtil` generic duration constants (RedisUtil.java:31-51),
 * expressions and names verbatim — including the historical arithmetic
 * where a "month" is 30 weeks and a "year" is 12 such months. Kept for
 * call-site fidelity when porting Ling consumers that pass these to
 * `insert(key, value, time)`.
 */
export const CAHCETIME = 60
/** Ling RedisUtil one-hour constant, verbatim. */
export const CAHCEHOUR = 60 * 60
/** Ling RedisUtil one-day constant, verbatim. */
export const CAHCEDAY = 60 * 60 * 24
/** Ling RedisUtil one-week constant, verbatim. */
export const CAHCEWEEK = 60 * 60 * 24 * 7
/** Ling RedisUtil "one-month" constant, verbatim (30 weeks). */
export const CAHCEMONTH = 60 * 60 * 24 * 7 * 30
/** Ling RedisUtil "one-year" constant, verbatim (12 "months"). */
export const CAHCEYEAR = 60 * 60 * 24 * 7 * 30 * 12
