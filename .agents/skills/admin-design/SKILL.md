---
name: admin-design
description: >
  管理端 UI 设计规范（布局骨架 / 页头三段式 / 表格列与列宽预算 / 操作列 /
  筛选落点 / 弹窗与抽屉 / 表单 / 状态与反馈 / 分析页）。当新增或改造 /admin
  页面、调整表格列、加筛选、写弹窗抽屉与表单时触发。
  ——模块生成流程见 admin-crud skill；视觉令牌见 AGENTS.md「视觉风格与主题约定」。
---

# 管理端设计规范

## 0. 适用范围

- **规则本体在本文件**（尺寸档位、决策表、禁令）；机制与实测依据见 [docs/admin-design.md](../../../docs/admin-design.md)；验收见 [checklists/admin-design.md](../../checklists/admin-design.md)
- 尺寸基准：侧边栏 200 + **标题栏 56 高** + 内容区 `p-5`（内边距 40）；**列宽预算的参考视口取 1600** → 全宽页可用宽 **1359**（1440 视口下实测可用宽 1199，仅作参考）
- 本文件出现的所有数值都是硬约束，页面不得各写一套

## 1. 布局骨架

### 1.1 页头三段式（一页一行 chrome）

```
┌ 标题栏 ─ 高 56px ────────────────────────────────────────────────────┐
│ 标题（说明走 Tooltip）  [筛选段 ← 左起紧贴标题，flex-1]   [操作段 → 右] │
└──────────────────────────────────────────────────────────────────────┘
表格（占满剩余高度，表体内部滚动）
```

- **标题段**：只有标题（`max-width: 300px` 内省略）；页面说明一律走 `description`，**以 Tooltip 在悬停标题时显示**（`AdminPageContent` 统一处理，`mouseEnterDelay: 0.3`），不占标题栏第二行——实时计数等动态说明同样放这里（如「当前 27 项」「当前 用户状态（2 条）」）
- **筛选段**（`AdminListPage` 的 `filters` → `AdminPageContent.titleTrailing`）：左对齐、`gap: 12px`，放搜索 / 状态快筛 / 分类 Select / 日期范围
- **操作段**（`extra`）：`ml-auto` 右对齐；**主操作（`type="primary"`）最多 1 个且放最后**，次要操作 ≤2 个，其余收进「更多 ▾」
- **禁止独立筛选行**：页面级工具条已删除（`AdminTableToolbar` 不再存在），筛选与操作一律进页头
- **放不下时**：用 `AdminFilters` 的 `more` 收进「筛选 ▾」浮层（`AdminFilterItem` 提供标签），**不得**新增第二行
- **显式查询页**：`查询`(primary) + `重置` 由 `AdminFilters` 渲染，紧跟筛选段末尾（**不靠右、不与筛选分置两端**）

```tsx
<AdminListPage
  title="埋点事件查询"
  description="查询和分析客户端上报的埋点事件数据"
  filters={
    <AdminFilters onQuery={handleSearch} onReset={handleReset} moreCount={1} more={
      <AdminFilterItem label="触发时间"><RangePicker className="w-full" /></AdminFilterItem>
    }>
      <Select placeholder="事件名称" style={{ width: 160 }} />
      <Input placeholder="关键词搜索" style={{ width: 240 }} />
    </AdminFilters>
  }
  extra={<><Button icon={<DownloadOutlined />}>导出 CSV</Button><Button>刷新</Button></>}
>
```

### 1.2 区块与间距

- 表格**直接挂在页头下**；仅当存在「必须常驻的页面级工具」时才用 `stats` 区块（当前仅文件管理的双路上传区）
- 区块间距 16px、控件间距 12px、卡片内边距 16px
- 内容区高度 `calc(100vh - 56px)` 内部滚动；**表体高度由骨架实测注入**，禁止各页手写 `scroll.y`
- 空态用 `locale={{ emptyText: "…" }}`（中文），禁止 antd 默认英文空态

