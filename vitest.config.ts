import { defineConfig } from 'vitest/config'

/**
 * 自含 vitest 配置——测试一律相对导入 `../src`，无需 paths 映射；
 * redis 集成套件按 `DSH_REDIS_URL` 环境变量门控（无实例=skip 非 fail）。
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
  },
})
