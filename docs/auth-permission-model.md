# 身份认证与权限模型

> 定位：平台机制类 · 人类阅读
> 单一事实来源：`src/middleware/admin-auth.ts`（adminPermGuard）与 `src/middleware/client-auth.ts`（clientAuthGuard/clientPermGuard）、`src/permissions/`（权限码）、`src/db/schema/admin-role.ts` / `client-role.ts`（角色表）
> 引用关系：← 被 architecture-overview 引用、AGENTS「鉴权中间件」章节链接；→ 引用权限码代码单一事实来源
> 更新触发：认证/授权中间件、RBAC 模型、角色表或权限码变更时

## 概述

本项目采用**双用户体系 + RBAC + JWT** 的认证授权架构：

| 用户体系 | 入口路由 | Cookie 名 | 是否支持 RBAC | 注册方式 |
|----------|----------|-----------|---------------|----------|
| 管理端 (admin) | `/admin/login` | `hub_admin_token` | 是（admin_role 表） | 仅管理员手动创建 |
| 客户端 (client) | `/login` | `hub_client_token` | 是（client_role 表） | 自助注册受 `client_register_enabled` 开关控制（默认关闭）+ 邮箱验证码 |

两套体系使用**独立的 Cookie**，允许同一浏览器同时登录管理员和前台用户。

---

## 整体架构

```mermaid
flowchart TB
    subgraph Browser["浏览器"]
        direction LR
        AdminPage["/admin/*"]
        ClientPage["前台页面"]
    end

    subgraph TanStackStart["TanStack Start"]
        subgraph RequestMiddleware["请求中间件"]
            Locale["localeMiddleware"]
            CSRF["createCsrfMiddleware<br/>(仅 ServerFn)"]
        end

        subgraph ServerFunctions["Server Functions"]
            direction TB
            subgraph AdminSF["管理端 SF"]
                Login["adminLoginSFn"]
                CurrentAdmin["getCurrentAdminSFn"]
                Protected["其他受保护 SF"]
            end
            subgraph ClientSF["客户端 SF"]
                ClientLogin["clientLoginSFn"]
                ClientRegister["clientRegisterSFn"]
                CurrentClient["getCurrentClientSFn"]
            end
        end

        subgraph AuthMiddleware["鉴权中间件"]
            PermGuard["adminPermGuard<br/>权限校验工厂"]
            Resolver["resolveAdminAuthContext()<br/>登录校验 + 权限校验一步完成"]
        end
    end

    subgraph DB["SQLite"]
        AdminTbl["admin_user"]
        RoleTbl["admin_role<br/>(permissions: JSON 文本)"]
        ClientTbl["client_user"]
        ClientRoleTbl["client_role<br/>(permissions: JSON 文本)"]
        CaptchaTbl["captcha_code"]
    end

    Browser --> RequestMiddleware
    RequestMiddleware --> ServerFunctions
    AdminSF --> AuthMiddleware
    Protected -.->|".middleware([adminPermGuard(PERM)])"| PermGuard
    PermGuard --> Resolver
    Resolver --> AdminTbl
    Resolver --> RoleTbl
    ClientSF --> ClientTbl
    ClientSF --> ClientRoleTbl
    ClientSF --> CaptchaTbl
```

---

## 数据库模型

### ER 图

