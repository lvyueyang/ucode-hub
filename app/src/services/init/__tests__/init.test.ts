/**
 * 系统初始化服务测试：状态检查 + 初始化流程
 */

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

const { mockDb, mockRows, mockTx } = vi.hoisted(() => {
  const createChain = (rows: () => Promise<unknown[]>) => {
    const chain: any = {
      from: vi.fn(() => chain),
      where: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      offset: vi.fn(() => chain),
      innerJoin: vi.fn(() => chain),
    };
    Object.defineProperty(chain, "then", {
      value: (onFulfilled: (value: unknown) => unknown) => rows().then(onFulfilled),
    });
    return chain;
  };

  /** 创建事务 mock：select 走链式查询，行数组由 txRows 控制 */
  const createTx = () => {
    const txRows = vi.fn().mockResolvedValue([]);
    return {
      txRows,
      tx: {
        select: vi.fn(() => createChain(txRows)),
        insert: vi.fn(),
      },
    };
  };

  const rows = vi.fn().mockResolvedValue([]);
  return {
    mockRows: rows,
    mockDb: {
      select: vi.fn(() => createChain(rows)),
      $count: vi.fn(),
      insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn() })) })),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
      delete: vi.fn(() => ({ where: vi.fn() })),
      transaction: vi.fn(),
    },
    mockTx: createTx,
  };
});
vi.mock("#/db", () => ({ db: mockDb, withTransaction: mockDb.transaction }));

import { checkInitStatus, initSystem } from "#/services/init/init.server";

/**
 * 构造 insert(表).values(...).returning() 的链式 mock，返回指定数据
 * 支持 onConflictDoNothing().returning() 链（init 超级角色创建使用）
 */
function mockInsertReturning(data: Record<string, unknown>) {
  return vi.fn(() => ({
    values: vi.fn(() => ({
      onConflictDoNothing: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([data]),
      })),
      returning: vi.fn().mockResolvedValue([data]),
    })),
  }));
}

describe("checkInitStatus", () => {
  beforeEach(() => vi.clearAllMocks());

  it("系统未初始化时返回 false", async () => {
    mockRows.mockResolvedValue([]);
    const result = await checkInitStatus();
    expect(result).toBe(false);
  });

  it("系统已初始化时返回 true", async () => {
    mockRows.mockResolvedValue([
      {
        id: "root-1",
        username: "admin",
        isRoot: true,
      },
    ]);
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
    mockDb.transaction.mockImplementation(async (cb: CallableFunction) => {
      const { tx, txRows } = mockTx();
      txRows.mockReset().mockResolvedValue([]);
      tx.insert = mockInsertReturning({
        id: "role-1",
        name: "超级管理员",
        slug: "super-admin",
      });
      return cb(tx);
    });

    const result = await initSystem(validInput);
    expect(result.success).toBe(true);
    expect(result.message).toContain("系统初始化完成");
  });

  it("系统已初始化时返回失败", async () => {
    mockDb.transaction.mockImplementation(async (cb: CallableFunction) => {
      const { tx, txRows } = mockTx();
      txRows.mockReset().mockResolvedValue([
        {
          id: "root-1",
          username: "admin",
          isRoot: true,
        },
      ]);
      return cb(tx);
    });

    const result = await initSystem(validInput);
    expect(result.success).toBe(false);
    expect(result.message).toBe("系统已初始化，禁止重复操作");
  });

  it("未传入站点名称时不写入 site_name 配置", async () => {
    const { upsertConfig } = await import("#/shared-services/config/config.server");

    mockDb.transaction.mockImplementation(async (cb: CallableFunction) => {
      const { tx, txRows } = mockTx();
      txRows.mockReset().mockResolvedValue([]);
      tx.insert = mockInsertReturning({
        id: "role-1",
        name: "超级管理员",
        slug: "super-admin",
      });
      return cb(tx);
    });

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

    mockDb.transaction.mockImplementation(async (cb: CallableFunction) => {
      const { tx, txRows } = mockTx();
      txRows.mockReset().mockResolvedValue([]);
      tx.insert = mockInsertReturning({
        id: "role-1",
        name: "超级管理员",
        slug: "super-admin",
      });
      return cb(tx);
    });

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

    mockDb.transaction.mockImplementation(async (cb: CallableFunction) => {
      const { tx, txRows } = mockTx();
      txRows.mockReset().mockResolvedValue([]);
      tx.insert = mockInsertReturning({
        id: "role-1",
        name: "超级管理员",
        slug: "super-admin",
      });
      return cb(tx);
    });

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

    mockDb.transaction.mockImplementation(async (cb: CallableFunction) => {
      const { tx, txRows } = mockTx();
      txRows.mockReset().mockResolvedValue([]);
      tx.insert = mockInsertReturning({
        id: "role-1",
        name: "超级管理员",
        slug: "super-admin",
      });
      return cb(tx);
    });

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

    mockDb.transaction.mockImplementation(async (cb: CallableFunction) => {
      const { tx, txRows } = mockTx();
      txRows.mockReset().mockResolvedValue([]);
      tx.insert = mockInsertReturning({
        id: "role-1",
        name: "超级管理员",
        slug: "super-admin",
      });
      return cb(tx);
    });

    await initSystem(validInput);
    expect(loadConfigCache).toHaveBeenCalled();
  });
});
