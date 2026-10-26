/**
 * Playwright e2e 配置：前台 SSR 与后台 SPA 关键页面测试
 * webServer 启动前先执行 prepare.ts（建库 + 重置 schema），服务启动时 bootstrap 自动迁移并预置数据
 */

import { defineConfig } from "@playwright/test";
import { getE2eDbUrl } from "./e2e/helpers/env";

export default defineConfig({
  testDir: "./e2e/specs",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    locale: "zh-CN",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "tsx e2e/scripts/prepare.ts && vite dev --port 3100",
    url: "http://localhost:3100/health",
    reuseExistingServer: false,
    timeout: 120_000,
    env: { DATABASE_URL: getE2eDbUrl() },
  },
});