## 2. 筛选与查询

### 2.1 即时筛选 vs 显式查询

- **即时筛选**：筛选控件 `onChange` 即 `applyFilters`（管理端 CRUD 列表默认）
- **显式查询**：重查询页面（运行日志 / 操作日志 / 埋点事件查询 / 分析页）保留「查询」按钮，输入仅维护草稿条件，未点查询不发请求

### 2.2 筛选落点决策表

| 筛选类型 | 落点 | 说明 |
|---|---|---|
| 关键词搜索 | 页头筛选段 | 全页唯一主筛选，用 `Input.Search`（内嵌查询图标），**不再外挂「搜索」按钮** |
| 状态类（上架/临时/未读/启用…） | **列头漏斗** | `filters` + `filterMultiple: false` + 受控 `filteredValue`；配 `useListQuery` 的 `mapColumnFilters` |
| 分类（取值 > 8） | 页头 Select | 如配置分组、实体类型、模块 |
| 时间范围 | 页头 | `RangePicker` + `presets`（今天/近 7 天/近 30 天） |
| 低频项（粒度 / 对比 / 维度拆解 / 动作 / 关键词） | 「筛选 ▾」 | 用 `AdminFilters` 的 `more`，`moreCount` 显示已启用数量 |

- 日期快选**禁止**铺成第二行（日志页原有的 14 个日期 Tag 已收进「筛选 ▾」）
- 「重置」紧邻查询按钮；列头漏斗自带重置，页面可不再提供

### 2.3 列头筛选接入

```ts
const list = useListQuery<FileRecord, FileFilters>({
  initial, initialFilters: { status: "", keyword: "", tag: "" }, errorMessage,
  // 列头漏斗 → 业务条件；hook 只认「值真正变化」，翻页不会被重置回第 1 页
  mapColumnFilters: (columnFilters) => ({
    status: (columnFilters.status?.[0] as FileFilters["status"]) ?? "",
  }),
  fetcher: useCallback(...),
});
```

列侧（`-mods/filesColumns.tsx`）：

```tsx
{
  title: "状态", dataIndex: "status", key: "status", width: 100,
  filters: [{ text: "永久", value: "permanent" }, { text: "临时", value: "temp" }],
  filterMultiple: false,
  filteredValue: options.statusFilter ? [options.statusFilter] : null,
  render: ...,
}
```

## 3. 表格

### 3.1 列宽模型（硬规则）

表格宽度行为由 antd 的实现决定（实测数据见 [docs/admin-design.md](../../../docs/admin-design.md)）：`<table>` 内联 `width: scroll.x; min-width: 100%`，存在固定列时为 `table-layout: fixed`；**容器宽于 `scroll.x` 时，多出的宽度归不写 `width` 的列**。

于是只有一条口径：**`scroll.x` = 各列宽度之和，且恰好留一列不写 `width`（弹性列）**。

| 场景 | 行为 |
|---|---|
| 容器 > `scroll.x`（大屏） | 余宽全部给弹性列，其余列严格保持声明宽 → 列紧凑、不出现某列拉出一大片空白 |
| 容器 < `scroll.x`（小屏） | 表格内横向滚动，各列等于声明宽 → 弹性列恰好等于自己的声明宽，固定列不溢出 |

