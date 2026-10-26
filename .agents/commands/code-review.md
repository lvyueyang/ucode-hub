---
description: 全量代码审查命令：扫描全项目，按 10 维度审查并输出分级报告 + 一致性/规范化备忘录（Style Guide），目标让全仓库像一个人写的
---
# /code-review

> 全量代码审查命令：**默认全量扫描整个项目（`app/` + `packages/`，含路由/服务/组件/schema/lib 包），不做 diff 限定**。按 10 维度审查并输出严重度分级报告，同时从「一致性/命名」视角归并同源偏离并沉淀可复用的 Style Guide，目标是让全仓库看起来只由一个人写成。凡出现「同一种东西两种命名/两种写法」，无论是否可运行，一律视为偏离并列出。

## 适用场景

- 全量代码审计（阶段）与技术债评估
- 重构前的违规诊断
- 代码评审（Code Review）前的一致性检查
- 新人接手项目前的全面了解
- 多人协作时统一书写风格的裁决依据

## 输入（默认全量，可选收窄）

**默认审查范围：整个项目。** 不传参数即全量扫描；以下参数用于显式收窄：

| 参数 | 说明 | 示例 |
|------|------|------|
| 范围 | 只审查某目录/模块 | `app/src/routes/admin/_admin/devices` |
| 维度 | 只审查部分维度 | `命名` |
| 严重度 | 只报告指定级别以上 | `high` |
| `--diff` | 仅审查 git 改动 | `--diff` |

### 关于 `--diff`（仅查 diff 需额外说明）

- 默认行为是**全量扫描**；**只有**显式传入 `--diff` 且说明「本次只想要 diff 相关检查、不需要全量基线」时才收窄到 `git diff`（未暂存 + 已暂存，必要时结合 `--cached`/HEAD）。
- `--diff` 模式需在报告开头声明「本次为 diff 审查，非全量基线」，避免与全量结果混淆；未传 `--diff` 一律按全量执行。

## 审查前置约定（规则即事实，以 AGENTS.md 与现有代码为判据）

- **文件/目录命名**：路由 `kebab-case`（`admin-roles/index.tsx`）；路径参数 `$id/$slug/download.$`；布局分组 `_admin.tsx`；伴生文件进 `-mods/`；服务层按 `.server.ts`/`.schemas.ts`/`.functions.ts`/`.types.ts`/`.cache.ts` 后缀分层。`-mods/` 内命名判定表：
  - `模块名.类型.ts`：kebab（`devices.functions.ts` / `dict.utils.ts`），禁 camelCase（如 `dictUtils.ts` / `fileExplorerUtils.ts`）
  - `xxxColumns.tsx`（列定义）与 `PascalCase.tsx`（路由级组件，`DictFormModal.tsx`）：为**认可例外**，不按 kebab 要求，逐类标注在豁免清单
- **三层分离（硬规则）**：`.server.ts`（服务逻辑，禁止 `SFn` 后缀）/`.functions.ts`（SFn 包装，**必须** `SFn` 后缀）/`.schemas.ts`（zod 单一来源）。依赖单向 `routes → services → (lib/db)`；`services/**` 禁止 import `routes/**`；`.server.ts` 禁止 import `.functions.ts`；路由/组件禁止直接 import `.server.ts`；SFn 必须 `createServerFn({ method }).validator(schema)`，调用方 `{ data: ... }` 传参。
- **组件命名**：`components/admin/`（antd 数据密集）、`components/client/`（shadcn 展示）、`components/providers/`（global-store/i18n-context）。Props 接口必须 `XxxProps`（禁止裸 `Props`）；布尔 Props `is/has/should` 前缀；对外回调 `onXxx`、内部实现 `handleXxx`；Hook 统一 `useXxx`。
- **管理端表格操作列必须用 `TableOperate` 容器**，操作按钮统一「图标 + 文字」，`Delete` 内置信 `Popconfirm`。
- **主题/样式（以渲染结果为准）**：颜色仅语义令牌（`var(--s-*)`），禁止硬编码状态色；**圆角由 `--radius-*` 令牌归零**——`rounded-*` 类名本身允许，只要最终渲染为 0，仅 `rounded-full` 保留圆形；主题三态 `useAdminTheme()`/`useThemeMode()`。
- **机制感知准入（先判机制再判类名）**：审样式/命名前，先确认该实现是否已由「主题令牌 / 组件机制 / 构建工具（import-protection / tsc / Biome）」兜底。凡「规则意图已达成、只是实现方式不同」的，**一律不算偏离、不报**——典型如 `rounded-md` 类名 + `--radius-*` 归零、语义令牌映射、`import type` 引 `.server.ts`、shadcn/antd 自带类名、装饰性品牌渐变、邮件模板内联色。
- **命名面收敛**：禁止硬编码 `hub_*`；Cookie 名走 `src/constants/cookie-names.ts` 集中常量。
- **代码体积**：函数 >60 行、文件 >600 行即需拆分（按职责拆，禁止压缩排版）。

