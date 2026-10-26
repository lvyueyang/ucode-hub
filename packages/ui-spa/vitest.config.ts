/**
 * Vitest 测试配置：ui-spa 包独立跑测试
 * 表格域的列宽预算与档位为纯函数，无需 DOM 环境
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