- **每列必须显式 `width`（弹性列除外）**；`scroll.x` 由 ProTable 自动推导（`Σ列宽 + 行展开列 + 行选择列`），**页面不写 `scroll.x`**
- **恰好一列弹性（硬规则）**：用 `elastic: true` 标记，且**仍要写 `width`**——语义是「出现横向滚动时该列的宽度」（操作列取 `actionsWidth(...)`，长文本列取最小可读宽）。多列平分余宽会让列宽不可控，故禁止
- **弹性列选择顺序**：① **操作列（默认）** → ② 有内容不可控且有展示价值的长文本主列（新闻标题 / 消息标题 / 翻译值 / 运行日志消息 / 操作日志目标 / 埋点属性串）→ ③ 首个可伸缩文本列 → ④ 都不命中则不设（全定宽，余宽按列宽等比分配，实测有效）。即**默认把余宽给操作列**，只有确有长文本主列时才让位给它，此时操作列照常声明实测宽
- **`tableLayout` 由 ProTable 固定为 `fixed`**，页面不要写 `auto`：fixed 下 `ellipsis` 才生效、列宽才等于声明值
- **预算**：`Σ列宽 ≤ 参考视口（1600）下该表可用宽度`——全宽页 **1359**，双栏右栏 **1157 / 1137**（`TABLE_BUDGET` / `splitPanelBudget`，见 3.6）。窄于该宽度时表格内横向滚动（列宽不被压缩、固定列仍精确），**长文本列的可读性优先于「1440 下不滚动」**
- **超出预算的裁剪优先级**：① 详情性长文本 → 行进 `expandable` ② 次要时间列 → 删 ③ 操作项 → `TableOperate.More` ④ 低价值列 → 删 ⑤ 最后才动档位（**不许把状态列压到 90 这类"凑得下"**）
- **列宽必须 ≥ 内容宽 + 32px 单元格内边距**：装不下时内容**溢出到相邻列**（比省略号更糟）。实测两例：`Boolean 布尔开关` 标签 113px 塞进 100px 列溢出 45px；标准尺寸 `Switch` 78px 塞进 100px 状态列溢出 10px
- **长文本列必须 `ellipsis`**（无省略会顶出列宽、产生横向滚动条）；内联编辑列禁止 `ellipsis` / `copyable`
- **不写裸数字**：档位列用 `COLUMN_WIDTH.*`，操作列用 `actionsWidth("编辑", "删除")` 按文案实算，其余内容列按「最长文案宽 + 32」取整，并在注释里写明依据
- 时间列 `COLUMN_WIDTH.time`（165）/ `timeSecond`（180），可空列带 `emptyText: "—"`；图片 / 封面列放最前（`ImageCell`，`COLUMN_WIDTH.avatar`）；字节列 `formatBytes`；服务端排序 `...list.sortProps("字段名")`
- **双栏（左栏 + 右表格）**：只在左栏是「独立实体列表」或「常驻可见就有价值的分组概览」时使用（如字典类型、配置分组）；单纯分类筛选用页头 `Select`。统一用 `AdminSplitPanel`（见 3.6），其右栏自动下发对应预算，左栏不套 `Card`
- **自检两层**：① 开发期 ProTable 对「Σ 超预算 / 弹性列 ≠ 1 / 非弹性列缺 width」输出 `console.warn`（`AdminProvider` 在 DEV 下开启）；② 列定义抽到 `-mods/xxxColumns.ts` 的表由 `app/src/routes/admin/_admin/__tests__/column-budget.test.ts` 覆盖——**新增列表页把列工厂登记进该用例的 CASES，即纳入 CI**

### 3.2 列宽档位

档位是单一事实来源（`@ucode/hub-ui-spa/table` 的 `COLUMN_WIDTH`），页面引用常量而非裸数字——同一类列在多页之间必须严格一致。

