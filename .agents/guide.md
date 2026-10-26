# AI 任务导航

> 按任务类型索引「读什么 / 用什么」。规则本体见 [AGENTS.md](../AGENTS.md)；边界模型见 [docs/documentation-architecture.md](../docs/documentation-architecture.md)。
> 本文件只做导航，不重复规则内容。

## 任务 → 资源映射

### 代码开发

| 任务 | 读 / 用 |
|------|---------|
| 理解项目架构 / 分层 / 模块归属 | [architecture](skills/architecture/SKILL.md)、[docs/architecture-overview.md](../docs/architecture-overview.md) |
| 新增 Server Function / API 端点 | [server-function](skills/server-function/SKILL.md) |
| 新增权限码 / 访问控制 | [permission](skills/permission/SKILL.md)、[docs/auth-permission-model.md](../docs/auth-permission-model.md) |
| 新增/修改数据表 / Drizzle Schema | [db-schema](skills/db-schema/SKILL.md)、[docs/database-design.md](../docs/database-design.md) |
| 缓存读写 / 新增缓存实例 | [cache](skills/cache/SKILL.md)、[docs/cache-system.md](../docs/cache-system.md) |
| 编写单元测试 / 修复测试 | [test-writing](skills/test-writing/SKILL.md) |
| 国际化 / 翻译文案 / 实体字段翻译 | [i18n](skills/i18n/SKILL.md)、[docs/i18n.md](../docs/i18n.md) |
| 新增管理端 CRUD 模块 | [admin-crud](skills/admin-crud/SKILL.md) |
| 新增 / 改造管理端页面（列表 / 表格 / 筛选 / 弹窗抽屉 / 表单） | [admin-design](skills/admin-design/SKILL.md)、[docs/admin-design.md](../docs/admin-design.md)、[admin-design 清单](checklists/admin-design.md) |
| 埋点 / 事件分析 | [docs/event-tracking.md](../docs/event-tracking.md)、`src/services/track/` |
| 部署 / 定时任务 / 日志 | [docs/deployment-ops.md](../docs/deployment-ops.md)；生产部署运维见 [deploy/README.md](../deploy/README.md)（仓内目录，非 git 子模块） |

### 工程流程

| 任务 | 命令 |
|------|------|
| 版本发布 | [`/deploy`](commands/deploy.md)（.agents/commands） |
| 全量代码审查 | [`/code-review`](commands/code-review.md)（.agents/commands） |
| 派生新项目（更名） | [`/derive`](commands/derive.md)（.agents/commands） |
| 切 SQLite | [`/db-sqlite`](commands/db-sqlite.md)（.agents/commands） |
| 下游吸收上游 | [`/import-upstream`](commands/import-upstream.md)（.agents/commands，在衍生项目内执行） |
| 上游吸收下游 | [`/backport`](commands/backport.md)（.agents/commands） |

### 上游与协同进化

| 任务 | 读 / 用 |
|------|---------|
| 吸收上游（fsdx）基建变更 | [UPSTREAM.md](../UPSTREAM.md)（基线 + 目录/命名映射 + 刻意偏离）、[upstream-sync](skills/upstream-sync/SKILL.md)、[`/import-upstream`](commands/import-upstream.md) |
| 基于 hub 派生新项目 / 项目更名 | [derive-project](skills/derive-project/SKILL.md)、[docs/project-ecosystem.md](../docs/project-ecosystem.md) |
| 双向同步判定（基建 vs 业务）/ 移植净化 | [upstream-sync](skills/upstream-sync/SKILL.md)、[docs/project-ecosystem.md](../docs/project-ecosystem.md) |
| 切 SQLite | [db-sqlite](skills/db-sqlite/SKILL.md) |
| 切 MySQL | [db-mysql](skills/db-mysql/SKILL.md) |

## 验证清单

| 清单 | 用途 |
|------|------|
| [sfn-checklist](checklists/sfn-checklist.md) | SFn 新增/修改自查 |
| [route-checklist](checklists/route-checklist.md) | 路由新增/修改自查 |
| [component-checklist](checklists/component-checklist.md) | 组件新增/修改自查 |
| [admin-design](checklists/admin-design.md) | 管理端页面（页头 / 表格 / 弹窗抽屉 / 表单）新增或改造自查 |
| [derive-checklist](checklists/derive-checklist.md) | 派生项目（更名）自查 |
| [upstream-sync-checklist](checklists/upstream-sync-checklist.md) | 上游↔下游同步自查 |

## 文档索引

| 层 | 位置 | 说明 |
|----|------|------|
| 规则本体 | [AGENTS.md](../AGENTS.md) | 唯一自动加载，跨模块规则/约定/索引 |
| 边界模型 | [documentation-architecture](../docs/documentation-architecture.md) | 文档体系边界与事实 SSOT 表 |
| 平台机制 | [docs/](../docs/) | architecture-overview / admin-design / database-design / auth-permission-model / cache-system / event-tracking / i18n / deployment-ops / project-ecosystem |
| 历史档案 | [docs/archive/](../docs/archive/) | 已归档版本与历史方案 |
