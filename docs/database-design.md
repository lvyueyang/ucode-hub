# 数据库设计

> 定位：平台机制类 · 人类阅读
> 单一事实来源：`src/db/schema/`（index.ts 汇总全部表定义）
> 引用关系：← 被 architecture-overview 引用、README「文档」索引、AGENTS「数据库」章节链接；→ 引用数据表代码单一事实来源
> 更新触发：数据表 / 列定义 / 约束 / 预置数据变更时

## 表总览

> 完整清单与数量以 `src/db/schema/index.ts` 为准，本文件仅说明分组与设计意图。

按用途分为三组（分组归属为设计意图，表清单与数量以代码为准）：

### 业务表

| 表名 | 主键 | 软删除 | 核心职责 |
|------|------|--------|----------|
| `admin_user` | UUID | `deleted_at` | 管理端用户（含 root），`admin_role_ids`（JSONB 角色数组） |
| `client_user` | UUID | `deleted_at` | 前台注册用户，`client_role_ids`（JSONB 角色数组） |
| `admin_role` | UUID | `deleted_at` | 管理端 RBAC 角色，`permissions` 为 JSONB 字符串数组 |
| `client_role` | UUID | `deleted_at` | 客户端 RBAC 角色，`permissions` 为 JSONB 字符串数组 |
| `message` | UUID | `deleted_at` | 通用消息（站内信），`user_type` + `user_id` 定位接收用户（无外键） |
| `dict` | UUID | `deleted_at` | 字典类型（`name` + `slug`） |
| `dict_item` | UUID | `deleted_at` | 字典条目，`dict_slug` FK → dict.slug，唯一约束 `(dict_slug, value)` |

### 系统表

| 表名 | 主键 | 软删除 | 核心职责 |
|------|------|--------|----------|
| `file` | UUID | `deleted_at` | 文件元数据，`sha256` 索引支持秒传 |
| `system_config` | UUID | `deleted_at` | 键值配置（`key` 唯一），含 SMTP/AI/站点设置 |
| `ui_translation` | UUID | — | UI 固定文案翻译，唯一约束 `(locale, key)` |
| `content_translation` | UUID | — | 实体字段翻译，唯一约束 `(entity_type, entity_id, field_name, locale)` |
| `captcha_code` | UUID | — | 验证码记录（邮箱/SMS/图形） |
| `user_config` | UUID | `deleted_at` | 通用用户配置（通知渠道等，jsonb `config`），`user_type` + `user_id` 定位用户，唯一约束 `(user_type, user_id)` |

### 埋点与审计表

| 表名 | 主键 | 软删除 | 核心职责 |
|------|------|--------|----------|
| `track_event` | UUID | — | 埋点原始事件，`name` 为事件名，`properties` 为 JSONB |
| `track_event_meta` | name (varchar) | — | 元事件定义，`is_preset` 标记是否系统预置 |
| `track_property_meta` | key (varchar) | — | 元属性定义，`data_type` 声明值类型 |
| `operation_log` | UUID | — | 操作审计日志（仅用户操作），`operatorType`（camelCase 列）区分 admin/client/system，`request_id` 贯通请求链路，`detail` 为 JSONB |
| `model_usage` | UUID | — | 中继模型端点每次调用一行（成功与失败各记），`account_type` + `account_id` 多态归属（无外键），`device_id` 可空，按 `created_at` 与 `account_id` 各建一个索引 |

---

## ER 图