| 列类型 | 档位 | 依据（14px 字号） |
|---|---|---|
| 行展开列 | `expand` **50** | `+` 图标 16 + 单元格内边距 32（antd 默认 48） |
| 行选择列 | `selection` **48** | antd 默认 32，本项目统一 48 与展开列协调 |
| 图片 / 封面 | `avatar` **80** | 48 图 + 内边距 |
| 状态 / 级别标签 | `status` **100** | 双字标签 68 + 内边距（`StatusTag` / `DictTag` / 日志级别） |
| 布尔开关 | `toggle` **100** | 小号开关 44 + 内边距（`PublishSwitchCell`，禁止标准尺寸） |
| 排序权重 | `sortOrder` **115** | 小号数字输入 83 + 内边距（`SortOrderCell`） |
| 时间 · 到分 | `time` **165** | `2026-09-22 10:26` 133 + 内边距（`valueType: "dateTimeMinute"`） |
| 时间 · 到秒 | `timeSecond` **180** | 148 + 内边距（`valueType: "dateTime"`） |
| 枚举 / 标签 | `tag` **150** | 2~4 字标签，更长按最长文案调大 |
| ID / 标识 | `id` **120** / `uuid` **170** | 短标识（`page_view`）/ 长 UUID（配 `copyable`） |
| 短文本 | `shortText` **180** | 用户名 / 邮箱 / 名称 / 编码，按典型最长在 100~220 间取 |
| 长文本主列 | `text` **340** | 标题 / 值 / 文件名 / 路径。**340 是可读下限**：低于此值这类内容频繁触发省略号，只能靠 Tooltip 读全文；作弹性列时即最小可读宽 |

档位之外的列按 **「最长文案宽 + 32」向上取到 10 的整数倍**（中文 14px、ASCII 7.5px 估算），并在列上注释写明依据。

### 3.3 通用态与状态列

- 布尔状态（上架 / 启用）：`PublishSwitchCell` 单元格内切换（乐观更新 + 失败回滚）
- 多值枚举：`StatusTag`（语义色）/ 字典驱动用 `DictTag`
- 排序权重：`SortOrderCell`（失焦 / 回车提交，值未变不发请求）
- 状态变更落库走**单字段 SFn** + `logCrud` 审计；禁止复用整表更新
- 内联编辑列禁止 `ellipsis` / `copyable`（ProTable 会用 `overflow: hidden` 的 span 包住控件）
- **不定长标签集**（文件标签、多值枚举 + 附加元信息 Tag）：单元格内**单行横向滚动**——滚动容器 `overflow-x-auto` + 内层内容行 `flex w-max items-center gap-1`（`w-max` 让内容按标签实际宽度铺开，滚动与测量都靠它）、全站 `.scrollbar-thin` 细窄滚动条，Tag 加 `shrink-0` 并归零 `marginInlineEnd`；**不换行、不折叠为 `+N`**（换行会让行高不齐，`+N` 会把标签藏进 Tooltip）。**内容被裁掉时再挂 `Popover`**（hover / 聚焦，`mouseEnterDelay` 0.3）平铺列出全部标签，不必拖动即可看全；是否溢出用 `ResizeObserver` 同时观测滚动容器（列宽变化）与内容行（标签增删），内容本就完整时不挂弹层（无谓打扰）。列宽按「固定前缀 Tag + 一个短标签」估（文件管理页 180 = 尺寸 Tag 91 + 双字标签 52 + 间距 4 + 内边距 32）

### 3.4 操作列

- 一律用 `TableOperate` 容器；可用子组件 `Edit` / `Delete` / `Link` / **`More`** / `Custom`
- **项数 ≤ 4**；高频动作外置（下载 / 删除），元数据类编辑（标签 / 编辑图片 / 翻译）收进 `TableOperate.More`。**确需 5 项全平铺**（如文件管理页：下载 / 标签 / 预览 / 编辑图片 / 删除）时，代价是操作列按 5 项文案实算宽（420），须**先裁掉低价值列腾出宽度**（该页裁「文件 ID」列并把 ID 移入行展开面板的 `DetailGrid`），不得压缩其它列凑数
- **宽度用 `actionsWidth("编辑", "删除")` 按文案实算**（每项 `16 图标 + 4 间距 + 文案 + 16 内边距`，项间 8，单元格 32，向上取到 10 的整数倍）：1 项 100 / 2 项短文案 170 / 3 项短文案 240 / 3 项含四字文案 270 / 4 项 320。写死数值会与文案脱节——历史上 160 / 260 都差 8px 导致按钮溢出
- **默认 `elastic: true`**：操作列是余宽的去处（见 3.1），它声明的宽度即「出现横向滚动时的按钮所需宽」；若页面把弹性让给了长文本主列，操作列则照常声明该宽度并保持 `fixed: "right"`（固定列无宽度会被压扁、把按钮挤出列外）
- `TableOperate.Delete` 内置 `Popconfirm`（文案 `确定删除{recordName}？`），**不自行吞错**：`onConfirm` 交调用方 `sfnUnwrap` / `callSfn`
- 无权限：`disabled` + `disabledReason`（置灰 + Tooltip 说明，禁止隐藏）

