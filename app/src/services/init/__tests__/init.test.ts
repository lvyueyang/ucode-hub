/**
 * 系统初始化服务测试：状态检查 + 初始化流程
 */

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#/shared-services/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("#/shared-services/config/config.server", () => ({
  upsertConfig: vi.fn(),
  loadConfigCache: vi.fn(),
}));

vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn().mockResolvedValue("hashed_password") },
}));

const { mockDb, mockRows } = vi.hoisted(() => {
  const rows = vi.fn().mockReturnValue([]);

  /** 构造 select 查询链：各环节返回自身，`.all()` 同步给出行数组，整体也可 await */
  const createChain = () => {
    const chain: any = {
      from: vi.fn(() => chain),
      where: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      offset: vi.fn(() => chain),
      innerJoin: vi.fn(() => chain),
      all: vi.fn(() => rows()),
      get: vi.fn(() => rows()[0]),
    };
    Object.defineProperty(chain, "then", {
      value: (onFulfilled: (value: unknown) => unknown) =>
        Promise.resolve(rows()).then(onFulfilled),
    });
    return chain;
  };

  return {
    mockRows: rows,
    mockDb: {
      select: vi.fn(() => createChain()),
      $count: vi.fn(),
      insert: vi.fn((): unknown => ({
        values: vi.fn(() => ({ returning: vi.fn(), run: vi.fn() })),
      })),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => ({ run: vi.fn() })) })) })),
      delete: vi.fn(() => ({ where: vi.fn(() => ({ run: vi.fn() })) })),
      // initSystem 改走手动事务（BEGIN / COMMIT / ROLLBACK），不再经过 db.transaction
      run: vi.fn(),
    },
  };
});
vi.mock("#/db", () => ({ db: mockDb }));

import { checkInitStatus, initSystem } from "#/services/init/init.server";

/**
 * 构造 insert(表).values(...) 的链式实现：`.returning().all()` 同步返回指定行（超级角色用
 * onConflictDoNothing().returning().all()），写入不需要返回值时走 `.run()`
 */
function insertChainReturning(data: Record<string, unknown>) {
  const row = () => [data];
  return () => ({
    values: () => ({
      onConflictDoNothing: () => ({ returning: () => ({ all: row }) }),
      returning: () => ({ all: row }),
      run: () => undefined,
    }),
  });
}

describe("checkInitStatus", () => {
  beforeEach(() => vi.clearAllMocks());

  it("系统未初始化时返回 false", async () => {
    mockRows.mockReturnValue([]);
    const result = await checkInitStatus();
    expect(result).toBe(false);
  });

  it("系统已初始化时返回 true", async () => {
    mockRows.mockReturnValue([{ id: "root-1", username: "admin", isRoot: true }]);
    const result = await checkInitStatus();
    expect(result).toBe(true);
  });
});