```mermaid
erDiagram
    admin_user {
        uuid id PK
        varchar username UK
        varchar email UK
        varchar password_hash
        varchar avatar
        jsonb admin_role_ids "角色 id 数组，多角色"
        boolean is_root "部分唯一索引"
        varchar status "active/disabled"
        timestamp last_login_at
        timestamp created_at
        timestamp updated_at
        timestamp deleted_at
    }

    admin_role {
        uuid id PK
        varchar name UK
        varchar slug UK
        jsonb permissions "字符串数组，如 ['dict:*','admin:view']"
        text description
        timestamp created_at
        timestamp updated_at
        timestamp deleted_at
    }

    client_user {
        uuid id PK
        varchar username UK
        varchar email UK
        varchar password_hash
        varchar avatar
        jsonb client_role_ids "角色 id 数组，多角色"
        varchar status "active/disabled"
        boolean email_verified
        timestamp last_login_at
        timestamp created_at
        timestamp updated_at
        timestamp deleted_at
    }

    client_role {
        uuid id PK
        varchar name UK
        varchar slug UK
        jsonb permissions "字符串数组，客户端权限码"
        text description
        timestamp created_at
        timestamp updated_at
        timestamp deleted_at
    }

    message {
        uuid id PK
        varchar user_type "admin/client"
        uuid user_id "无外键"
        varchar title
        text content
        varchar type "system/..."
        varchar status "unread/read"
        varchar related_link
        timestamp created_at
        timestamp updated_at
        timestamp deleted_at
    }

    dict {
        uuid id PK
        varchar name
        varchar slug UK
        text description
        timestamp created_at
        timestamp updated_at
        timestamp deleted_at
    }

    dict_item {
        uuid id PK
        varchar dict_slug FK "CASCADE"
        varchar label
        varchar value
        int sort_order
        varchar status "active/disabled"
        varchar extra_type
        text extra
        varchar color
        timestamp created_at
        timestamp updated_at
        timestamp deleted_at
    }

    file {
        uuid id PK
        varchar sha256 "索引"
        varchar original_name
        varchar stored_name
        varchar mime_type
        bigint size
        varchar path
        varchar status "temp/permanent"
        varchar created_by_type
        uuid created_by_id
        timestamp expired_at "临时文件过期时间"
        timestamp created_at
        timestamp updated_at
        timestamp deleted_at
    }

    system_config {
        uuid id PK
        varchar key UK
        text value
        boolean client_visible
        varchar value_type
        varchar group_name "索引"
        text description
        timestamp created_at
        timestamp updated_at
        timestamp deleted_at
    }

    ui_translation {
        uuid id PK
        varchar locale
        varchar key
        text value
        varchar value_type
        timestamp created_at
        timestamp updated_at
    }

    content_translation {
        uuid id PK
        varchar entity_type "索引"
        varchar entity_id "索引"
        varchar field_name
        varchar locale "索引"
        text value
        varchar value_type
        timestamp created_at
        timestamp updated_at
    }

    track_event {
        uuid id PK
        timestamp time "索引"
        uuid user_id "索引"
        varchar session_id "索引"
        varchar name "索引"
        jsonb properties
        timestamp created_at "索引"
    }

    track_event_meta {
        varchar name PK
        varchar label
        varchar category
        text description
        boolean is_preset
        timestamp created_at
        timestamp updated_at
    }

    track_property_meta {
        varchar key PK
        varchar label
        varchar data_type
        text description
        boolean is_preset
        timestamp created_at
        timestamp updated_at
    }

    operation_log {
        uuid id PK
        varchar request_id "请求关联 ID（x-request-id 透传/生成，贯通日志与审计）"
        uuid operatorId "索引"
        varchar operatorName
        varchar operatorType "admin/client/system"
        varchar module "索引"
        varchar action
        varchar targetType
        varchar targetId
        varchar targetName
        jsonb detail
        timestamp createdAt "索引"
    }

    captcha_code {
        uuid id PK
        varchar type "email/sms/image"
        varchar target
        varchar code
        boolean used
        timestamp expired_at
        timestamp created_at
    }

    user_config {
        uuid id PK
        uuid user_id "无外键"
        varchar user_type "admin/client"
        jsonb config "用户配置，如 notify_channels"
        timestamp created_at
        timestamp updated_at
        timestamp deleted_at
    }

    model_usage {
        uuid id PK
        varchar account_type "admin/client；多态归属，无外键"
        uuid account_id "账号 id，无外键"
        uuid device_id "设备令牌调用才有，可空、无外键"
        varchar model
        varchar provider_id "ai_providers 的对象键"
        int prompt_tokens "可空（上游没回 usage）"
        int completion_tokens "可空"
        int total_tokens "可空"
        int latency_ms
        varchar status "ok/error"
        varchar error_message "失败摘要，成功为空"
        timestamp created_at "索引"
    }

    admin_role ||..o{ admin_user : "admin_role_ids (jsonb 数组，无外键)"
    client_role ||..o{ client_user : "client_role_ids (jsonb 数组，无外键)"
    dict ||--o{ dict_item : "dict_slug FK (CASCADE)"
    admin_user ||..o{ model_usage : "account_id (account_type='admin'，无外键)"
    client_user ||..o{ model_usage : "account_id (account_type='client'，无外键)"
```

---

## 列命名约定

所有表统一遵循以下规则：

| 用途 | 数据库列名 | JS 属性名 | Drizzle 类型 | 备注 |
|------|-----------|----------|-------------|------|
| 主键 | `id` | `id` | `uuid().defaultRandom()` | 一律 UUID |
| 创建时间 | `created_at` | `createdAt` | `timestamp({ withTimezone: true }).defaultNow()` | 自动设置 |
| 更新时间 | `updated_at` | `updatedAt` | `timestamp({ withTimezone: true }).defaultNow().onUpdateNow()` | 自动更新 |
| 软删除 | `deleted_at` | `deletedAt` | `timestamp({ withTimezone: true })` | 非 NULL 表示已删除 |
| 描述 | `description` | `description` | `text()` | — |
| 排序 | `sort_order` | `sortOrder` | `integer().default(0)` | — |
| 外键 | `xxx_id` | `xxxId` | `uuid().references(() => table.id)` | — |

