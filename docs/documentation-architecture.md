# 文档体系架构

> 本文档是**文档体系的边界模型单一事实来源**：定义每类文档的角色、内容边界、事实归属（SSOT）与引用关系，保证「一份事实只有一个 owner，其余只引用」可执行、可自查。
> 规则本体见 [AGENTS.md](../AGENTS.md)；任务导航见 [.agents/guide.md](../.agents/guide.md)。

## 1. 目标

- 每份文档有明确角色与内容边界，不重复维护同一事实
- 「数量/清单」类事实一律指向代码，文档禁止复制与生成快照，从机制上消灭数字漂移
- 文档间引用单向、可追踪；索引层（guide.md / README.md）只做导航不重复内容
- 文档只做解释不搬事实；事实变更仅需改代码，无需同步数字

## 2. 文档体系分层

```
L0  AGENTS.md           规则本体（唯一自动加载）
                         只放跨模块规则、约定、索引；清单/机制详解一律外迁
L1  .agents/guide.md    任务导航（任务 → 读什么/用什么），不重复规则
L2  .agents/skills      「怎么做/禁止什么」规则展开（清单以 `.agents/skills/` 目录为准）
L3  .agents/commands    固定流程执行（deploy 发布 / code-review 全量审查，引用 skills / docs）
L4  .agents/checklists  验证清单（skills 的浓缩：sfn / route / component）
L5  docs/               背景与设计（人类向），按性质分三子类：
    ├─ 平台机制类   architecture-overview / database-design / auth-permission-model /
    │               cache-system / event-tracking / i18n / deployment-ops / project-ecosystem
    ├─ 决策档案类   （ADR，当前暂无，新增时置于 docs/decisions.md）
    └─ archive/     历史档案（被推翻的设计、已完成计划）
```

> 组件/包级 API 与方案详解归各包 README（subpath README 为包边界权威文档，如 `@ucode/hub-ui-spa/README.md`），`docs/` 仅作索引指引，不重复维护；已抽离为独立 npm 包的组件（`@easyx/image-toolkit`）以其 npm 包 README 为单一事实来源。

> hub 无 `.agents/templates` 层（代码骨架由 skills 内嵌示例承载）。skills / commands / checklists 实体均在 `.agents/` 下，内容修改一律以 `.agents/` 为准。

## 3. 内容性质 → 归属映射

写内容前先按此表判定归属层：

| 内容性质 | 归属层 | 判据 | 典型例子 |
|---------|--------|------|---------|
| 规则 / 禁令 / 约定 | AGENTS.md + skills | 代码审查即时依赖、低频变更 | SFn 命名后缀、JSONB `.$type` 约束、`TableOperate` 操作列 |
| 机制 / 设计解释（为什么） | docs 平台类 | 讲「为什么」，低频变更 | 缓存失效策略、BatchWriter 动机、认证模型 |
| 事实清单（数量 / 有哪些） | 代码 | 高频变更 | 表清单、权限码、缓存实例、定时任务、预置埋点 |
| 流程 / 步骤执行 | .agents/commands | 固定顺序的多步操作 | 版本发布、架构审计 |
| 验证条目 | .agents/checklists | 规则的浓缩可勾选项 | SFn 自查、路由自查 |
| 被推翻的设计 / 已完成计划 | docs/archive | 只追溯，不引用为现行依据 | 迁移方案、重构计划 |

## 4. 事实 SSOT 表

每个事实有唯一 owner，其余文档只能引用（链接/指向），禁止复制清单：