## 已知豁免 / 例外（只列已认可项，不报违规）

这些实现已达成规则意图、且改动成本低或确有必要，**默认不列为偏离**；仅在相关规则被真正违反（如新引入非令牌硬编码色值、新命名违反 kebab）时才报告：

- **圆角**：`rounded-*` 类名 + `--radius-*` 令牌归零（`admin.global.css`/`ssr.global.css`/`shared-tokens.css` 中 `--radius*: 0`），仅 `rounded-full` 保留圆形。
- **列定义文件**：`xxxColumns.tsx`（`deviceColumns.tsx`/`configColumns.tsx`/`messageManageColumns.tsx`）为认可的 camelCase 例外；**纯逻辑/工具**文件（`xxxUtils.ts`）不在豁免内，须 kebab。
- **`import type` 引 `.server.ts`**：路由/组件 type-only 导入类型不触发 import-protection，属允许；仅 VALUE 导入且非 Server Route 豁免路径才判违规。
- **Server Route 例外**：`routes/file/r.$id.tsx`、`routes/admin/_admin/logs/download.$id.tsx`、`routes/admin/_admin/file-explorer/download.$.tsx`、`routes/api/metrics.tsx`、`routes/health.tsx` 允许在 `server.handlers` 内引 `.server.ts`。
- **无入参 SFn**：零参调用（`getCurrentAdminSFn()` 等）可省略 `validator`。
- **装饰性品牌视觉**：AI 功能入口的品牌渐变、`<meta name="theme-color">` SSR 初始值等非状态语义色，属可接受的具名色值。
- **邮件模板/富文本内联样式**：HTML 邮件与富文本编辑器等客户端不解析令牌，内联色值/样式为跨客户端唯一可靠方案。
- **shadcn/antd 自带类名**：`@ucode/hub-ui-ssr`/`@ucode/hub-ui-spa` 与 antd 组件类名由宿主 token 注入，属性名/类名不按业务命名规则要求。

## 审查维度（10 维度全量扫描）

#### ① 分层合规 → [architecture](../skills/architecture/SKILL.md)
- 组件/路由是否直接 import `.server.ts`；`.server.ts` 是否出现在客户端 bundle
- `services/**` 是否反向 import `routes/**`；`.server.ts` 是否反向 import `.functions.ts`
- 跨包引用是否走 `@ucode/hub-*` subpath（禁止 `#/*` 跨包）；共享逻辑归属（lib/ui-ssr/ui-spa/services/shared-services/utils）是否正确
- **lib 准入复核**：`packages/lib/src` 是否出现读 env（`process.env` / `import.meta.env`）、logger 耦合、模块级或 globalThis 单例、框架（React / TanStack Start）或 UI 包依赖、app 私有协议或权限码耦合（`SfnError*` / `AdminAuthError` / `ADMIN_PERMISSIONS`）、反向引用 `#/*`、服务端专属运行时能力；判据是「能否原样移植到另一个 TanStack Start 项目」——`pnpm test` 的 `lib-boundary.test.ts` 已机械覆盖上述模式，人工只复核未被其覆盖的形态（如可变全局对象、以工厂替代单例的写法）

#### ② 路由合规 → [AGENTS.md「路由」章节](../../AGENTS.md)
- 页面本体是否建成路由文件（禁止塞进 `-mods/`）；`-mods/` 是否只收纳非视图 companion
- `*.server.ts` 是否误放路由（应归 `services/`）；beforeLoad 是否有鉴权守卫
- 路由文件是否独立可访问视图（URL/菜单/深链/前进后退可达）