```mermaid
erDiagram
    admin_role {
        text id PK "UUID，客户端生成"
        text name UK "角色名称"
        text slug UK "角色标识"
        text permissions "权限码数组，如 ['dict:*','admin:view']"
        text description "角色描述"
        integer created_at
        integer updated_at
        integer deleted_at "软删除"
    }

    admin_user {
        text id PK "UUID，客户端生成"
        text username UK "用户名"
        text email UK "邮箱"
        integer email_verified "邮箱是否已确认（超管「忘记密码」的恢复通道）"
        text password_hash "bcrypt 哈希"
        integer token_version "令牌版本，改密 / 被重置 / 登出即自增"
        text avatar "头像"
        text admin_role_ids "角色 id 数组（多角色，无外键）"
        integer is_root "是否超级管理员(仅一个)"
        text status "active/disabled"
        integer last_login_at
        integer created_at
        integer updated_at
        integer deleted_at "软删除"
    }

    client_role {
        text id PK "UUID，客户端生成"
        text name UK "角色名称"
        text slug UK "角色标识"
        text permissions "客户端权限码数组"
        text description "角色描述"
        integer created_at
        integer updated_at
        integer deleted_at "软删除"
    }

    client_user {
        text id PK "UUID，客户端生成"
        text username UK "用户名"
        text email UK "邮箱"
        text password_hash "bcrypt 哈希"
        integer token_version "令牌版本，改密 / 被重置 / 登出即自增"
        text avatar "头像"
        text client_role_ids "角色 id 数组（多角色，无外键）"
        text status "active/disabled"
        integer email_verified "邮箱是否验证"
        integer last_login_at
        integer created_at
        integer updated_at
        integer deleted_at "软删除"
    }

    captcha_code {
        text id PK "UUID，客户端生成"
        text type "email/sms/image"
        text target "目标(邮箱/手机/图形token)"
        text code "验证码值"
        integer used "是否已使用"
        integer expired_at "过期时间"
        integer created_at
    }

    admin_role ||..o{ admin_user : "admin_role_ids (JSON 文本数组)"
    client_role ||..o{ client_user : "client_role_ids (JSON 文本数组)"
```

### 关键约束

- `admin_user.is_root` 有**部分唯一索引**：`CREATE UNIQUE INDEX idx_admin_user_single_root ON admin_user (is_root) WHERE is_root = true`，从数据库层面保证全局仅一个 root 管理员。
- 角色关联使用 `admin_role_ids` / `client_role_ids`（JSON 文本字符串数组，Drizzle `text({ mode: "json" })`），支持**多角色**，多角色权限取并集（任一角色含某权限即拥有）；与角色表**无外键约束**。

### `admin_role.permissions` 字段

权限以 JSON 文本存储（列类型是 `text`，值为字符串数组）：

```json
["dict:*", "admin:view", "admin:create", "file:*", "dashboard:view"]
```

支持三种通配形式：
- `"**"` — 超级通配符，匹配所有权限
- `"dict:*"` — 分组通配符，匹配该模块下所有操作
- `"dict:view"` — 精确匹配

### `admin_user` vs `client_user` 差异

| 特性 | admin_user | client_user |
|------|------------|-------------|
| 角色关联 | `admin_role_ids`（JSON 文本多角色） | `client_role_ids`（JSON 文本多角色） |
| is_root | 有（部分唯一索引） | 无 |
| 邮箱验证 | 有（`email_verified`，未确认的邮箱不能用作恢复通道） | 有（`email_verified` 字段） |
| 注册入口 | 管理员手动创建 | 自助注册（`client_register_enabled` 开关，默认关闭） |
| 认证缓存 | `adminUserCache`（5 分钟 TTL） | `clientUserCache`（5 分钟 TTL） |
| 中间件保护 | `adminAuthGuard` / `adminPermGuard` / `adminPermRouteGuard` | `clientAuthGuard` / `clientPermGuard` / `clientPermRouteGuard` |

---

## 身份认证流程

### 管理员登录时序

```mermaid
sequenceDiagram
    participant Browser as 浏览器
    participant LoginSF as adminLoginSFn<br/>(Server Function)
    participant Server as adminLogin()<br/>(.server.ts)
    participant DB as SQLite
    participant JWT as signToken()

    Browser->>LoginSF: POST { username, password }
    LoginSF->>Server: adminLogin(username, password)

    Server->>Server: 锁定期间直接失败（按账号累计失败次数）
    Server->>DB: SELECT * FROM admin_user WHERE username = ?
    DB-->>Server: user row

    alt 用户不存在 / 已删除 / 状态非 active
        Server->>Server: 仍跑一次 bcrypt（消时间侧信道）
        Server-->>LoginSF: { success: false, message: "用户名或密码错误" }
        LoginSF-->>Browser: 错误信息
    else 用户校验通过
        Server->>Server: bcrypt.compare(password, passwordHash)
        alt 密码错误
            Server-->>LoginSF: { success: false, message: "用户名或密码错误" }
        else 密码正确
            Server->>DB: UPDATE admin_user SET last_login_at = now()
            Server->>JWT: signToken({ userId, username, userType: "admin", v })
            JWT-->>Server: JWT Token (HS256, 24 小时有效)
            Server-->>LoginSF: { success: true, user, token }
            LoginSF->>Browser: setCookie("hub_admin_token", token, httpOnly)
            Browser->>Browser: 跳转 /admin
        end
    end
```