### 3.5 超预算与豁免

- **列表页不允许 Σ 超预算**（参考视口下会出横向滚动）：按 3.1 的裁剪优先级处理
- **豁免场景**：Card / 弹窗内的**迷你表**（分析排行、数据库占用、权限选择器）、演示页、确需横向滚动的宽表——显式传 `budget={null}` 关闭校验，此时仍需每列定宽（除弹性列）并保证内容不溢出
- **弹窗内的表必须显式 `scroll.y`**（如权限选择器 320）：否则会继承页面骨架注入的表体高度，出现「弹窗体 + 表体」双层滚动
- 确需横向滚动的宽表：不要固定操作列（固定列会盖住被滚动的列），可改为 `fixed: "left"` 固定标识列

### 3.6 双栏（master-detail）

**使用前提**（二者之一）：左栏是①**独立实体列表**（可增删改，如「字典类型」）或②**常驻可见就有价值的分组概览**（如「配置分组」的名称 + 条目数）。单纯做分类筛选、取值又不多时用页头 `Select`，不要为此开双栏。

**统一用 `AdminSplitPanel`**（`#/components/admin`）：

```tsx
<AdminSplitPanel
  sideTitle="配置分组"                       // 左栏标题
  sideWidth={SPLIT_PANEL_WIDTH.narrow}      // 分组概览 180 / 实体列表 200
  side={items.map((it) => (
    <AdminSplitPanel.Item
      key={it.key}
      primary={it.name}          // 主文案（名称）
      secondary={it.slug}        // 次要文案（标识 / 说明），可选
      extra={it.count}           // 右侧辅助信息（条目数），可选
      actions={<EditButton />}   // 行内操作，与选中互不干扰，可选
      active={it.key === selectedKey}
      onSelect={() => select(it.key)}
    />
  ))}
>
  <ProTable ... />               {/* 右栏：预算按右栏实宽算 */}
</AdminSplitPanel>
```

约束：

- **左栏宽度只取档位**（`SPLIT_PANEL_WIDTH.narrow 180` / `base 200`），间距固定 20px
- **左栏与右表同一套视觉逻辑**：`border border-border` 外框 + **灰底标题行**（与表格表头同色 `bg-background-secondary`、同为 14px / 600、约 53px 高，实测两栏等高、表头差 2px）+ 白底内容区；两栏读作一对
- **左栏固定高度 + 吸顶 + 内部滚动**：高度取内容区可视高度 `calc(100vh - var(--admin-header-height) - 2.5rem)`，容器 `sticky top-0`，列表区 `min-h-0 flex-1 overflow-auto`——右栏内容（不分页的长表）滚动或页面变矮时，左栏始终整屏可见、不跟着滚走
- **列表项**：整行 `px-4 py-2.5` + `border-b border-divider`（末项去掉）；
  选中指示用 **`border-l-[3px]`**（选中 `border-l-primary`、未选中 `border-l-transparent`），与侧边导航同构，不引起内容左右跳动
