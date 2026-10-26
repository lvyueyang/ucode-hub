/**
 * 数据库迁移测试：迁移目录缺失时的生产 fail-fast 与非生产宽松跳过
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockExistsSync, mockLogger, mockMigrate, mockDrizzle } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mockMigrate: vi.fn(),
  mockDrizzle: vi.fn(() => "migration-db"),
}));

vi.mock("node:fs", () => ({ existsSync: mockExistsSync }));
vi.mock("#/shared-services/logger", () => ({ logger: mockLogger }));
vi.mock("drizzle-orm/node-postgres", () => ({ drizzle: mockDrizzle }));
vi.mock("drizzle-orm/node-postgres/migrator", () => ({
  migrate: mockMigrate,
}));

import { runMigrations } from "../migrate";

describe("runMigrations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DATABASE_URL", "postgresql://localhost:5432/test");
  });

  afterEach(() => {
    // 还原用例内被 stub 的环境变量，避免污染同 worker 内的其他用例
    vi.unstubAllEnvs();
  });

  it("生产环境迁移目录缺失时抛错（fail-fast，不静默跳过）", async () => {
    mockExistsSync.mockReturnValue(false);
    vi.stubEnv("NODE_ENV", "production");

    await expect(runMigrations()).rejects.toThrow("迁移目录不存在");
    expect(mockMigrate).not.toHaveBeenCalled();
  });

  it("非生产环境迁移目录缺失时仅告警跳过", async () => {
    mockExistsSync.mockReturnValue(false);
    vi.stubEnv("NODE_ENV", "development");

    await expect(runMigrations()).resolves.toBeUndefined();
    expect(mockLogger.warn).toHaveBeenCalled();
    expect(mockMigrate).not.toHaveBeenCalled();
  });

  it("迁移目录存在时执行迁移", async () => {
    mockExistsSync.mockReturnValue(true);
    mockMigrate.mockResolvedValue(undefined);

    await runMigrations();

    expect(mockDrizzle).toHaveBeenCalledWith("postgresql://localhost:5432/test");
    expect(mockMigrate).toHaveBeenCalledWith(
      "migration-db",
      expect.objectContaining({ migrationsTable: "__drizzle_migrations" }),
    );
  });

  it("缺少 DATABASE_URL 时抛错", async () => {
    mockExistsSync.mockReturnValue(true);
    vi.stubEnv("DATABASE_URL", "");

    await expect(runMigrations()).rejects.toThrow("缺少 DATABASE_URL");
  });
});