- **失败节流**（`src/services/login-throttle/login-throttle.server.ts`）：失败次数按账号累计在进程内存，5 次锁 30 秒 / 10 次锁 5 分钟 / 20 次锁 1 小时，成功一次即清零；锁定期间不做密码比对，直接回「尝试过于频繁，请稍后再试」。
- **计时一致**：用户名不存在（或已删 / 已停用）时也会跑一次固定散列的 bcrypt 再回同一句文案，否则响应时间差就是用户名枚举的口子。

### 客户端注册与登录流程

```mermaid
sequenceDiagram
    participant Browser as 浏览器
    participant RegisterSF as clientRegisterSFn
    participant LoginSF as clientLoginSFn
    participant Server as clientAuth.server.ts
    participant DB as SQLite
    participant Captcha as captcha.server.ts
    participant JWT as signToken()

    Note over Browser,Captcha: === 注册流程 ===

    Browser->>RegisterSF: POST { username, email, password, captcha }
    RegisterSF->>Server: clientRegister()

    Note over RegisterSF,Server: 自助注册受 client_register_enabled 开关控制（默认关闭），关闭时直接回「注册已关闭」

    Server->>Captcha: verifyCaptcha("email", email, captcha)
    alt 验证码无效或过期
        Captcha-->>Server: false
        Server-->>RegisterSF: { success: false, message: "验证码错误或已过期" }
    else 验证码有效
        Server->>DB: 检查用户名/邮箱唯一性
        alt 已存在
            Server-->>RegisterSF: { success: false, message: "用户名或邮箱已存在" }
        else 可用
            Server->>DB: INSERT INTO client_user
            Server->>DB: 分配默认普通用户角色（按 slug="normal-user" 固定查询，init 种子预置）
            Server-->>RegisterSF: { success: true }
            Browser->>Browser: 跳转 /login
        end
    end

    Note over Browser,Captcha: === 登录流程 ===

    Browser->>LoginSF: POST { username, password }
    LoginSF->>Server: clientLogin()
    Server->>DB: SELECT * FROM client_user WHERE username = ?
    Server->>Server: bcrypt.compare(password, passwordHash)
    Server->>JWT: signToken({ userId, username, userType: "client", v })
    Server-->>LoginSF: { success: true, user, token }
    LoginSF->>Browser: setCookie("hub_client_token", token, httpOnly)
```

---

## JWT Token

| 字段 | 说明 |
|------|------|
| 算法 | HS256（`jose` 库，`#/shared-services/jwt`） |
| 密钥 | `process.env.JWT_SECRET`（app 惰性单例壳缓存为 `Uint8Array`） |
| 有效期 | 24 小时（Cookie 的 `maxAge` 同步 24 小时；提前失效靠令牌版本） |
| 载荷 | `{ userId: string; username: string; userType: "admin" \| "client"; v: number }` |

`userType` 字段用于区分管理端和客户端 token，防止跨体系 token 滥用。`verifyToken` 失败时返回 `null`（不抛异常）。

**撤销（令牌版本）**：载荷里的 `v` 是非负整数，鉴权时与用户表的 `token_version` 比对，不一致即当未登录处理。`token_version` 在**改密 / 被重置 / 登出**时自增（`admin_user` / `client_user` 各一列），因此：

- 登出不再只清当前这份 Cookie，**同一账号在其它浏览器 / 设备上的会话一并作废**；
- 改密或被管理员重置后，已签发的令牌立即失效，不必等 24 小时自然过期。

比对发生在两条凭证路径上：Cookie 会话（`src/middleware/admin-auth.server.ts` / `client-auth.server.ts`）与外部客户端的 Bearer 令牌（`src/middleware/bearer-auth.ts`）。

---

## 权限模型 (RBAC)

### 权限码体系

> 完整清单以 `src/permissions/admin-permissions.ts` 与 `src/permissions/client-permissions.ts` 为准。

权限码格式：`{模块}:{操作}`，按模块分组（清单以 `src/permissions/` 为准）：

