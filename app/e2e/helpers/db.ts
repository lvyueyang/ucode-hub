/**
 * e2e 数据库访问封装：种子数据与验证码直插
 */

import bcrypt from "bcryptjs";
import { Pool } from "pg";
import { getE2eDbUrl } from "./env";

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

let pool: Pool | null = null;

/** 获取 e2e 数据库连接池（懒加载单例） */
export function getPool(): Pool {
  pool ??= new Pool({ connectionString: getE2eDbUrl() });
  return pool;
}

/** 关闭连接池 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * 种子基础数据：预置角色 + root 管理员 + 客户端测试用户
 * 服务启动时 bootstrap 已自动迁移建表并预置配置/字典/翻译，这里只补账号与角色
 */
export async function seedBaseData(): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    // 预置管理端角色（super-admin，root 管理员绑定）
    const superAdmin = await client.query<{ id: string }>(
      `INSERT INTO admin_role (name, slug, permissions, description)
			 VALUES ('超级管理员', 'super-admin', '["**"]', '拥有全部权限的超级管理员角色')
			 RETURNING id`,
    );
    // 预置客户端角色（注册时需分配 normal-user）
    await client.query(
      `INSERT INTO client_role (name, slug, permissions, description)
			 VALUES ('普通用户', 'normal-user', '[]', '默认注册用户的角色')`,
    );
    await client.query(
      `INSERT INTO client_role (name, slug, permissions, description)
			 VALUES ('超级用户', 'client-super-admin', '["**"]', '拥有全部客户端权限的角色')`,
    );
    // root 管理员（isRoot 唯一，绑定 super-admin 角色）
    const adminHash = await bcrypt.hash(ROOT_ADMIN.password, 10);
    await client.query(
      `INSERT INTO admin_user (username, email, password_hash, admin_role_ids, is_root, status)
			 VALUES ($1, $2, $3, $4, true, 'active')`,
      [ROOT_ADMIN.username, ROOT_ADMIN.email, adminHash, JSON.stringify([superAdmin.rows[0].id])],
    );
    // 客户端测试用户（绑定 normal-user 角色）
    const clientHash = await bcrypt.hash(CLIENT_USER.password, 10);
    await client.query(
      `INSERT INTO client_user (username, email, password_hash, client_role_ids, status, email_verified)
			 VALUES ($1, $2, $3, $4, 'active', true)`,
      [CLIENT_USER.username, CLIENT_USER.email, clientHash, JSON.stringify([])],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 直插邮箱验证码（绕开图片验证码弹窗与 SMTP 邮件链路）
 * @param email 目标邮箱
 * @param code 6 位验证码，默认 123456
 */
export async function seedCaptcha(email: string, code = "123456"): Promise<void> {
  await getPool().query(
    `INSERT INTO captcha_code (type, target, code, used, expired_at)
		 VALUES ('email', $1, $2, false, now() + interval '5 minutes')`,
    [email, code],
  );
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
  const hash = await bcrypt.hash(password, 10);
  await getPool().query(
    `INSERT INTO client_user (username, email, password_hash, client_role_ids, status, email_verified)
		 VALUES ($1, $2, $3, $4, 'active', true)`,
    [username, email, hash, JSON.stringify([])],
  );
  return username;
}
