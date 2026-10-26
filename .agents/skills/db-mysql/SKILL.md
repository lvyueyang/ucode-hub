---
name: db-mysql
description: >
  数据库迁移至 MySQL 指南（drizzle v1 + mysql2 异步驱动）。当基于本仓（hub）衍生新项目、
  需要把 PostgreSQL 切换为 MySQL，或评估 MySQL 作为目标库时触发。
  基于 drizzle v1.0（rc.4）+ query builder 风格基态，覆盖驱动接入、Schema 类型映射、
  约束差异、SQL 适配与迁移流程；MySQL 驱动为异步，事务与普通查询全部保持 await 风格。
---

# 数据库迁移：PostgreSQL → MySQL

## 快速索引

| 需求 | 跳转 |
|------|------|
| 为什么 MySQL 迁移面最小 | → [基态与选型](#0-基态与选型) |
| 依赖与配置改动 | → [依赖变更](#1-依赖变更) / [配置文件变更](#2-配置文件变更) |
| Schema 类型映射 | → [Schema 迁移](#3-schema-迁移) |
| db 客户端与迁移器 | → [DB 客户端](#4-db-客户端) |
| 事务与查询完全不变 | → [事务与查询层](#5-事务与查询层异步保持) |
| ILIKE / db.execute / 时间序列 | → [服务端 SQL 适配](#6-服务端-sql-适配) |
| 时间戳继续用 Date | → [日期时间处理](#7-日期时间处理) |
| 测试零改动 | → [测试](#8-测试) |
| 迁移执行流程 | → [迁移执行流程](#9-迁移执行流程) |
| MySQL 常见报错 | → [常见错误排查](#10-常见错误排查) |

## 0. 基态与选型

本项目基态为 **drizzle v1.0.0-rc.4 + PostgreSQL + query builder 风格**（RQB v1 已移除，不定义 relations，迁移目录 v3，`db:migrate` 走 `migrate-cli.ts`）。

**MySQL 是三个目标库中迁移面最小的**：`mysql2` 是纯 JS 异步驱动，Drizzle 的 mysql-core 与 pg-core 差异极小。与 SQLite（node:sqlite）相比，MySQL **事务仍支持 async 回调**，时间戳仍用 `Date`，因此**服务层查询、事务、测试全部零改动**，主要成本集中在 Schema 类型映射与少量 SQL 语法差异。

> 选型提示：MySQL 需独立服务进程/容器（非嵌入式），适合多实例、多写并发的衍生项目；单机项目优先 SQLite（见 [db-sqlite](../db-sqlite/SKILL.md)）。

## 1. 依赖变更

```bash
# 移除 PostgreSQL 驱动
pnpm remove pg @types/pg

# 安装 MySQL 驱动（纯 JS，无需 approve-builds）
pnpm add mysql2
pnpm add -D @types/mysql2
```

drizzle-orm / drizzle-kit 保持 `1.0.0-rc.4` 不动。

## 2. 配置文件变更

### 2.1 `drizzle.config.ts`

```diff
- dialect: 'postgresql',
+ dialect: 'mysql',
  dbCredentials: {
-   url: process.env.DATABASE_URL || "",
+   url: process.env.DATABASE_URL || "mysql://user:password@localhost:3306/hub_web",
  },
```

### 2.2 `app/.env.example`

```diff
- # PostgreSQL 连接 URL（必填）
- DATABASE_URL="postgresql://postgres:your-password@host.docker.internal:5432/hub_web"
+ # MySQL 连接 URL（必填）
+ DATABASE_URL="mysql://user:your-password@localhost:3306/hub_web"
```

### 2.3 `src/vite-env.d.ts`

```diff
- /** PostgreSQL 连接 URL */
+ /** MySQL 连接 URL */
  DATABASE_URL: string;
```

### 2.4 `app/vitest.config.ts`

```diff
- DATABASE_URL: "postgres://test:test@localhost:5432/testdb",
+ DATABASE_URL: "mysql://test:test@localhost:3306/testdb",
```

测试全部 mock `#/db`，`DATABASE_URL` 仅供真实驱动初始化兜底。

## 3. Schema 迁移

### 3.1 import 源变更

所有 `src/db/schema/*.ts` 文件（数量以 `src/db/schema/` 实际为准）：

```diff
- import { pgTable, uuid, varchar, timestamp, boolean, jsonb, integer, bigint, index, uniqueIndex, unique } from "drizzle-orm/pg-core";
+ import { mysqlTable, varchar, timestamp, boolean, json, int, bigint, index, uniqueIndex, unique, char } from "drizzle-orm/mysql-core";
```

### 3.2 列类型映射表

| PostgreSQL (pg-core) | MySQL (mysql-core) | 说明 |
|---|---|---|
| `pgTable("table_name")` | `mysqlTable("table_name")` | 表定义 |
| `uuid().defaultRandom().primaryKey()` | `char("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID())` | MySQL 无 uuid 类型，用 `char(36)` + 应用层生成 |
| `uuid("column_name")` | `char("column_name", { length: 36 })` | UUID 外键/普通列 |
| `timestamp("col", { withTimezone: true }).defaultNow().notNull()` | `timestamp("col").defaultNow().notNull()` | JS 类型仍为 `Date`（无需改 number） |
| `jsonb("col").$type<T>()` | `json("col").$type<T>()` | JSON 类型，`$type` 必须保留 |
| `boolean("col")` | `boolean("col")` | MySQL 存 tinyint(1)，JS 类型 `boolean` |
| `bigint({ mode: "number" })` | `bigint("col", { mode: "number" })` | 保持（`file.size`） |
| `integer("col")` | `int("col")` | 整数 |
| `varchar({ length: N })` | `varchar("col", { length: N })` | 保留长度约束（MySQL 必须） |
| `text()` | `text("col")` | MySQL 的 text 需显式列名（同 pg） |

### 3.3 约束差异处理

**部分唯一索引（Partial Unique Index）**

MySQL 8 同样**不支持**部分索引/条件唯一索引。本项目案例（`admin_user.is_root` 单 root 约束）：

```diff
- uniqueIndex("idx_admin_user_single_root").on(table.isRoot).where(sql`${table.isRoot} = true`),
+ // 移除，应用层校验已存在（init.server.ts 的 checkInitStatus + 事务内二次校验）
```

**ON UPDATE CASCADE**：MySQL 外键**原生支持**，保留不动：

```ts
dictSlug: varchar("dict_slug", { length: 50 })
	.references(() => dict.slug, { onUpdate: "cascade" })
	.notNull(),
```

**降序索引**：MySQL 支持 DESC 索引，Drizzle mysql-core 的 `on()` 接受列方向，保留：

```ts
index("idx_track_event_time").on(table.time.desc()),
```

**json 列默认值**：MySQL 的 `json` 类型不接受普通字面量/字符串默认值（仅 8.0.13+ 支持表达式默认，且 drizzle 对 json `.default()` 的渲染不可靠）。**迁移时移除 json 列默认值，应用层写入时显式赋值**——本项目所有 insert 均已显式提供 `adminRoleIds` / `clientRoleIds` / `permissions`（init、注册、角色创建路径），去掉 `.default([])` 无副作用。

### 3.4 示例：完整表迁移

**迁移前（admin_user）**：

```ts
import { sql } from "drizzle-orm";
import { boolean, jsonb, pgTable, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

export const adminUser = pgTable(
	"admin_user",
	{
		id: uuid().defaultRandom().primaryKey(),
		username: varchar({ length: 50 }).unique().notNull(),
		email: varchar({ length: 255 }).unique().notNull(),
		passwordHash: varchar("password_hash", { length: 255 }).notNull(),
		avatar: varchar({ length: 500 }),
		adminRoleIds: jsonb("admin_role_ids").$type<string[]>().default([]).notNull(),
		isRoot: boolean("is_root").default(false).notNull(),
		status: varchar({ length: 20 }).default("active").notNull(),
		lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
	},
	(table) => [
		uniqueIndex("idx_admin_user_single_root").on(table.isRoot).where(sql`${table.isRoot} = true`),
	],
);
```

**迁移后**：

```ts
import { boolean, char, json, mysqlTable, timestamp, varchar } from "drizzle-orm/mysql-core";

export const adminUser = mysqlTable(
	"admin_user",
	{
		id: char("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
		username: varchar("username", { length: 50 }).unique().notNull(),
		email: varchar("email", { length: 255 }).unique().notNull(),
		passwordHash: varchar("password_hash", { length: 255 }).notNull(),
		avatar: varchar("avatar", { length: 500 }),
		// json 列不支持默认值，移除 .default([])（见 §3.3），应用层每次写入显式赋值
		adminRoleIds: json("admin_role_ids").$type<string[]>().notNull(),
		isRoot: boolean("is_root").default(false).notNull(),
		status: varchar("status", { length: 20 }).default("active").notNull(),
		lastLoginAt: timestamp("last_login_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
		deletedAt: timestamp("deleted_at"),
	},
);
```

> MySQL 的 timestamp 模式：`timestamp("col")` 默认以 `date` 模式映射为 JS `Date`；如需 Unix 毫秒可加 `{ mode: "string" | "date" }`。本项目沿用 PG 的 `Date` 语义，不加 mode 即可。

## 4. DB 客户端

### 4.1 `src/db/index.ts`

```ts
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema/index";

function createDb() {
	// 连接池：并发场景必须使用 pool，避免单连接串行化
	const pool = mysql.createPool(process.env.DATABASE_URL!);
	return drizzle(pool, { schema });
}

let _dbInstance: ReturnType<typeof createDb> | null = null;

/** 懒加载 db 实例的 Proxy：所有属性访问触发时初始化，延迟 db 实例初始化至首次属性访问 */
export const db = new Proxy({} as any, {
	get(_, prop) {
		if (!_dbInstance) {
			_dbInstance = createDb();
		}
		return (_dbInstance as any)[prop];
	},
}) as unknown as ReturnType<typeof createDb>;
```

### 4.2 `src/db/migrate.ts`

```ts
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { logger } from "#/shared-services/logger";

export async function runMigrations() {
	const migrationsFolder = resolve(process.cwd(), "drizzle");
	if (!existsSync(migrationsFolder)) {
		logger.warn({ migrationsFolder }, "迁移目录不存在，跳过数据库迁移");
		return;
	}
	const pool = mysql.createPool(process.env.DATABASE_URL!);
	const migrationDb = drizzle(pool);

	logger.info({ migrationsFolder }, "开始执行数据库迁移");
	await migrate(migrationDb, {
		migrationsFolder,
		migrationsTable: "__drizzle_migrations",
	});
	logger.info("数据库迁移完成");
}
```

`migrate-cli.ts` 保持不变。MySQL 迁移器为异步，`await migrate(...)` 原样保留。

## 5. 事务与查询层（异步保持）

mysql2 驱动是 **'async' kind**，与 PostgreSQL 完全一致：

- `db.transaction(async (tx) => { await tx.select()... })` **保持不动**（含 init 内 `bcrypt.hash` / `upsertConfig` 等异步操作）
- `await db.select()...`、`await db.insert().values().returning()`、`db.$count()` 全部保持
- 终结符 `.all()/.run()/.get()` 无需添加

**本项目 4 处事务（init/dict/i18n/dicts）与全部查询代码零改动。**

## 6. 服务端 SQL 适配

### 6.1 `ilike()` → `like()`

MySQL 的 `LIKE` 默认大小写不敏感（依赖排序规则，utf8mb4 默认 ci），与 `ilike` 语义等价：

```diff
- import { and, eq, gte, ilike, lt, or } from "drizzle-orm";
+ import { and, eq, gte, like, lt, or } from "drizzle-orm";

- ilike(event.event, `%${keyword}%`)
+ like(event.event, `%${keyword}%`)
```

影响文件（7 个）：`admin-role`、`client-role`、`file`、`i18n`、`message`、`operation-log`、`track` 的 `.server.ts`。

### 6.2 `db.execute()` 返回形状

`mysql2` 驱动保留 `db.execute()`，但返回 `[rows, fields]` 元组（`MySqlRawQueryResult = [ResultSetHeader, FieldPacket[]]`），非 PostgreSQL 的 `{ rows }`：

```diff
- const result = await db.execute(sql`SELECT ...`);
- result.rows  // PostgreSQL: { rows: [...] }
+ const [rows] = await db.execute(sql`SELECT ...`);
+ rows         // mysql2: 元组解构取行数组
```

`track.analytics.ts` 的 `getTrackAnalytics` 全部聚合段（KPI / 事件趋势 / 事件排行 / 维度分布 / Top 页面，均为 `db.execute`）改为元组解构后直接消费 `rows`（去掉 `.rows` 访问与 cast）。

### 6.3 时间序列聚合查询

```diff
// PostgreSQL
- SELECT TO_CHAR(${trackEventTable.time} AT TIME ZONE 'Asia/Shanghai', ${timeFormat}) AS date,
-        COUNT(*)::int AS count
-  WHERE ${trackEventTable.time} >= ${start.toISOString()}

// MySQL
+ SELECT DATE_FORMAT(CONVERT_TZ(${trackEventTable.time}, '+00:00', '+08:00'), '%Y-%m-%d %H:00') AS date,
+        COUNT(*) AS count
+  WHERE ${trackEventTable.time} >= ${start}
```

`timestamp` 列在 MySQL 按会话时区存储/读取；建议会话时区统一为 UTC（`SET time_zone = '+00:00'`），分析查询用 `CONVERT_TZ` 显式转上海时区。

粒度切换见 `timeBucketExpr`：小时 / 日 / 周（周需对齐 `DATE_TRUNC('week')` 的周一，MySQL 可用 `DATE_FORMAT(DATE_SUB(ts, INTERVAL WEEKDAY(ts) DAY), '%Y-%m-%d')`）；趋势查询按 `date` 与 `series`（事件名或拆解维度值）两列分组。

### 6.4 JSON 字段访问

```diff
// PostgreSQL JSONB 操作符
- sql`${trackEventTable.properties}->>'page_name'`

// MySQL JSON
+ sql`JSON_UNQUOTE(JSON_EXTRACT(${trackEventTable.properties}, '$.page_name'))`
```

`count(*)::int` → `COUNT(*)`（MySQL `COUNT` 原生返回 int，无需 cast）。

## 7. 日期时间处理

MySQL `timestamp` 列以 `Date` 模式映射，**`new Date()` 全部保留**，无需改为 `Date.now()`：

```ts
.set({ updatedAt: new Date() })        // 保持不动
gte(file.expiredAt, new Date())        // 保持不动
new Date(params.publishedAt)           // 保持不动
(r.publishedAt ?? r.createdAt).toISOString()  // 保持不动
```

> 与 [db-sqlite](../db-sqlite/SKILL.md) 相反，MySQL 路径没有任何日期类型改造，这是两条迁移路线最重要的差异。

## 8. 测试

测试 mock 全部基于 `await` 风格（`mockRows` / `mockResolvedValue` / `mockDb.$count`），mysql2 异步驱动下**零改动**。事务 mock（`transaction.mockImplementation(async cb => cb(tx))`）同样保持有效，无需终结符节点。

## 9. 迁移执行流程

```bash
# 1. 移除 pg 依赖、安装 mysql2
pnpm remove pg @types/pg
pnpm add mysql2 && pnpm add -D @types/mysql2

# 2. 删除旧 PostgreSQL 迁移文件
rm -rf app/drizzle/

# 3. 生成新的 MySQL 迁移
DATABASE_URL="mysql://user:password@localhost:3306/hub_web" pnpm --filter @ucode/hub db:generate

# 4. 审查生成的 migration.sql（全量表 CREATE TABLE + 外键 + 索引）

# 5. 执行程序化迁移（开发环境；与生产 bootstrap 路径一致）
DATABASE_URL="mysql://user:password@localhost:3306/hub_web" pnpm --filter @ucode/hub db:migrate
```

> ⚠️ **不要用 `db:push`**：push 直接建表会跳过迁移记录，随后 bootstrap 的 `runMigrations()` 对已存在的表重复执行 `CREATE TABLE` 而 fail-fast，与项目「禁止 db:push」约定冲突。统一走 `db:migrate`（`migrate-cli.ts` → `runMigrations()`）。

生产部署：bootstrap `runMigrations()` 启动时自动执行（需 MySQL 服务可达，迁移失败 = 进程启动即崩，fail-fast）。

## 10. 常见错误排查

### 10.1 `ER_NOT_SUPPORTED_YET` / 表达式默认值

**原因**：`json` 列带字面量默认值（`default([])` / `default({})`），MySQL 8 低版本不支持。
**处理**：移除 json 列默认值，应用层写入时显式赋值；或升级 MySQL 8.0.13+ 用 `sql\`(json_array())\``。

### 10.2 `charset` / 中文乱码

**原因**：连接字符集非 utf8mb4。
**处理**：连接 URL 加 `?charset=utf8mb4`，建表 DDL 统一 utf8mb4。

### 10.3 `Cannot add foreign key constraint`

**原因**：外键两侧列类型不一致（如 char(36) vs varchar(36)）。
**处理**：统一外键列类型与长度（uuid 相关列全部 `char(36)`）。

### 10.4 事务隔离 / 死锁

**原因**：MySQL 默认 `REPEATABLE READ`，高并发写可能死锁。
**处理**：本项目事务均为短事务（初始化/导入），无需调整；出现死锁时事务整体失败重试。

## 11. 变更文件总览

| 分类 | 数量 | 说明 |
|------|------|------|
| 配置文件 | 5 | drizzle.config.ts、app/.env.example、src/vite-env.d.ts、.gitignore、vitest.config.ts |
| Schema 文件 | 以实际为准 | 全部 `src/db/schema/*.ts`，pg-core → mysql-core |
| DB 客户端 | 2 | src/db/index.ts（mysql2 pool）、src/db/migrate.ts（mysql2/migrator） |
| 服务端 SQL | 8 | `ilike→like`（7 个文件）、`db.execute` 返回形状 + 时间序列改写（track） |
| 事务 / 日期 / 测试 | 0 | 全部保持不动 |

## 相关 Skill

- 新增/修改数据库表、列命名规则 → [db-schema](../db-schema/SKILL.md)
- 单机/嵌入式场景选用 SQLite → [db-sqlite](../db-sqlite/SKILL.md)
- Server Function 三层分离 → [server-function](../server-function/SKILL.md)
- 测试 mock 三段式模板 → [test-writing](../test-writing/SKILL.md)