| 模块 | 权限码 |
|------|--------|
| `admin` | `view`, `create`, `edit`, `delete` |
| `client` | `view`, `create`, `edit`, `delete` |
| `admin-role` | `view`, `create`, `edit`, `delete` |
| `client-role` | `view`, `create`, `edit`, `delete` |
| `dict` | `view`, `create`, `edit`, `delete`, `create-item`, `edit-item`, `delete-item`, `export`, `import` |
| `config` | `view`, `create`, `edit`, `delete`, `export`, `import` |
| `file` | `view`, `upload`, `edit`, `delete` |
| `file-explorer` | `view`, `upload`, `delete`, `rename`, `mkdir` |
| `log` | `view`, `download` |
| `dashboard` | `view` |
| `track` | `view`, `query`, `manage` |
| `message` | `view`, `send`, `delete` |
| `translation` | `view`, `manage`, `export`, `import` |
| `ai` | `provider` |

每个权限常量通过 `definePermission(code, name, desc)` 创建，返回 `{ code, name, desc, group }` 结构（`group` 由 code 前缀自动推导）。

### 权限匹配算法

`matchPermission(rolePermissions, requiredCode)` 匹配纯函数在 `@ucode/hub-lib/match-permission`，三级优先级：

1. **`**` 超级通配符**：拥有全部权限，直接通过
2. **精确匹配**：如角色有 `dict:create`，请求 `dict:create` 通过
3. **分组通配符**：如角色有 `dict:*`，请求 `dict:create` / `dict:edit` 等均通过

关键函数（管理端在 `src/permissions/admin-permissions.ts`，客户端同理）：
- `matchPermission(rolePermissions, requiredCode)` — 核心匹配逻辑
- `hasAdminPermission(rolePermissions, AdminPermissionDef)` — 单个权限校验
- `hasAnyAdminPermission(rolePermissions, AdminPermissionDef[])` — 任意满足（OR）
- `hasAllAdminPermissions(rolePermissions, AdminPermissionDef[])` — 全部满足（AND）

### 授予边界（防提权）

「编辑角色」与「编辑管理员」本身就是权限码：不限制写入内容的话，控制它们就等于自己给自己提权（给自己的角色加上 `**`，或直接给自己分配超级管理员角色）。因此三条写入路径都按操作者自己的权限集收口，均在服务层强制：

- **角色权限写入**：非 root 只能往角色里写自己已持有的权限码（`assertAdminPermissionWritable`，`src/services/admin-role/admin-role.server.ts`）
- **角色分配**：非 root 只能授出「自己权限集覆盖得住」的角色（`assertAdminRoleAssignmentAllowed`，`src/services/admin-user/admin-user.server.ts`）；`**` 也当作一个权限码参与判定，所以含超级管理员权限的角色只有 root 能授出
- **口令重置**：root 可重置任何人，非 root 只能重置自己（含走邮箱的「忘记密码」）

---

## 中间件与守卫

### 中间件执行链路

```
requestMiddleware                    functionMiddleware
┌───────────────────────┐     ┌─────────────────────────┐
│ requestIdMiddleware   │     │ sfErrorLogger           │
│ localeMiddleware      │     │ (覆盖所有 SF)            │
│ createCsrfMiddleware  │     │ 鉴权失败 warn / 异常 error│
│ (仅 ServerFn)         │     │ 埋耗时/结果指标           │
└──────────┬────────────┘     │ toClientError 归一化抛出  │
           ▼                  └─────────────────────────┘
  createServerFn.middleware([adminPermGuard(PERM)])
           │
           ▼
  resolveAdminAuthContext(token)        ← 单步完成登录校验 + 权限校验
  ┌──────────────────────────────────┐
  │ verifyToken → userType 校验      │
  │ getAdminUserForAuth (带缓存)      │
  │ isRoot → ["**"] / 合并多角色权限   │
  │ hasAdminPermission 校验           │
  │ runWithRequestContext 注入 operator
  └──────────────────────────────────┘
           │
           ▼
  handler() 执行业务逻辑
```

`adminPermGuard(permission)` 内部直接调用 `resolveAdminAuthContext()` 一步完成登录校验 + 权限校验。`adminAuthGuard`（仅登录）与 `adminPermRouteGuard`（Server Route 专用，捕获 `AdminAuthError` 转 HTTP 状态码）为同一定位于 `src/middleware/admin-auth.ts` 的兄弟中间件。

### `resolveAdminAuthContext` 逻辑

