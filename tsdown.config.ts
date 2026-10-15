import { defineConfig } from 'tsdown'

/**
 * JS 打包（ESM 单入口，对齐 cordis 系发布形态）；产物扩展名取 .js
 * （type:module 下即 ESM）。dts 不走打包器：相对路径模块增强（declare
 * module）在单文件 dts 里会悬空失联——类型树由 tsconfig.build.json 经
 * tsc 直出（dist 内相对路径自洽解析）。outExtensions 返回键是 `js`
 * （写 `esm` 会被静默忽略）。
 */
export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  dts: false,
  sourcemap: true,
  clean: true,
  external: ['ioredis', '@ling2/ling-cordis'],
  outExtensions: () => ({ js: '.js' }),
})
