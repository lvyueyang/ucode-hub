/**
 * e2e 数据库访问封装：直连隔离库文件，种子账号与验证码直插
 */

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { drizzle, type NodeSQLiteDatabase } from "drizzle-orm/node-sqlite";
import {
  adminRole,
  adminUser,
  captchaCode,
  clientRole,
  clientUser,
} from "../../src/db/schema/index";
import { getE2eDbPath } from "./env";

/** e2e 根管理员邮箱：可经 E2E_ADMIN_EMAIL 覆盖，默认中性域名 */
const e2eAdminEmail = process.env.E2E_ADMIN_EMAIL ?? "root@example.com";

/** e2e 客户端用户邮箱：可经 E2E_CLIENT_EMAIL 覆盖，默认中性域名 */
const e2eClientEmail = process.env.E2E_CLIENT_EMAIL ?? "client01@example.com";

/** 根管理员测试账号（globalSetup 种子） */
export const ROOT_ADMIN = {
  username: "root",
  password: "Admin123!",
  email: e2eAdminEmail,
};

/** 客户端测试账号（globalSetup 种子） */
export const CLIENT_USER = {
  username: "client01",
  password: "Client123!",
  email: e2eClientEmail,
};

/** drizzle 实例类型：`$client` 是底层 node:sqlite 连接，关闭连接需要它 */
type E2eDb = NodeSQLiteDatabase & { $client: DatabaseSync };

let db: E2eDb | null = null;

/** 获取 e2e 数据库实例（懒加载单例，直连隔离库文件） */
export function getE2eDb(): E2eDb {
  if (!db) {
    const dbPath = getE2eDbPath();
    // 库文件所在目录在重置时被删掉，node:sqlite 不会自动创建父目录
    mkdirSync(dirname(dbPath), { recursive: true });
    const sqlite = new DatabaseSync(dbPath);
    // WAL 与 app 侧一致；foreign_keys 由 node:sqlite 默认开启
    sqlite.exec("PRAGMA journal_mode = WAL");
    db = drizzle({ client: sqlite });
  }
  return db;
}

/** 关闭 e2e 数据库连接（释放库文件句柄） */
export function closeE2eDb(): void {
  db?.$client.close();
  db = null;
}

/**
 * 种子基础数据：预置角色 + root 管理员 + 客户端测试用户
 * 服务启动时 bootstrap 已自动迁移建表并预置配置/字典/翻译，这里只补账号与角色
 */
export async function seedBaseData(): Promise<void> {
  const database = getE2eDb();
  // 事务内含 bcrypt 哈希这类异步操作，而 node:sqlite 的事务回调必须同步（异步回调会让 COMMIT 提前执行），
  // 故走手动事务；此流程无早退分支，只有 catch 里的回滚
  database.run(sql.raw("BEGIN"));
  try {
    // 预置管理端角色（super-admin，root 管理员绑定）
    const superAdmin = database
      .insert(adminRole)
      .values({
        name: "超级管理员",
        slug: "super-admin",
        permissions: ["**"],
        description: "拥有全部权限的超级管理员角色",
      })
      .returning()
      .all()[0];
    // 预置客户端角色（注册时需分配 normal-user）
    database
      .insert(clientRole)
      .values([
        {
          name: "普通用户",
          slug: "normal-user",
          permissions: [],
          description: "默认注册用户的角色",
        },
        {
          name: "超级用户",
          slug: "client-super-admin",
          permissions: ["**"],
          description: "拥有全部客户端权限的角色",
        },
      ])
      .run();
    // root 管理员（isRoot 唯一，绑定 super-admin 角色）
    const adminHash = await bcrypt.hash(ROOT_ADMIN.password, 10);
    database
      .insert(adminUser)
      .values({
        username: ROOT_ADMIN.username,
        email: ROOT_ADMIN.email,
        passwordHash: adminHash,
        adminRoleIds: [superAdmin.id],
        isRoot: true,
        status: "active",
      })
      .run();
    // 客户端测试用户（角色留空，与注册默认一致）
    const clientHash = await bcrypt.hash(CLIENT_USER.password, 10);
    database
      .insert(clientUser)
      .values({
        username: CLIENT_USER.username,
        email: CLIENT_USER.email,
        passwordHash: clientHash,
        status: "active",
        emailVerified: true,
      })
      .run();
    database.run(sql.raw("COMMIT"));
  } catch (err) {
    database.run(sql.raw("ROLLBACK"));
    throw err;
  }
}

/**
 * 直插邮箱验证码（绕开图片验证码弹窗与 SMTP 邮件链路）
 * @param email 目标邮箱
 * @param code 6 位验证码，默认 123456
 */
export async function seedCaptcha(email: string, code = "123456"): Promise<void> {
  getE2eDb()
    .insert(captchaCode)
    .values({
      type: "email",
      target: email,
      code,
      // 与投递链路相同的 5 分钟有效期
      expiredAt: new Date(Date.now() + 5 * 60 * 1000),
    })
    .run();
}

/**
 * 直插客户端测试用户（供忘记密码等需要既有账号的场景使用）
 * @returns 用户名
 */
export async function seedClientUser(
  username: string,
  email: string,
  password: string,
): Promise<string> {
  const passwordHash = await bcrypt.hash(password, 10);
  getE2eDb()
    .insert(clientUser)
    .values({
      username,
      email,
      passwordHash,
      status: "active",
      emailVerified: true,
    })
    .run();
  return username;
}