```mermaid
flowchart TD
    Start(["resolveAdminAuthContext(token)"])
    CheckToken{"token 存在?"}
    VerifyJWT["verifyToken(token)"]
    CheckJWT{"JWT 有效?"}
    CheckType{"userType === 'admin'?"}
    QueryUser["getAdminUserForAuth()<br/>查 admin_user + 角色（带 adminUserCache）"]
    CheckUser{"getAdminUserForAuth 结果"}
    CheckRoot{"isRoot ?"}
    SetAllPerms["设置 rolePermissions = ['**']<br/>（不查询 admin_role 表）"]
    MergePerms["合并 admin_role_ids 多角色权限（并集）"]
    CheckPerm{"adminPermGuard 场景：<br/>hasAdminPermission(rolePermissions, required)"}
    InjectContext["注入 context: { user, rolePermissions }"]
    Proceed(["执行 handler"])

    Start --> CheckToken
    CheckToken -->|否| Err401a["❌ 401: 未登录或登录已过期"]
    CheckToken -->|是| VerifyJWT
    VerifyJWT --> CheckJWT
    CheckJWT -->|否| Err401b["❌ 401: 未登录或登录已过期"]
    CheckJWT -->|是| CheckType
    CheckType -->|否| Err403a["❌ 403: 无权访问管理端"]
    CheckType -->|是| QueryUser
    QueryUser --> CheckUser
    CheckUser -->|"not_found"| Err401c["❌ 401: 用户不存在"]
    CheckUser -->|"disabled/删除"| Err403b["❌ 403: 账号已被禁用或删除"]
    CheckUser -->|"✅ 有效"| CheckRoot
    CheckRoot -->|是| SetAllPerms --> CheckPerm
    CheckRoot -->|否| MergePerms --> CheckPerm
    CheckPerm -->|"✅ 有权限"| InjectContext
    CheckPerm -->|"❌ 无权限"| Err403c["❌ 403: 权限不足"]
    InjectContext --> Proceed
```

### `adminPermGuard` 工厂函数

```typescript
// src/middleware/admin-auth.ts
export function adminPermGuard(required: AdminPermissionDef) {
  return createMiddleware().server(async ({ next }) => {
    const token = getCookie(COOKIE_NAMES.ADMIN_TOKEN);
    const ctx = await resolveAdminAuthContext(token); // 登录 + 权限校验一步完成
    if (!hasAdminPermission(ctx.rolePermissions, required)) {
      throw new AdminAuthError("权限不足", 403);
    }
    return runWithRequestContext(
      { operator: { id, username, email, type: "admin" } },
      () => next({ context: ctx }),
    );
  });
}
```

**使用示例**：

```typescript
// 仅需登录
export const myFn = createServerFn({ method: "GET" })
  .middleware([adminAuthGuard])
  .handler(async () => { ... });

// 需登录 + 特定权限
export const deleteDictFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.DICT_DELETE)])
  .handler(async () => { ... });
```

### `AdminAuthError`

自定义错误类，携带 HTTP 状态码：

| 错误信息 | 状态码 | 场景 |
|----------|--------|------|
| `"未登录或登录已过期"` | 401 | Cookie 不存在或 JWT 验证失败 |
| `"无权访问管理端"` | 403 | JWT 的 `userType` 不是 `"admin"` |
| `"用户不存在"` | 401 | JWT 对应的用户记录不存在（如已物理删除） |
| `"账号已被禁用或删除"` | 403 | 用户被软删除或状态非 active |
| `"权限不足"` | 403 | `adminPermGuard` 中权限匹配失败 |

---

## Root 管理员

### 特性

1. **全局唯一** — `admin_user` 表通过部分唯一索引 `idx_admin_user_single_root` 保证仅有一个 `is_root = true` 的记录
2. **自动拥有全部权限** — 在 `resolveAdminAuthContext()` 中，`isRoot` 用户直接设置 `rolePermissions = ["**"]`，**不查询角色表**。这意味着即使 root 关联的角色被删除或权限变更，root 仍保留全部权限
3. **不可禁用** — `src/services/admin-user/admin-user.server.ts` 中 `updateAdminUser` 禁止设置 root 用户 `status !== "active"`
4. **不可删除** — `src/services/admin-user/admin-user.server.ts` 中 `deleteAdminUser` 禁止删除 root 用户

### 系统初始化