要点：
- 所有列**必须**显式指定数据库列名（如 `createdAt: timestamp("created_at", { withTimezone: true })`）
- timestamp 列**必须**加 `{ withTimezone: true }`
- 新增/修改 Schema 后运行 `pnpm db:generate` 生成迁移文件，审查 SQL 后执行 `pnpm db:migrate`（禁止 `db:push`），重命名列时选择 `rename column`
- **例外**：`operation_log` 为历史表，多数列未显式指定数据库列名（DB 列名即 JS 属性名的 camelCase，如 `operatorId`），仅 `request_id` 为显式 snake_case 映射；新增该表列时按全库约定显式指定 snake_case 列名

---

## 关键约束

### 唯一约束

| 表 | 约束 | 索引类型 |
|----|------|----------|
| `admin_user` | `is_root = true` 仅一条 | 部分唯一索引 `WHERE is_root = true` |
| `admin_user` | `username`, `email` | 普通唯一 |
| `client_user` | `username`, `email` | 普通唯一 |
| `admin_role` | `slug` | 普通唯一 |
| `client_role` | `slug` | 普通唯一 |
| `dict` | `slug` | 普通唯一 |
| `dict_item` | `(dict_slug, value)` | 复合唯一 |
| `system_config` | `key` | 普通唯一 |
| `ui_translation` | `(locale, key)` | 复合唯一 |
| `content_translation` | `(entity_type, entity_id, field_name, locale)` | 复合唯一 |
| `user_config` | `(user_type, user_id)` | 复合唯一 |

### 软删除策略

以下表使用 `deleted_at` 软删除：
`admin_user`、`client_user`、`admin_role`、`client_role`、`user_config`、`message`、`dict`、`dict_item`、`file`、`system_config`

查询时通过 `notDeleted(col)` 工具函数过滤（`isNull(deleted_at)`）。

以下表不设软删除（写入后不可删除或仅逻辑删除）：
`track_event`、`track_event_meta`、`track_property_meta`、`operation_log`、`captcha_code`、`ui_translation`、`content_translation`、`model_usage`

### 外键关系

| 子表 | 列 | 父表 | CASCADE |
|------|----|------|---------|
| `dict_item` | `dict_slug` | `dict.slug` | 仅 UPDATE |

> 用户与角色的关联**无外键**：`admin_user.admin_role_ids` / `client_user.client_role_ids` 为 JSONB 角色 id 数组（多角色，角色被删时数组遗留失效 id，查询时按 id 过滤）。`message`、`user_config` 与 `operation_log` 的接收者/操作者列同样无外键（`userId`、`operatorId`、`user_id` 指向不同类型用户），避免跨表约束。

> `model_usage` 的归属列同样无外键：`account_id` 是 `account_type` 指明的账号 id（`admin_user` / `client_user` 多态），
> `device_id` 只在设备令牌调用时有值（可空）。两者都只是归属标记，账号或设备被删后历史用量仍可读——
> 用量是账目，不能因为对象消失就跟着消失。

---

## 预置数据

系统启动时通过 `ensurePreset*` 函数自动初始化以下预置数据：

| 预置类型 | 入口函数 | 数据内容 |
|----------|----------|----------|
| 字典 | `ensurePresetDicts()` | 预置字典类型和条目 |
| 系统配置 | `ensurePresetConfigs()` | 预置配置项（站点/SMTP/AI/短信，数量以代码为准） |
| 元事件 | `ensurePresetEvents()` | 预置元事件（PageView、FormSubmit、Login、Register、Logout），清理被裁剪项 |
| 元属性 | `ensurePresetProperties()` | 预置元属性（含 `$` 系统属性，数量以代码为准），清理被裁剪项 |
| 客户端角色 | `initSystem()` | `client-super-admin`（`**`）与 `normal-user`（空权限） |
| UI 翻译 | `ensurePresetTranslations()` | 英文翻译种子数据 |

预置数据标记 `is_preset = true`，在管理端不可删除。

---

## 关键文件索引

| 文件 | 职责 |
|------|------|
| `src/db/schema/index.ts` | 全部表统一导出（清单以代码为准） |
| `src/db/index.ts` | Drizzle 客户端懒加载实例 |
| `src/db/schema/*.ts` | 各表 Drizzle Schema 定义 |
| `drizzle/` | 迁移 SQL + meta snapshot（`pnpm db:generate` 生成，bootstrap 启动自动执行） |
| `app/.env.example` | 环境变量模板（`DATABASE_URL`） |
| `app/drizzle.config.ts` | Drizzle Kit 配置（dialect、schema 路径） |
