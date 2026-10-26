/**
 * Vitest 测试配置：ui-ssr 包独立跑测试
 * 组件/主题测试通过 @vitest-environment jsdom 逐文件声明（与 app/lib 一致）；
 * localStorage/sessionStorage 通过 src/test-setup.ts 绑定回 jsdom，
 * 规避 Node 22+ 的 WebStorage 全局变量（bare localStorage 为 undefined）遮蔽 jsdom window 的问题。
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test-setup.ts"],
  },
});