```mermaid
sequenceDiagram
    participant Browser as 浏览器
    participant InitPage as /admin/init
    participant InitServer as init.server.ts
    participant DB as SQLite

    Browser->>InitPage: 首次访问系统
    InitPage->>InitServer: checkInitStatus()
    InitServer->>DB: SELECT FROM admin_user WHERE is_root = true
    DB-->>InitServer: null（未初始化）
    InitServer-->>InitPage: false → 显示初始化页面

    Browser->>InitPage: 提交初始化表单
    InitPage->>InitServer: initSystem({ admin: { username, password, email }, siteName, smtp, ai })

    critical 数据库事务
        InitServer->>DB: BEGIN TRANSACTION
        InitServer->>DB: 再次检查 is_root = true 是否存在
        InitServer->>DB: INSERT INTO admin_role (name="超级管理员", slug="super-admin", permissions=["**"])
        InitServer->>DB: INSERT INTO admin_user (is_root=true, admin_role_ids=[新角色ID], ...)
        InitServer->>DB: INSERT INTO system_config (site_name, smtp_*, ai_*)
        InitServer->>DB: COMMIT
    end

    InitServer->>InitServer: loadConfigCache() 刷新配置缓存
    InitServer-->>InitPage: { success: true }
    Browser->>Browser: 跳转 /admin/login
```

- 首次访问 `/admin` 时，`/admin/init` 路由 `beforeLoad` 调用 `checkInitStatus()`（查询 `admin_user WHERE is_root = true`）；未初始化 → 停留在初始化页，已初始化 → 重定向 `/admin/login`
- `initSystem()` 在**数据库事务**内完成：二次校验 is_root（防并发）→ INSERT 角色（超级管理员，`["**"]`）→ INSERT root 用户 → INSERT 系统配置（站点名/SMTP/AI）；提交后刷新配置缓存，跳转 `/admin/login`
- 两条路由互为守门人（`/admin/init` 与 `/admin/login`），确保用户始终停留在正确页面

---

## 客户端认证

### 认证 Context

`ClientAuthProvider`（`src/components/client/ClientAuthProvider.tsx`）挂载时自动调用 `getCurrentClientSFn()` 获取当前登录用户，通过 React Context 向下传递；前台组件经 `useClientAuth()` 消费 `{ user, isLoading, refetch, logout }`。

### 客户端用户内存缓存

`getCurrentClient()` / `getClientUserForAuth()` 使用 5 分钟 TTL 的内存缓存（`clientUserCache`）减少重复数据库查询。缓存失效场景：
- 管理员修改客户端用户状态或角色时，`src/services/client-user/client-user.server.ts` 主动调用 `clientUserCache.delete(userId)`
- 管理员删除客户端用户时，同样清除缓存
- 改密 / 被重置 / 登出时，`bumpClientTokenVersion()` 自增令牌版本并清缓存（缓存里带 `tokenVersion`，读取时与令牌载荷的 `v` 比对）

### 管理员端认证状态

管理员端在 `/admin/_admin` 布局路由的 `beforeLoad` 中调用 `getCurrentAdminSFn`，返回值通过路由 context 传递给所有子页面。该布局设置 `ssr: false`，所有鉴权在客户端完成。

---

## CSRF 保护

在 `src/start.ts` 中注册 `createCsrfMiddleware`：

```typescript
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});
```

- **仅对 Server Function 请求生效**，页面渲染请求不受影响
- 默认校验 `Origin`、`Referer`、`Sec-Fetch-Site` 头，拒绝跨站请求
- 位于 `requestMiddleware` 数组中，在 `requestIdMiddleware` 与 `localeMiddleware` 之后执行（`start.ts` 注册顺序 `[requestId, locale, csrf]`）

---

## 安全要点汇总

