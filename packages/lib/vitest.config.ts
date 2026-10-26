/**
 * Vitest 测试配置：core 包独立跑测试
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