- **交互态**（缺一不可，与侧边导航 `AdminNav` 对齐）：悬停 `hover:bg-accent/60`（半透明，任何底色上都能看见；用不透明的 `bg-accent` 在白底上几乎不可辨）、按下 `active:bg-accent`、键盘聚焦 `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset`、`cursor-pointer`、`transition-colors`
- **行内操作弱化**：默认 `enabled:text-foreground-tertiary`，悬停才提亮（编辑 → `hover:text-primary`，删除 → `hover:text-danger`），避免每行两枚主色图标抢视觉；用 `enabled:` 变体而不是裸 `hover:`，否则会覆盖 antd 的禁用态配色
- **右侧计数**用 `tabular-nums` 右对齐，数字列对齐
- **左栏不套 `Card`**：与右栏表格叠成双层边框
- **列宽预算按右栏实宽**：`右栏宽 = 1359 − 左栏宽 − 20`；超出时先裁右表列或把详情列移入行展开（系统配置即裁掉「描述」列）
- **列表项结构固定**：选中指示条（始终占位，避免切换时内容左右跳动）+ 主文案 + 次要文案 + 右侧计数 / 行内操作；主文案是独立的 `button`，行内操作是它的兄弟节点，因此**不需要 `stopPropagation`**
- **左栏不承载页面级主操作**：「新建字典」「新建配置」放页头操作段；依赖选中项的次级操作（如「新建条目」）也放页头，未选中时置灰并说明原因
- 依赖选中项的信息（当前字典名、条目数）写进页头 `description`（悬停标题可见），不再在右栏另起一行标题
- 未选中时的空态放右栏中央（`请选择左侧字典查看条目`），不要留空白表格

### 3.7 行展开面板（`DetailGrid`）

- 详情性字段收进 `expandable.expandedRowRender` 后，一律用 `DetailGrid` 渲染，**不再各页手写卡片网格或另用 `Descriptions`**（列表页汇总、时间列、扩展配置等场景同理）
- `items: DetailGridItem[]` 声明字段：`key` / `label`（中文业务标签）/ `fieldKey`（英文原始键，渲染为标签旁中性 Tag）/ `value`（空值 `null` / `undefined` / 空串统一渲染「—」）/ `copyable` + `copyText`（默认按字符串值提供复制，位于卡片头部右侧，hover / focus 时显现）/ `extra`（单元格级操作，如「查链路」）
- 原始属性值经 `formatDetailValue()` 归一（对象转缩进 JSON），避免各页重复实现
- **自适应网格**：列数由容器宽度与 `minItemWidth`（默认 320）共同决定（`repeat(auto-fill, minmax(...))`），不写 `sm:` / `xl:` 之类断点；**面板左边缘与首个数据列对齐**（展开列 50px − 表格单元格自带 16px 内边距 = 34px），不再额外缩进；卡片为描边直角容器（`border border-border bg-background`），值区等宽字号 + 单行截断 + Tooltip 全文

## 4. 容器：Modal 还是 Drawer

### 4.1 决策表

| 场景 | 容器 |
|---|---|
| 单对象新建 / 编辑，字段 ≤ 6 且无富文本 / 图片墙 | `AdminFormModal`（base 520，较宽用 640） |
| 含富文本 / 图片墙 / 需要纵向空间的编辑器（如新闻正文），或字段多到弹窗内滚动不便 | `AdminFormDrawer`（base 640 / wide 760 / full 60%） |
| 单字段快速修改（标签 / 状态 / 排序） | 单元格内联编辑，或小 Modal（`sm` 420） |
| 危险操作确认 | 行内 `Popconfirm`（表格）/ `Modal.confirm`（页面级） |
| 设置类（通知渠道、SMTP） | `AdminFormModal`（520） |
| 内容预览 / 长内容查看 | Modal（`width="auto"` 居中）或 Drawer |

### 4.2 弹窗与抽屉规范

