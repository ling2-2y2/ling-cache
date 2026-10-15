/**
 * Ling CacheKeyUtil replica fidelity tests: every constant and every
 * tenant-prefixed getter is asserted against the literal values read from
 * the old source (`CacheKeyUtil.java:20-256`), so any drift fails a test
 * rather than a Ling-side interop incident.
 * @module dsh-cache/tests/keys
 */

import { describe, expect, it } from 'vitest'
import {
  CACHE_KEYS,
  cacheKeyWithTenant,
  getAllUser,
  getCompanySelect,
  getDictionary,
  getDynamic,
  getLoginOnline,
  getLoginToken,
  getMobileDeviceList,
  getMobileLoginOnline,
  getOrganizeInfoList,
  getOrganizeList,
  getPositionList,
  getSmsValidCode,
  getSocialsConfig,
  getSystemInfo,
  getUserAuthorize,
  getValidCode,
  getVisiualData,
  getWechatConfig,
  TTL_AUTHORIZE_SEC,
  TTL_PERMISSION_MAP_SEC,
  CAHCEDAY,
  CAHCEHOUR,
  CAHCEMONTH,
  CAHCETIME,
  CAHCEWEEK,
  CAHCEYEAR,
  userAuthorizeKey,
} from '../src/index.ts'

describe('CACHE_KEYS (CacheKeyUtil.java:20-108, verbatim)', () => {
  it('carries every Ling key literal unchanged', () => {
    expect({ ...CACHE_KEYS }).toEqual({
      SYSTEMINFO: 'systeminfo',
      WECHATCONFIG: 'wechatconfig',
      SOCIALSCONFIG: 'socialsConfig',
      VALIDCODE: 'validcode_',
      SMSVALIDCODE: 'sms_validcode_',
      LOGINTOKEN: 'login_token_',
      LOGINONLINE: 'login_online_',
      MOBILELOGINONLINE: 'login_online_mobile_',
      MOBILEDEVICELIST: 'mobiledevicelist',
      USERAUTHORIZE: 'authorize_',
      COMPANYSELECT: 'companyselect',
      ORGANIZELIST: 'organizeList',
      DICTIONARY: 'dictionary_',
      DYNAMIC: 'dynamic_',
      POSITIONLIST: 'positionlist_',
      ALLUSER: 'alluser',
      VISIUALDATA: 'visiualdata_',
      IDGENERATOR: 'idgenerator_',
      ORGANIZEINFOLIST: 'organizeinfolist_',
      SYS_ORG_TREE: '_organizeTree',
      SYS_DEP: '_department',
      SYS_POS: '_position',
      SYS_USER: '_user',
      SYS_ROLE: '_role',
      SYS_GROUP: '_group',
      LOCK: 'lock:',
    })
  })
})

describe('tenant-prefix getters (CacheKeyUtil.java:110-256, all 18)', () => {
  it('prepends a non-empty tenant id with no separator, like SecureUtil context did', () => {
    expect(getOrganizeInfoList('000')).toBe('000organizeinfolist_')
    expect(getVisiualData('000')).toBe('000visiualdata_')
    expect(getCompanySelect('000')).toBe('000companyselect')
    expect(getOrganizeList('000')).toBe('000organizeList')
    expect(getDictionary('000')).toBe('000dictionary_')
    expect(getDynamic('000')).toBe('000dynamic_')
    expect(getPositionList('000')).toBe('000positionlist_')
    expect(getAllUser('000')).toBe('000alluser')
    expect(getSystemInfo('000')).toBe('000systeminfo')
    expect(getWechatConfig('000')).toBe('000wechatconfig')
    expect(getSocialsConfig('000')).toBe('000socialsConfig')
    expect(getValidCode('000')).toBe('000validcode_')
    expect(getSmsValidCode('000')).toBe('000sms_validcode_')
    expect(getLoginToken('000')).toBe('000login_token_')
    expect(getLoginOnline('000')).toBe('000login_online_')
    expect(getMobileLoginOnline('000')).toBe('000login_online_mobile_')
    expect(getMobileDeviceList('000')).toBe('000mobiledevicelist')
    expect(getUserAuthorize('000')).toBe('000authorize_')
  })

  it('returns the bare literal for an empty or undefined tenant', () => {
    expect(getUserAuthorize('')).toBe('authorize_')
    expect(getUserAuthorize(undefined)).toBe('authorize_')
    expect(getSystemInfo('')).toBe('systeminfo')
    expect(cacheKeyWithTenant(undefined, CACHE_KEYS.LOCK)).toBe('lock:')
  })
})

describe('composed keys and TTL anchors (BE-CACHE-03)', () => {
  it('composes the per-user authorize key exactly as AuthorizeServiceImpl.java:809', () => {
    expect(userAuthorizeKey('000', 'm1', 'u9')).toBe('000authorize_m1_u9')
    expect(userAuthorizeKey(undefined, 'm1', 'u9')).toBe('authorize_m1_u9')
  })

  it('carries the explicit Ling TTLs: authorize 300s, permission map 86400s', () => {
    expect(TTL_AUTHORIZE_SEC).toBe(300)
    expect(TTL_PERMISSION_MAP_SEC).toBe(86_400)
  })

  it('carries the Ling RedisUtil duration constants verbatim (RedisUtil.java:31-51)', () => {
    expect(CAHCETIME).toBe(60)
    expect(CAHCEHOUR).toBe(3_600)
    expect(CAHCEDAY).toBe(86_400)
    expect(CAHCEWEEK).toBe(604_800)
    expect(CAHCEMONTH).toBe(18_144_000)
    expect(CAHCEYEAR).toBe(217_728_000)
  })
})