#### ③ SFn 合规 → [server-function](../skills/server-function/SKILL.md)
- `createServerFn` 是否以 `SFn` 后缀命名；是否都有 zod `validator`（FormData 上传类允许裸函数类型守卫；**无入参零参调用豁免**）
- 是否都有鉴权 middleware（`adminPermGuard`/`clientPermGuard`）；handler 是否有静默返回 null
- `.functions.ts` 未引用的包装器是否已删（死代码）；路由/组件是否直接从 `.server.ts` 导入

#### ④ 组件合规 → [AGENTS.md「组件约定」章节](../../AGENTS.md)
- admin/ 下是否混用 Tailwind 同源组件（应 antd）；client/ 下是否混用 antd 同类组件（应 shadcn/ui）
- 表格操作列是否用 `TableOperate`；操作按钮是否统一「图标 + 文字」；颜色是否走语义令牌（`var(--s-*)`）；**圆角按渲染结果**判（`--radius-*` 令牌归零，`rounded-*` 类名不算违规，仅 `rounded-full` 保圆形）
- `message`/`modal`/`notification` 是否经 `@ucode/hub-ui-spa/antd-static` 导入

#### ⑤ 类型/DB 合规 → [db-schema](../skills/db-schema/SKILL.md)
- 是否有 `as any`/`as unknown as` 绕过类型；jsonb 是否都 `.$type<>()` 显式类型
- DB 列命名是否遵循硬规则（`id`/`created_at`/`xxx_id`/`sort_order` 等）；timestamp 是否 `{ withTimezone: true }`
- 是否误用 `db.query.*`（RQB v1 已移除）；是否有 `db:push` 残留（一律 `db:generate` + `db:migrate`）

#### ⑥ 安全合规 → [AGENTS.md「安全 (EHRB)」](../../AGENTS.md) + [permission](../skills/permission/SKILL.md)
- SFn 是否都有鉴权 middleware（`adminPermGuard`/`adminPermRouteGuard`）；是否硬编码密钥/`process.env` 泄漏到客户端
- CSRF 中间件是否覆盖所有 SFn；权限码是否走 `src/permissions/` 常量，Root 自动 `**`
- 是否有危险操作（rm -rf /、DROP TABLE 等）

#### ⑦ 错误处理 → [AGENTS.md「错误处理与通知」](../../AGENTS.md)
- 7 类静默失败违规（空 catch、吞异常等）；loader/beforeLoad 失败是否有 `errorComponent`
- 通知分层是否正确（管理端 antd message / 前台 sonner toast）；SFn 是否走统一错误处理（`sfErrorLogger` 自动覆盖）

#### ⑧ 测试覆盖 → [test-writing](../skills/test-writing/SKILL.md)
- **仓库级搜索被测符号**：确认每个 `src/services/` / `src/shared-services/` 模块的导出函数在**全仓库**是否有测试（**勿只看模块 `__tests__/`**）。区分两类独立发现：① 全仓库无任何测试 → 真缺覆盖率；② 已有测试但未与被测模块同目录 → 位置漂移（单独记录，勿误报成缺测）
- 测试是否为三段式 `vi.hoisted()` + `vi.mock()`；路由层 schema 校验测试是否就近放置；每个导出函数是否覆盖正常/边界/错误路径

#### ⑨ 命名与一致性 → 文末「一致性 · Style Guide」
（面向「像一个人写的」风格统一，同源偏离先归并再标注影响面）
- `-mods/` 内逻辑文件是否 kebab（禁止 camelCase，如 `dictUtils.ts`/`fileExplorerUtils.ts`）
- Props 接口是否 `XxxProps`（禁止裸 `Props`）；布尔 `is/has/should`；回调 `onXxx`/`handleXxx`；Hook `useXxx`
- SFn 是否 `xxxSFn`；服务动词 `get/create/update/delete` 统一；常量 `SCREAMING_SNAKE_CASE`；schema `xxxCreateSchema` 对称
- 同一模块后缀是否同层统一、无同义漂移（`.analytics` vs 短后缀）；色彩/圆角按「渲染结果 + 归并原则」处理——`rounded-*` 类名不算偏离；同源偏离先归并并做成本/收益过滤，改动大/值近零的归入「低置信度 · 建议人工确认」（勿一律列违规）