- **宽度只取档位**：Modal `FORM_MODAL_WIDTH` = `sm 420 / base 520 / wide 640`；Drawer `FORM_DRAWER_WIDTH` = `base 640 / wide 760 / full "60%"`
- **表单类新建 / 编辑一律走 `AdminFormModal` / `AdminFormDrawer`**；非表单的工具类弹窗（图片预览、图片编辑器、重命名 / 新建目录这类单字段提示、标签编辑）可以直接用 antd `Modal`，但需自带 `destroyOnHidden` 与明确的 `width`（单个字段的小弹窗取 `base 520`；图片 / 文本预览这类需要大面积的可按视口相对给值，如 `min(1280px, 92vw)` / `75%`）
- 标题统一 `新建X` / `编辑X`（容器按 `entityName` + `id` 自动生成；标题不能用该模式时用 `title` 显式覆盖，如「重置密码 — admin」）
- 底部主按钮：传 `formId` 时容器以 `htmlType="submit" form={formId}` 触发该表单提交（表单侧配合 `formId` / `hideActions` / `onSubmittingChange`）；或传 `onOk` 交调用方提交
- 固定 `destroyOnHidden`：隐藏即卸载，避免校验态残留与 `display:none` 容器内组件拿到 0 尺寸
- **表单不写 `className="mt-4"`**：弹窗 body 自带 24px 内边距
- 表单初值由调用方在打开时装配（`setFieldsValue` / `initialValues`），容器不负责重置

## 5. 表单

- 统一 `layout="vertical"`；必填用 `rules`，校验失败由 antd 就地提示
- 控件选型：文本 `Input` / 长文本 `Input.TextArea` / 枚举 `Select` / 字典 `DictSelect` / 布尔 `Switch` / 单选组 `Segmented` 或 `Radio.Group` / 时间 `DatePicker` / 上传 `FileUpload`·`ImageUpload` / 富文本 `RichEditor` / 权限 `PermissionSelector`
- 服务端校验为最终权威（zod 在 `.schemas.ts` 单一来源）；客户端错误统一交 `callSfn` / `sfnUnwrap` 提示，禁止在表单里 `try/catch + message.error`
- 提交期间主按钮 `loading`，期间禁止重复提交
- 富文本编辑器高度按其内容区自适应（见 `RichEditor`），禁止在弹层内再套固定高度导致双层滚动
- 可翻译字段用 `FieldTranslationDrawer`（操作列「翻译」入口）

## 6. 反馈与状态

- `message` / `modal` / `notification` **必须**从 `@ucode/hub-ui-spa/antd-static` 导入（静态导入会脱离 ConfigProvider 上下文）
- 列表加载：`ProTable loading`；按钮提交：`loading` / `confirmLoading`；页面级：`Spin`
- 错误出口唯一：客户端调 SFn 一律 `sfnUnwrap` / `callSfn`；有意静默传 `{ silent: true }`
- 空态中文占位；失败态给可重试入口，不裸抛

## 7. 分析页与看板

- 骨架：`AdminPageContent`，筛选进页头（时间范围 + 主维度内联，粒度 / 对比 / 维度拆解 / 关键词 → 「筛选 ▾」）
- **禁止用 `Card` 包筛选区**（历史写法，已统一移除）
- KPI 用 `AnalyticsKpiCards`；图表用 `Card`；KPI 与图表卡间距 16px
- 页面级不需要「新建」主操作时，操作段留空即可，不强行放按钮

## 8. 反例清单（禁止）

- ❌ 独立筛选行 / 两端对齐（左侧一两个控件、右侧一堆按钮，中间大片死区）
- ❌ 搜索按钮与重置分置页面两端
- ❌ 页面级状态快筛（Segmented / Tabs）——状态筛选一律进列头漏斗
- ❌ 新建 / 编辑表单同时存在两种容器写法（同一场景只用 Modal 或 Drawer）
- ❌ 弹窗 / 抽屉宽度写非档位数值
- ❌ `Σ列宽 > 预算`（不裁列硬塞）、无 `ellipsis` 的长文本列、无宽度的固定操作列
- ❌ 把整表数据拉到前端排序 / 分页（服务端分页列表）
- ❌ `Card` 套筛选区、`className="mt-4"` 手写弹层内间距
- ❌ 手工 `dayjs().format` 渲染时间列（用 `valueType`；非表格场景用 `formatDateTimeValue`）

## 9. 验收

改完管理端页面后逐项自查 → [checklists/admin-design.md](../../checklists/admin-design.md)。
