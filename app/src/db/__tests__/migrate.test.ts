/**
 * 数据库迁移测试：迁移目录缺失时的生产 fail-fast 与非生产宽松跳过，以及 sqlite 文件路径的解析
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockExistsSync,
  mockLogger,
  mockMigrate,
  mockDrizzle,
  mockDatabaseSync,
  mockExec,
  mockMkdirSync,
} = vi.hoisted(() => {
  const mockExec = vi.fn();

  /** node:sqlite 的 DatabaseSync：class 形态才允许 new，实例上挂 exec 供设置 pragma */
  class MockDatabaseSync {
    exec = mockExec;
    constructor(readonly path: string) {}
  }

  return {
    mockExistsSync: vi.fn(),
    mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    mockMigrate: vi.fn(),
    mockDrizzle: vi.fn(() => "migration-db"),
    mockExec,
    mockDatabaseSync: vi.fn(MockDatabaseSync),
    mockMkdirSync: vi.fn(),
  };
});

vi.mock("node:fs", () => ({ existsSync: mockExistsSync, mkdirSync: mockMkdirSync }));
vi.mock("node:sqlite", () => ({ DatabaseSync: mockDatabaseSync }));
vi.mock("#/shared-services/logger", () => ({ logger: mockLogger }));
vi.mock("drizzle-orm/node-sqlite", () => ({ drizzle: mockDrizzle }));
vi.mock("drizzle-orm/node-sqlite/migrator", () => ({ migrate: mockMigrate }));

import { runMigrations } from "../migrate";

describe("runMigrations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DATABASE_URL", "file:./data/data.db");
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
    expect(mockDatabaseSync).not.toHaveBeenCalled();
  });

  it("非生产环境迁移目录缺失时仅告警跳过", async () => {
    mockExistsSync.mockReturnValue(false);
    vi.stubEnv("NODE_ENV", "development");

    await expect(runMigrations()).resolves.toBeUndefined();
    expect(mockLogger.warn).toHaveBeenCalled();
    expect(mockMigrate).not.toHaveBeenCalled();
  });

  it("迁移目录存在时打开 DATABASE_URL 指向的库文件并执行迁移", async () => {
    mockExistsSync.mockReturnValue(true);
    vi.stubEnv("DATABASE_URL", "file:/tmp/hub-migrate-test/data.db");

    await runMigrations();

    // DATABASE_URL 是文件路径，去掉 file: 前缀后交给 DatabaseSync
    expect(mockDatabaseSync).toHaveBeenCalledWith("/tmp/hub-migrate-test/data.db");
    // node:sqlite 不建父目录，迁移前要先把库文件所在目录建出来
    expect(mockMkdirSync).toHaveBeenCalledWith("/tmp/hub-migrate-test", { recursive: true });
    expect(mockExec).toHaveBeenCalled();
    expect(mockDrizzle).toHaveBeenCalledWith({ client: expect.anything() });
    expect(mockMigrate).toHaveBeenCalledWith(
      "migration-db",
      expect.objectContaining({ migrationsTable: "__drizzle_migrations" }),
    );
  });

  it("DATABASE_URL 未设置时回落到默认库文件，:memory: 不创建目录", async () => {
    mockExistsSync.mockReturnValue(true);
    vi.stubEnv("DATABASE_URL", "");
    await runMigrations();
    expect(mockDatabaseSync).toHaveBeenLastCalledWith("./data/data.db");
    expect(mockMkdirSync).toHaveBeenCalledWith("./data", { recursive: true });

    vi.stubEnv("DATABASE_URL", ":memory:");
    await runMigrations();
    expect(mockDatabaseSync).toHaveBeenLastCalledWith(":memory:");
    expect(mockMkdirSync).toHaveBeenCalledTimes(1);
  });
});
