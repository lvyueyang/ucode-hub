---
description: 数据库迁移至 SQLite：把 hub 的 PostgreSQL 切换为 SQLite（drizzle v1 + node:sqlite 异步驱动），执行驱动/Schema/服务端 SQL/事务/测试全量改造并重建迁移基线
---
# /db-sqlite

> 将本项目数据库方言从 PostgreSQL 切换到 SQLite。本命令是固定执行流程，每步的详细改造规则（类型映射、事务同步化、时间序列 SQL 改写等）见 [db-sqlite](../skills/db-sqlite/SKILL.md) 对应章节。

## 适用场景

- 基于本仓（hub）衍生新项目，目标库改为 SQLite
- 将现有项目的 PostgreSQL 切换为 SQLite（单机/单实例部署）

## 前置条件

- Node.js >= 22.5.0（`node:sqlite` 引入版本）
- 目标平台为单机/单实例部署（SQLite 嵌入式，不适合多写并发场景）
- 变更前确认可回退（迁移目录将整体重建）

## 执行步骤

> 辅助脚本路径：`.agents/skills/db-sqlite/scripts/db-migration.ts`，经 `tsx` 运行，仓库根由脚本位置自推导。

1. **预扫描**：运行 `audit` 子命令，锁定「必改/甄别」两级改动面（见 skill §10.2）
2. **依赖与配置**：移除 `pg`/`@types/pg`，改 `drizzle.config.ts`、`app/.env.example`、`src/vite-env.d.ts`、`.gitignore`、`vitest.config.ts`（见 skill §1、§2）
3. **Schema 迁移**：全部 `src/db/schema/*.ts` 由 pg-core → sqlite-core，按类型映射表逐列改写（见 skill §3）
4. **DB 客户端**：重写 `src/db/index.ts`、`src/db/migrate.ts`（`migrate-cli.ts` 不动）（见 skill §4）
5. **服务端 SQL 适配**：`ilike→like`、`db.execute→db.all`、时间序列聚合改写、jsonb 运算符、`::int` 移除、`rowCount→changes`（见 skill §6）；其中 `ilike→like`、health 探测的 `db.execute→db.all`、message 的 `rowCount→changes` 三项可先用 `fix --ilike --execute --rowcount --write` 机械改写，再人工复核 diff（见 skill §10.2）
6. **日期时间处理**：`new Date()`/`new Date(expr)` → `Date.now()`/`.getTime()`，类型 `Date` → `number`（见 skill §7）
7. **事务同步化**：4 处事务改同步回调 + 终结符，或含异步操作改手动 BEGIN/COMMIT（见 skill §8）
8. **测试适配**：三类改动——事务 mock 终结符、时间戳断言、`rowCount`/`db.execute` 改名（见 skill §9）
9. **重建迁移基线**：删旧 `app/drizzle/` → 建 `app/data/` → `db:generate` → 审查生成的 SQL → `db:migrate`（见 skill §10）
10. **校验与回归**：运行 `verify` 断言 + 本仓库 `pnpm check`（含测试，见 skill §10）
11. **更新 CHANGELOG**：基建变更在 `[Unreleased]` Infrastructure 追加 `[infra]` 条目（说明影响面，见 AGENTS.md 变更日志章节）

## 完成标准

- [ ] `audit` 无「必改」命中（或已全部处理）
- [ ] `verify` 断言全部通过（无 pg 依赖、sqlite 方言、无 pg-core 残留、必改模式 0 命中）
- [ ] 本仓库 `pnpm check` 通过
- [ ] 新 SQLite 迁移基线生成且 `db:migrate` 执行成功
- [ ] CHANGELOG `[infra]` 条目已记录
- [ ] 生产部署适配（`deploy/` 裁剪 pg 容器，见 skill §10.1）

## 引用关联

- [db-sqlite](../skills/db-sqlite/SKILL.md)（改造规范 + 迁移执行流程）
- [db-migration.ts](../skills/db-sqlite/scripts/db-migration.ts)（audit/verify/fix 辅助脚本）
- [db-schema](../skills/db-schema/SKILL.md)（表定义规范）
- [db-mysql](../skills/db-mysql/SKILL.md)（若目标库改为 MySQL）