#### ⑩ 注释规范 → [AGENTS.md「语言规范」章节](../../AGENTS.md)
- 注释/文档/页面文字/git commit 是否均用**简体中文**
- **函数体 / 逻辑注释**是否复述代码本身（标识符名的中文翻译、显而易见的赋值/渲染/流程）→ 属违规，应删除
- **TS 类型字段注释从宽**：逐字段写注释、与字段名同义均**不判违规**，只需确认写的是业务口径而非错误含义
- 文件级注释是否概述文件/模块职责（置于第一行、不复述文件名为宜）；**存量头注释不判违规**，仅对新增的「复述文件名」头注释提改进建议
- 是否有**空白横幅**（`// ═══ 分区标题 ═══` / `// ─── xxx ───`）→ 属违规，分段靠空行
- 导出 API / 反直觉实现是否有说明意图与边界的注释，且**贴近业务语义、无模板化表述**；同一概念前后用语是否一致

## 汇总报告格式

```markdown
## 全量代码审查报告

### 基线
- TypeScript: ✅/❌   Biome: ✅/❌   测试: ✅/❌ (N passed, N failed)

### 严重度分级标准（客观判据，勿靠感觉）
- 🔴 **Critical**：安全/数据完整性问题（鉴权绕过、密钥泄漏、危险 SQL、敏感数据暴露）
- 🟠 **High**：破坏硬规则（分层反向依赖、守卫缺失、SFn 无 zod 校验但有入参）或**测试/构建基线失败**（本仓库 `pnpm check` 不绿）
- 🟡 **Medium**：命名/类型/代码体积超标、真实一致性漂移（同源两种写法）
- 🔵 **Low**：风格/注释/文档/纯凝练

### 严重度报告
| # | 文件 | 违规 | 严重度 | 规则来源 | 修复方案 |

### 低置信度 · 建议人工确认（不强制）
仅列「可选的一致性优化」：改动面大、值近零、或会破坏原语义意图（如删类名丢失将来可回改性）。这类**不作为违规**，供人裁决是否值得做。置顶标注「非必修」。

### 按模块统计
| 模块 | Critical | High | Medium | Low |

### 一致性/规范化备忘录 (Style Guide)
按文末「一致性 · Style Guide」六块（命名/分层/状态/错误处理/样式/注释与文档）输出简短清单；
只写本仓库已认可规则，不引入与现有约定冲突的新规。

### 修复路线图
1. 立即修 Critical（安全+数据）  2. 本周 High（架构+错误）
3. 下周 Medium（命名+类型）  4. 后续 Low（风格+文档）
```

## 输出要求（CR 视角，面向「像一个人写的」）

直接输出审查报告，无需客套寒暄，按以下格式：
1. **【现状与规则偏离清单】**：表格列出（文件/组件/函数 | 当前实现 | 冲突规则 | 建议统一规则）；同源偏离先归并，标注影响面（仅该文件/全模块/全仓库）。
2. **【高优先级重构建议】**：按「影响维护性 + 是否阻碍多人协作」排序的 3~5 项具体动作，含重命名示例（`旧名 → 新名`）。
3. **【推荐规范备忘录 (Style Guide)】**：按本项目主导风格沉淀简短规则清单，分「命名/分层/状态/错误处理/样式/注释与文档」六块。

## 一致性 · Style Guide（SSOT）

### 命名
- 文件/目录：`kebab-case`；`-mods/` 逻辑文件 `模块名.类型.ts`，组件 `PascalCase`；Props `XxxProps`（禁裸 `Props`）
- 布尔 `is/has/should`；回调 `onXxx`（对外）/`handleXxx`（内部）；Hook `useXxx`；SFn `xxxSFn`；服务动词 `get/create/update/delete`；常量 `SCREAMING_SNAKE_CASE`；schema `xxxCreateSchema` 对称