| 层面 | 措施 |
|------|------|
| 密码存储 | bcrypt 哈希，**cost 统一 12**（管理端 CRUD、客户端注册、管理员 / 客户端自助验证码重置各写入点一致） |
| 口令重置 | 「忘记密码」未注册 / 已删除 / 已停用统一回「该邮箱不可用于重置密码」，不给邮箱枚举留口子；管理端还要求邮箱已确认（`email_verified`，初始化写入的超管邮箱视为已确认），未确认的邮箱不能用作恢复通道 |
| Token | HS256 JWT，24 小时有效期，httpOnly Cookie；撤销靠载荷 `v` 与用户表 `token_version` 比对（改密 / 被重置 / 登出即自增） |
| 登录节流 | 失败按账号累计（进程内存）：5 次锁 30 秒 / 10 次 5 分钟 / 20 次 1 小时，成功清零；用户名不存在也跑一次 bcrypt |
| 邮箱验证码 | `crypto.randomInt` 生成 6 位数字，5 分钟有效；同一条码错 5 次即作废，发新码作废旧码 |
| Cookie | 管理端/客户端独立 Cookie，避免相互覆盖 |
| CSRF | TanStack Start 内置 CSRF 中间件，仅 ServerFn 生效 |
| 权限 | RBAC + 三级权限匹配，root 自动绕过角色表；角色分配与角色权限写入不得越级（`**` 只有 root 能授） |
| 注册开关 | 客户端自助注册由 `client_register_enabled` 控制，**默认关闭** |
| 软删除 | 所有用户/角色表使用 `deleted_at`，查询始终过滤 |
| 防并发初始化 | 数据库事务内二次校验 is_root |
| 构建安全 | Vite 配置禁止 `bcryptjs` / `drizzle-orm` 进入客户端 bundle |
| Root 保护 | 数据库唯一索引 + 禁用/删除拦截；口令重置只允许 root 改他人、非 root 改自己 |

---

## 关键文件索引

| 文件 | 职责 |
|------|------|
| `src/shared-services/jwt` | JWT 签发/校验与应用级单例壳（惰性；有效期与令牌版本载荷都在这里） |
| `src/services/login-throttle/login-throttle.server.ts` | 登录失败节流（按账号累计，进程内存） |
| `src/middleware/bearer-auth.ts` | 外部客户端的 Bearer 令牌鉴权（含令牌版本比对） |
| `src/constants/cookie-names.ts` | Cookie 名称常量（`COOKIE_NAMES`，当前 `hub_admin_token` / `hub_client_token`，交付时按实际域名改这一处） |
| `src/permissions/admin-permissions.ts` | 管理端权限码常量（`ADMIN_PERMISSIONS` / `ADMIN_PERMISSIONS_BY_GROUP` / `hasAdminPermission` 等） |
| `packages/lib/src/match-permission/index.ts` | 权限匹配纯函数（`matchPermission`，`@ucode/hub-lib/match-permission`） |
| `src/middleware/admin-auth.ts` | `adminAuthGuard` / `adminPermGuard` / `adminPermRouteGuard` 中间件 |
| `src/middleware/admin-auth.server.ts` | `resolveAdminAuthContext()` 登录校验 + 权限解析 |
| `src/middleware/client-auth.ts` | `clientAuthGuard` / `clientPermGuard` / `clientPermRouteGuard` 中间件 |
| `src/services/admin-auth/admin-auth.server.ts` | 管理员登录、当前管理员查询 |
| `src/services/client-auth/client-auth.server.ts` | 客户端登录、注册、当前用户查询（含缓存） |
| `src/services/client-auth/client-auth.functions.ts` | 客户端认证 Server Function 包装器 |
| `src/services/init/init.server.ts` | 系统初始化（checkInitStatus / initSystem） |
| `src/services/admin-user/admin-user.server.ts` | 管理员 CRUD（含 root 禁用/删除拦截） |
| `src/services/client-user/client-user.server.ts` | 客户端用户 CRUD |
| `src/services/admin-role/admin-role.server.ts` | 管理端角色 CRUD |
| `src/services/client-role/client-role.server.ts` | 客户端角色 CRUD |
| `src/db/schema/admin-user.ts` | admin_user 表（含部分唯一索引） |
| `src/db/schema/client-user.ts` | client_user 表 |
| `src/db/schema/admin-role.ts` | admin_role 表（permissions JSON 文本） |
| `src/db/schema/client-role.ts` | client_role 表 |
| `src/routes/admin/_admin.tsx` | 管理端布局：beforeLoad 鉴权 |
| `src/routes/admin/login/index.tsx` | 管理端登录页 |
| `src/routes/admin/init/index.tsx` | 系统初始化页 |
| `src/components/client/ClientAuthProvider.tsx` | 客户端认证 Context |
| `src/start.ts` | CSRF 中间件注册 |