| 事实 | 唯一 owner（代码） | 引用方（只引用，不复制） |
|------|-------------------|--------------------------|
| 权限码清单 | `src/permissions/admin-permissions.ts` + `client-permissions.ts` | auth-permission-model、AGENTS、architecture-overview |
| 数据表清单 / 数量 | `src/db/schema/`（index.ts 汇总） | database-design、architecture-overview、README、AGENTS |
| 内存缓存实例 | `src/services/*/*.cache.ts` + `src/shared-services/*/*.cache.ts`（领域缓存）+ `src/services/track/track.validate.ts`（频控内部实例 `sessionRateCache`） | cache-system、architecture-overview、AGENTS |
| 路由树 | `src/routeTree.gen.ts` + `src/routes/` | architecture-overview（仅概览）、routing 约定在 AGENTS |
| 定时任务清单 | `src/services/tasks/tasks.server.ts` | deployment-ops |
| 预置埋点（事件/属性） | `src/services/track/*` 的 `PRESET_*` | event-tracking、database-design |
| 预置数据（字典/配置） | `src/shared-services/dict` / `src/shared-services/config` 的 `ensurePreset*` | database-design |
| 主题家族 / 品牌色 | `src/theme/themes.ts` + `global.css` | AGENTS 视觉章节 |
| 技术栈版本 | `package.json` | AGENTS、README（标注"以 package.json 为准"） |

> 事实数字一律不写入文档（表数、权限码数、缓存实例数等数量以代码为准）；新增事实时按 AGENTS「开发边界」同步更新引用方文档。

## 5. 引用图（谁引用谁）

```
AGENTS.md ──规则──► .agents/skills（architecture / server-function / db-schema / cache / permission / ...）
  │        ──事实──► 代码（schema / permissions / cache / tasks）
  ▼
.agents/guide.md ──导航──► skills / docs
  │
  ├─ .agents/commands ──执行──► skills（规则）+ docs（背景）
  ├─ .agents/checklists ──浓缩──► skills（每个条目标注来源 skill）
  └─ docs ──背景──► 代码（单一事实来源，反向链接）

docs/ 内部：
  architecture-overview ──概览──► database-design / cache-system / auth-permission-model / deployment-ops / event-tracking / i18n（均只引用不复制）
```

## 6. 文档元信息块约定

每份 docs 头部加一行块引用，让边界可自查：

```markdown
> 定位：平台机制类 · 人类阅读
> 单一事实来源：src/db/schema/index.ts（数据表清单，另见 AGENTS「数据库」章节）
> 引用关系：← 被 architecture-overview 引用；→ 引用代码单一事实来源
> 更新触发：数据表 / 列定义变更时
```

字段含义：
- **定位**：所属子类（平台机制 / 决策档案 / 规则 / 流程 / 验证）+ 读者（人类 / AI 执行）
- **单一事实来源**：本文件引用的外部事实在代码哪里，或声明自身为 owner
- **引用关系**：谁引用本文件（←）、本文件引用谁（→）
- **更新触发**：什么代码变更需要同步本文件

**Skills 不引入该块**：`.agents/skills/**/SKILL.md` 使用结构化 frontmatter（`name` + `description`），其 `description` 已承担「何时触发」职责，边界以第 3 节归属映射为准。

## 7. markdown 风格规范

全仓库 md 文件（README / AGENTS / docs / .agents / CHANGELOG）统一遵循下列风格；改动既有文档时以本规范为准做对齐，新增文档按本规范撰写。Biome 不覆盖 md 文件，本规范为人工守门（review 自查）。

### 7.1 文件结构

- 每个 md 文件**第一行必须是 H1 标题**（`# 文档名`），不允许正文裸开头；skill / command 例外：frontmatter 之后立即接正文的 command（如 `deploy.md`）也必须先写 H1
- docs 平台类文档头部跟随第 6 节**元信息块**（四行 `>` 引用）
- skill / command 使用 YAML **frontmatter**（`---` 包裹），内容以 `.agents/` 为权威（软链视图不另维护）

### 7.2 标题层级

- H1 唯一，表示文件主题；H2 为章节；H3 为子节；**禁止跳级**（H1 → H3）
- 标题与上下正文之间保留一个空行；标题使用 ATX 风格（`#` 前缀），不使用 Setext 下划线式

### 7.3 表格

- 表头下方必须有分隔行（`|------|`），列数对齐表头
- 单元格内代码/标识符用反引号包裹；单元格内 `|` 需转义为 `\|`
- 表格仅用于结构化对照（清单/映射/对比），大段描述用列表而非表格

