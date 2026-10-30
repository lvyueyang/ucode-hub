/**
 * Vitest 测试配置
 * 继承 vite.config.ts 的路径别名和插件配置
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    // 与 vite.config.ts 的 __APP_VERSION__ 注入保持一致，供 health 等模块测试使用
    __APP_VERSION__: JSON.stringify("0.0.0-test"),
  },
  test: {
    // 数据面（隧道与 ingress）的纯逻辑在 server/ 下，同样要进单测：它们不依赖 WS / HTTP 运行时
    include: ["src/**/*.test.{ts,tsx}", "server/**/__tests__/*.test.ts"],
    // 必需环境变量：env 模块要求必需项齐备，缺失会在模块导入期直接抛错；
    // 各用例仍可自行覆盖（如 file-explorer 按 describe 分配独立的 STORAGE_DIR）
    env: {
      DATABASE_URL: ":memory:",
      JWT_SECRET: "test-jwt-secret-at-least-32-characters-long!!",
      STORAGE_DIR: ".tmp",
    },
    // 列工厂等测试经组件桶间接引入编辑器依赖（内部含 CSS 子路径导入），
    // 需交由 Vite 转换，不能按 Node 外部依赖直载
    server: {
      deps: {
        inline: [/@easyx\//],
      },
    },
    // 路径别名通过 vite.config.ts 的 resolve.tsconfigPaths 继承
  },
});