### 分层
- 依赖单向 `routes → services → (lib/db)`；`services/**` 不引 `routes/**`；`.server.ts` 不引 `.functions.ts`；组件不直接引 `.server.ts`
- `components/admin` ↔ `client` ↔ `providers` 不串层；纯逻辑下沉 `@ucode/hub-lib`；`#/*` 仅 app 内、跨包 `@ucode/hub-*`

### 状态
- `useXxx` 统一；`MemoryCache<T>` 实例只在其所属模块直接操作（懒加载 miss→查库→写缓存→返回）；不重复造轮子

### 错误处理
- 管理端 `message/modal/notification` 只经 `@ucode/hub-ui-spa/antd-static`；前台 `sonner toast`；SFn 错误经 `toClientError()` 归一化再抛；禁止吞错静默失败

### 样式
- 颜色仅语义令牌（`var(--s-*)`）；圆角由 `--radius-*` 令牌归零（`rounded-*` 类名允许，仅 `rounded-full` 保圆形）；主题三态 `useAdminTheme()`/`useThemeMode()`

### 注释与文档
- 注释/文档/页面文字/git commit 均用简体中文；函数体注释只写代码无法表达的信息（意图/业务规则/约束），严禁复述代码本身
- TS 类型字段注释从宽：逐字段写、与字段名同义均可接受；文件级注释概述职责、不复述文件名；导出 API / 反直觉实现需说明意图与边界；不用 `// ═══ xxx ═══` 横幅分段

## 注意事项

- **默认全量扫描整个项目**；仅显式传 `--diff` 且说明意图时才收窄，否则勿只审 diff。
- **先跑自动化基线，再手动审语义**：命令开头先执行**仓库根**的 `pnpm check`（biome + 各包 typecheck + 测试 + 约定校验，含 import-protection），把已通过项从手动维度排除。**工具已门禁的项不重复手扫**：格式/import 顺序/类型/包边界/裸 `#/*` 跨包/`db.query`（RQB）/`db:push` 等——出现即引用工具结论，手动只聚焦语义越界（分层反向依赖、守卫缺失、静默失败、真实行为变更）。
- **机制感知 → 算不算违规**：先按「已知豁免注册表」过滤；再用「机制感知准入」判断是否已由令牌/组件/构建工具兜底；仍存疑才判违规。
- **一致性发现做成本/收益过滤**：改动面大、值近零、或破坏原语义意图的，降为「低置信度 · 建议人工确认」，不列入违规。
- **每条违规引用具体规则来源**；同源偏离归并后标注影响面；只报「真实不一致」，不报「个人偏好」。
- 审查基于 AGENTS.md 与 `.agents/skills/` 规则，以现有代码为准（代码与文档不一致以代码为准）。
- **CHANGELOG 结构校验**：每个版本段每类标题仅出现一次、分类顺序固定（Features → Infrastructure → Refactor → Fix → Docs → 依赖升级 → Breaking）、条目归位正确。
- 本命令为唯一全量审查入口，聚合分层 / 命名 / 契约各维度扫描。

## 完成标准

- [ ] 默认全量范围已扫描（或已按 `--diff` 收窄并在报告开头声明）
- [ ] 先执行本仓库 `pnpm check` 作为自动化基线，已通过项从手动维度排除
- [ ] 10 维度全部扫描；违规按客观严重度分级并按模块统计；工具已门禁项不重复手扫
- [ ] 已按「已知豁免注册表」+「机制感知准入」过滤，合法机制实现未误报
- [ ] 一致性发现已做成本/收益过滤，低价值/破坏原意的归入「低置信度 · 建议人工确认」
- [ ] 偏离清单按「当前实现 → 冲突规则 → 建议规则」三列对齐，同源偏离已归并标注影响面
- [ ] 高优先级重构建议含具体重命名示例
- [ ] CHANGELOG/文档标题结构已校验（单标题块、分类顺序正确、条目归位）
- [ ] Style Guide 只沉淀本仓库认可规则，不引入冲突新规

## 引用关联

- `.agents/skills/`：architecture / server-function / db-schema / permission / test-writing / cache / i18n / admin-crud
- `.agents/checklists/`：`sfn-checklist` / `route-checklist` / `component-checklist`
- AGENTS.md：路由、组件约定、错误处理与通知、安全、数据库、内存缓存约定、接口约定（Server Function）