describe("initSystem", () => {
  const validInput = {
    admin: { username: "admin", password: "test123", email: "admin@test.com" },
    siteName: "Test Site",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("初始化成功，创建角色、管理员用户并写入配置", async () => {
    mockRows.mockReturnValue([]);
    mockDb.insert.mockImplementation(
      insertChainReturning({ id: "role-1", name: "超级管理员", slug: "super-admin" }),
    );

    const result = await initSystem(validInput);
    expect(result.success).toBe(true);
    expect(result.message).toContain("系统初始化完成");
    // 手动事务：BEGIN 起、COMMIT 收尾，成功路径不回滚
    expect(mockDb.run).toHaveBeenCalledWith(sql.raw("BEGIN"));
    expect(mockDb.run).toHaveBeenCalledWith(sql.raw("COMMIT"));
    expect(mockDb.run).not.toHaveBeenCalledWith(sql.raw("ROLLBACK"));
  });

  it("系统已初始化时返回失败", async () => {
    // 事务内再次校验查到 root，走早退路径（先 ROLLBACK 再返回）
    mockRows.mockReturnValue([{ id: "root-1", username: "admin", isRoot: true }]);

    const result = await initSystem(validInput);
    expect(result.success).toBe(false);
    expect(result.message).toBe("系统已初始化，禁止重复操作");
    // 早退必须先回滚，否则手动事务悬挂
    expect(mockDb.run).toHaveBeenCalledWith(sql.raw("ROLLBACK"));
    expect(mockDb.run).not.toHaveBeenCalledWith(sql.raw("COMMIT"));
  });

  it("未传入站点名称时不写入 site_name 配置", async () => {
    const { upsertConfig } = await import("#/shared-services/config/config.server");

    mockRows.mockReturnValue([]);
    mockDb.insert.mockImplementation(
      insertChainReturning({ id: "role-1", name: "超级管理员", slug: "super-admin" }),
    );

    const inputWithoutSite = {
      admin: {
        username: "admin",
        password: "test123",
        email: "admin@test.com",
      },
    };
    await initSystem(inputWithoutSite);

    const siteNameCalls = (upsertConfig as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call: unknown[]) => call[0] === "site_name",
    );
    expect(siteNameCalls).toHaveLength(0);
  });

  it("传入 SMTP 配置时写入对应配置项", async () => {
    const { upsertConfig } = await import("#/shared-services/config/config.server");

    mockRows.mockReturnValue([]);
    mockDb.insert.mockImplementation(
      insertChainReturning({ id: "role-1", name: "超级管理员", slug: "super-admin" }),
    );

    const inputWithSmtp = {
      admin: {
        username: "admin",
        password: "test123",
        email: "admin@test.com",
      },
      smtp: {
        host: "smtp.example.com",
        port: 587,
        secure: true,
        user: "user@example.com",
        pass: "secret",
        from: "noreply@example.com",
      },
    };
    await initSystem(inputWithSmtp);

    expect(upsertConfig).toHaveBeenCalledWith(
      "smtp_host",
      "smtp.example.com",
      expect.any(String),
      "input",
      "邮件设置",
    );
    expect(upsertConfig).toHaveBeenCalledWith(
      "smtp_port",
      "587",
      expect.any(String),
      "number",
      "邮件设置",
    );
    expect(upsertConfig).toHaveBeenCalledWith(
      "smtp_secure",
      "true",
      expect.any(String),
      "boolean",
      "邮件设置",
    );
    expect(upsertConfig).toHaveBeenCalledWith(
      "smtp_user",
      "user@example.com",
      expect.any(String),
      "input",
      "邮件设置",
    );
    expect(upsertConfig).toHaveBeenCalledWith(
      "smtp_pass",
      "secret",
      expect.any(String),
      "input",
      "邮件设置",
    );
    expect(upsertConfig).toHaveBeenCalledWith(
      "smtp_from",
      "noreply@example.com",
      expect.any(String),
      "input",
      "邮件设置",
    );
  });

  it("SMTP 配置中 secure 为 false 时写入 'false' 字符串", async () => {
    const { upsertConfig } = await import("#/shared-services/config/config.server");

    mockRows.mockReturnValue([]);
    mockDb.insert.mockImplementation(
      insertChainReturning({ id: "role-1", name: "超级管理员", slug: "super-admin" }),
    );

    const inputWithSmtp = {
      admin: {
        username: "admin",
        password: "test123",
        email: "admin@test.com",
      },
      smtp: { host: "smtp.example.com", secure: false },
    };
    await initSystem(inputWithSmtp);

    expect(upsertConfig).toHaveBeenCalledWith(
      "smtp_secure",
      "false",
      expect.any(String),
      "boolean",
      "邮件设置",
    );
  });

  it("SMTP 配置中的可选字段为空时不写入对应配置", async () => {
    const { upsertConfig } = await import("#/shared-services/config/config.server");

    mockRows.mockReturnValue([]);
    mockDb.insert.mockImplementation(
      insertChainReturning({ id: "role-1", name: "超级管理员", slug: "super-admin" }),
    );

    const inputWithSmtp = {
      admin: {
        username: "admin",
        password: "test123",
        email: "admin@test.com",
      },
      smtp: { host: "smtp.example.com" },
    };
    await initSystem(inputWithSmtp);

    expect(upsertConfig).toHaveBeenCalledWith(
      "smtp_host",
      "smtp.example.com",
      expect.any(String),
      "input",
      "邮件设置",
    );
    // secure 始终会写入（因为 smtp 对象存在就会走 smtp.secure 分支）
    expect(upsertConfig).toHaveBeenCalledWith(
      "smtp_secure",
      "false",
      expect.any(String),
      "boolean",
      "邮件设置",
    );
    // 未传入的字段不应被调用
    expect(upsertConfig).not.toHaveBeenCalledWith(
      "smtp_port",
      expect.any(String),
      expect.any(String),
    );
    expect(upsertConfig).not.toHaveBeenCalledWith(
      "smtp_user",
      expect.any(String),
      expect.any(String),
    );
    expect(upsertConfig).not.toHaveBeenCalledWith(
      "smtp_pass",
      expect.any(String),
      expect.any(String),
    );
    expect(upsertConfig).not.toHaveBeenCalledWith(
      "smtp_from",
      expect.any(String),
      expect.any(String),
    );
  });

  it("初始化成功后重新加载配置缓存", async () => {
    const { loadConfigCache } = await import("#/shared-services/config/config.server");

    mockRows.mockReturnValue([]);
    mockDb.insert.mockImplementation(
      insertChainReturning({ id: "role-1", name: "超级管理员", slug: "super-admin" }),
    );

    await initSystem(validInput);
    expect(loadConfigCache).toHaveBeenCalled();
  });
});