### 7.4 代码块

- 代码块标注语言（如 ` ```ts `、` ```bash `、` ```mermaid `），不使用裸代码块
- 代码块内缩进与正文列表缩进一致，不混用 tab / 空格

### 7.5 中文排版

- 正文一律**简体中文**；术语与代码标识保持英文原样（不翻译）
- 同一概念全文用语一致（如「Server Function / SFn」「缓存实例 / 缓存」不可混用变体）
- 数字与单位之间、中文与英文之间不加多余空格；标点使用全角中文标点，英文/代码片段内使用半角

### 7.6 CHANGELOG 结构规则

- **骨架**：文件头为 `# CHANGELOG`（H1）+ 一句简介（格式基于 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)、版本遵循 [Semantic Versioning](https://semver.org/spec/v2.0.0.html)）；版本段自上而下 `[Unreleased]` → 最近发布版本 → 「历史版本」索引（可选：文件尾 compare/release 链接区，仅当存在可公开引用的远端时启用）
- **分类固定顺序**：`Features` → `Infrastructure` → `Refactor` → `Fix` → `Docs` → `依赖升级` → `Breaking Changes`，按此顺序排列（先「新增」后「变更/修复」再「维护/破坏」）
- **每个版本段内每个分类只允许一个标题块**（新增条目归入既有块，禁止追加重复标题）
- **版本头**：`## [Unreleased]` 放未发布变更；发布后升为 `## [vX.Y.Z] - YYYY-MM-DD`（SemVer：MAJOR=破坏性、MINOR=新特性、PATCH=修复）
- **单条语法**：一行导语 `- **标题**：做了什么 + 影响范围` + 缩进子项；禁止单行超长段（超约 3 行拆到 `  - ` 子项）；`[infra]` 前缀标记可被衍生项目吸收的基建变更（`Infrastructure`/`Fix` 分类）；`Breaking Changes` 条目加 `⚠️` 与迁移/升级注意；代码/标识符用反引号
- **主文件保留** `[Unreleased]` + 最近 3 个版本 + 「历史版本」索引链接；更早版本归档至 `docs/archive/changelog/v1.x.x.md`（保留各版本标题，归档文件头注明版本范围）
- CHANGELOG 属历史记录，不参与当前事实比对

### 7.7 结构模板

- **skill**：frontmatter（`name` + `description`）→ H1 → 快速索引（可选）→ 规则正文 → 代码示例 → 违规自查（可选）→ 相关 Skill
- **command**：frontmatter（`description`）→ H1（`# /命令名`）→ 按序编号的步骤（`1. 2. 3.`），涉及既有流程时引用 skills/docs 而非复制规则
- **checklist**：H1 → 来源说明块（`> 规则来源：...`）→ 按主题分组的 `- [ ]` 勾选项

## 8. 维护规则

### 新增文档

1. 按第 3 节映射表判定归属层；不确定时按「机制解释 → docs/平台类」「操作步骤 → commands」「规则 → skills」
2. 若内容含数量/清单类事实，删除并改为指向代码
3. 填写第 6 节元信息块，并按第 7 节风格规范撰写（H1 首行、标题层级、表格/代码块、结构模板）
4. 同步 `.agents/guide.md` 的 Docs / Skills 索引
5. 若 README 需要收录，同步 README 文档索引

### 事实变更（改表/权限码/缓存等）

1. 修改代码（详情以代码为准，文档不搬数字）
2. 若引用方文档含解释性描述（如按分组的表说明），按需同步该设计说明
3. 文档正文不得出现硬编码数量/清单

### 已弃用 / 历史内容

- 模块废弃或设计被推翻时，正文保留但头部标注「已废弃/已弃用，仅作历史参考」，并在现行方案处加链接；不删除（历史可追溯）
- 一次性计划完成后归档至 `docs/archive/`

## 9. 当前文档清单

> 完整清单与角色见 [.agents/guide.md](../.agents/guide.md) 的索引；README 文档索引仅导航不重复内容。
