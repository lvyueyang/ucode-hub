# 管理端设计规范（机制与依据）

> 定位：平台机制类 · 人类阅读
> 单一事实来源：**规则与尺寸档位**在 [admin-design skill](../.agents/skills/admin-design/SKILL.md)；本文只解释「为什么」与实测依据；代码层面以 `app/src/components/admin/{AdminPageContent,AdminListPage,AdminFilters,AdminSplitPanel,AdminFormModal,AdminFormDrawer}.tsx`、`app/src/utils/use-list-query.ts`、`packages/ui-spa/src/table/*` 为准
> 引用关系：← 被 AGENTS.md「组件约定 / 表格操作列 / 表格列规范」与 [admin-crud](../.agents/skills/admin-crud/SKILL.md) 链接；→ 引用上述代码单一事实来源
> 更新触发：页面骨架、查询状态机、列宽预算、容器档位（Modal / Drawer）、通用态组件变更时

## 1. 从「各页各写一套」到三段式

管理端带表格的页面约二十个，曾长期并存三类问题（1440×900 视口实测）：

**① 页头之下多出一条只占一半的筛选行。** 筛选行高 32 + 间距 16 = 48px，但控件只占其中一小段：

| 页面 | 筛选行内容 | 该行死区 |
|---|---|---|
| 新闻管理 | Segmented(全部/已发布/未发布) + 导入/导出 ×3 | ~580px |
| 管理员 / 角色 / 国际化 | 搜索框 + 独立「搜索」按钮 … 重置（分置两端） | ~700px |
| 系统配置 / 字典 | 一个搜索框 / 一行文字提示 + 导入导出 | ~700px |
| 运行日志 | 筛选行 + **14 个日期 Tag 的第二行**（共 96px） | 大面积 |

**② 筛选行与操作区职责重叠。** 次要操作（导入 / 导出 / 刷新）时而在筛选行右侧、时而在标题栏右侧，同一功能在不同页面位置不同。

**③ 表格横向溢出。** 16/17 个表把操作列 `fixed: "right"`，一旦列宽之和超过容器，固定列会盖住中间列并要求横向滚动：

| 页面 | 列宽合计 | 可视宽 | 溢出 |
|---|---|---|---|
| 文件管理 | 2500 | 1199 | **+1301** |
| 系统配置（双栏压窄） | 1510 | 1027 | **+483** |
| 新闻管理 | 1540 | 1199 | +341 |
| 客户端用户 | 1480 | 1199 | +281 |
| 管理员 | 1390 | 1199 | +191 |

结论：把「页面级 chrome」收敛为**标题栏一行三段**（标题 | 筛选 | 操作），筛选行整条删除，次要操作固定进操作段，表格按列宽预算裁剪。

## 2. 布局骨架的机制

### 2.1 内容区定高

管理端外壳把内容区固定为 `calc(100vh - var(--admin-header-height))`（`--admin-header-height: 3.5rem`），并标注 `data-admin-scroll-container`。这样做的原因：

- 表格页需要「页头固定、表体内部滚动」，用文档流滚动会带动页头一起滚走
- 高度已知后，表体高度可以推导（下一节），无需各页写死 `scroll.y`

### 2.2 表体高度实测

```
表体高度 = 容器可视高度(clientHeight)
         − 表格顶部偏移（以容器为参考系）
         − 实测表头高
         − 实测分页器高（offsetHeight + 上下 margin）
         − 24px（内容区底部内边距 + 亚像素余量）
（下限 240px；首帧 480px 兜底）
```

要点：

- **以容器为参考系**而非视口：容器滚动时两个 `getBoundingClientRect()` 同步位移，测量值恒定；若用 `window.innerHeight - rect.top`，滚动会让测量值反向增大，形成「越滚越高」的正反馈
- **表头与分页器实测**：窄屏分页器换行成两排，写死常量会溢出
- **重算时机**：`window.resize` + `ResizeObserver` 观测内容区及全部块级子元素（上传列表展开、侧边栏折叠都会重算），结果不变时 `setState` 自动跳过渲染

### 2.3 页面说明改为标题 Tooltip

标题栏第二行原本放页面说明（12px 灰字）。它与筛选段争抢同一行高度，长说明还会把标题块撑到 300px 上限；而这段文字对**已经进入该页面的人**价值有限（首次理解靠菜单与页面本身）。改为悬停标题时的 Tooltip（`mouseEnterDelay: 0.3` 防误弹）后：标题栏 56px 内只有标题与控件，标题自然垂直居中，筛选段可用宽度不再被说明文字挤压；动态信息（「当前 27 项」「当前 用户状态（2 条）」）仍写在这个 Tooltip 里。

### 2.4 为什么筛选段能放进 56px 标题栏

标题栏高 56px，antd 中号控件高 32px，两侧各余 12px；标题块限宽 300px（超出省略），剩余宽度全部给筛选段。按此预算，筛选段可用约 800px——足够「搜索 + 状态/分类 + 日期范围 + 查询 + 重置」，更长的组合（分析页的粒度 / 对比 / 维度）走「筛选 ▾」浮层。

## 3. 查询状态机

**全部显式触发**，不依赖 effect 自动拉取：

```
路由 loader ──► 首屏数据（useListQuery 的初始值）
                        │
applyFilters(patch) ────┤ 筛选 / 搜索变更 → 回到第 1 页
onTableChange ──────────┤ 翻页 / 排序 / 列头筛选 / 每页条数
reload() ───────────────┘ 增删改 / 内联更新后按当前条件重拉
                        ▼
                    列表 SFn ──► 服务端实际生效的 page / pageSize 回填状态
```

设计取舍：

- **不用 effect 拉取**：`useEffect` 与事件回调并存会重复请求，且触发时机不可预测（曾出现「筛选变化 + 排序 effect」双请求）
- **不在 `pagination.onChange` 上另接逻辑**：分页与排序统一由 `Table.onChange` 驱动；antd 翻页时回传当前 sorter，一个入口足以推导下一步查询。二者并存正是「闪一下仍停在第一页」的根因
- **过期响应丢弃**：每次请求自增序号，只有最新序号的响应写入状态
- **列头筛选**：受控 `filteredValue` 在每次表格变更时都会回传当前值，因此 `mapColumnFilters` 的结果要与现有条件**逐值比较**，只有真正变化才视为筛选变更并回第 1 页——否则纯翻页会被重置

## 4. 服务端契约

- 列表 schema 以 `#/validators/common.schemas` 的 `listSchema` 为基座 `.extend({ ...业务筛选 })`，命名为 `<模块>ListSchema`
- **`pageSize` 必须全链路透传**：服务层硬编码 `pageSize` 会让前端每页条数控件变成无效控件
- 排序在服务层做白名单映射（`buildSortClause(fieldMap, sortField, sortOrder, 默认字段)`），字段名与列 `dataIndex` 一致；默认排序写在服务层
- 单字段变更（排序权重 / 上下架 / 标签 / 状态）各配一个 SFn + `logCrud` 审计，禁止复用整表更新（会把表单里的其它字段一起回写，覆盖他人修改）

## 5. 列宽：预算推导与浏览器行为

### 5.1 预算

1600 视口 − 侧边栏 200 − 内容区左右内边距 40 − 表格边框 = **1359px** 可用宽（`TABLE_BUDGET.full`）；双栏右栏再减左栏宽与栏间距 22 → 1157 / 1137（`splitPanelBudget`）。行展开列（50）与行选择列（48）计入列宽之和。

**参考视口为何取 1600 而非 1440**：长文本列（标题 / 值 / 文件名 / 路径）有 340 的可读下限——低于此值时内容频繁触发省略号、只能靠 Tooltip 读全文。按 1440 计预算（可用宽 1199）会迫使这类列或其它列被压到不可读，或为凑预算砍列（实测系统配置需 1150、文件管理需 1275）。按 1600 计则这几张表在 1600 及以上都无需滚动（实测 1920 / 1600 下横向溢出均为 0），窄屏时表格内滚动、列宽不被压缩。代价是 1440 视口下最宽的 5 张表需横向滚动 11~151px，这是**有意的取舍**：大屏信息完整度优先。

### 5.2 浏览器实际怎么分配宽度（机制）

antd 渲染的 `<table>` 内联样式为 `table-layout: fixed; width: {scroll.x}px; min-width: 100%`（`@rc-component/table` 的 `scrollTableStyle`；存在固定列时 `mergedTableLayout` 为 `fixed`），因此宽度分配由浏览器在 fixed 布局下决定。在真实页面（管理员管理，7 列）注入实测：

| 注入的列宽 | 容器 | 实测渲染 |
|---|---|---|
| 全部 100px（Σ700） | 1199 | 全部 **171px** = 1199 ÷ 7 |
| `[80,180,180,160,100,165,270]`（Σ1135，全列定宽） | 1199 | **[85,190,190,169,106,174,285]** —— 按列宽**等比放大** |
| 同上，最后一列不给宽度（弹性列） | 1199 | **[80,180,180,160,100,165,334]** —— 余宽**全部归弹性列** |
| 同上配置 | 1120（容器 ≈880） | **[80,180,180,160,100,165,270]** —— 横向滚动，各列**严格等于声明值** |

结论：**不必发明「弹性列该给谁」的补丁——只要 `scroll.x = Σ各列宽度 + 弹性列所需宽`，大屏自然铺满、小屏严格按声明宽**。弹性列若同时 `fixed: "right"`（antd 6 的类名是 `ant-table-cell-fix-end`，`position: sticky; right: 0`，宽度跟随布局而非 `width`），滚动态下它的宽度恰好等于声明宽，按钮不会被挤出单元格——这正是「小屏时操作列要有宽度」的构造性保证。

另实测：全列定宽时浏览器按列宽**等比**分配余宽（不是平均分、也不是全给最后一列），所以「一个弹性列都不设」也是一种合法形态（列整体等比放大），但会连带放大时间 / 状态这类短列，故默认仍把余宽集中给操作列。

### 5.3 两处「差一点」的坑

- **无 `ellipsis` 的长文本列**会把内容顶出列宽，`scrollWidth` 溢出 10px 级并出现横向滚动条（去掉 `ellipsis` 前的用户邮箱、AI 基础地址列均如此）
- **列宽必须 ≥ 内容宽 + 32**：`Boolean 布尔开关` 标签 113px 在 100px 列里溢出 45px；标准尺寸 `Switch` 78px 在 100px 状态列里溢出 10px（`PublishSwitchCell` 因此统一小号）
- **操作列宽度与文案绑死**：3 项里含四字文案（`重置密码` / `设为默认`）时 240 不够、2 项短文案时 160 也不够（各差 8px），故改由 `actionsWidth()` 按文案实算

裁剪优先级（合计超出预算时）：① 详情性长文本（存储路径 / SHA256 / 额外类型值）→ 行展开面板；② 次要时间列（更新时间）→ 删除；③ 操作列项数 → 折叠「更多」；④ 低价值列 → 删除；⑤ 最后才动档位。

以文件管理为例：12 列 2500px → 7 列 1275px（MIME / 存储路径 / SHA256 / 过期时间 / 更新时间 收进 `expandable` 行展开面板），文件名取长文本档位 340，余宽归操作列。

### 5.4 复测方法（新表交付前跑一遍）

浏览器控制台执行，看三项：**Σ列宽**（应 ≤ 预算）、**单元格内容溢出**（应全为 0，必须扫**全部行**，只看首行会漏掉最宽的那条数据）、**表格横向溢出**（1440 下应为 0）。

```js
(() => {
  const head = [...document.querySelectorAll(".ant-table-thead th")];
  const rows = [...document.querySelectorAll(".ant-table-tbody tr.ant-table-row")];
  const spill = {};
  head.forEach((th, i) => {
    // 内容宽 vs 列宽 − 32（单元格左右内边距）
    const avail = Math.round(th.getBoundingClientRect().width) - 32;
    rows.forEach((row) => {
      const cell = row.children[i];
      const inner = cell?.firstElementChild;
      if (!inner) return;
      const w = Math.round(inner.getBoundingClientRect().width);
      if (w > avail + 1) {
        const key = th.innerText.trim().slice(0, 6);
        spill[key] = Math.max(spill[key] || 0, w - avail);
      }
    });
  });
  const boxes = [...document.querySelectorAll(".ant-table-body, .ant-table-content")];
  return {
    sum: head.reduce((n, th) => n + Math.round(th.getBoundingClientRect().width), 0),
    horizontal: boxes.reduce((n, b) => n + (b.scrollWidth - b.clientWidth), 0),
    contentSpill: spill,
  };
})()
```

开发期还可依赖 `ProTable` 的告警（`Σ > budget` / 弹性列 ≠ 1 / 非弹性列缺 `width`，由 `AdminProvider` 在 DEV 下开启），以及 `app/src/routes/admin/_admin/__tests__/column-budget.test.ts` 对列工厂的 CI 守门。

## 6. 几处结构决策

### 6.1 状态类筛选进列头，而不是页头快筛

页头 Segmented（全部/已发布/未发布）与 Tabs（全部/未读/已读）占用整行、且与表格里的「状态」列各说各话。改为列头漏斗（`filters` + `filterMultiple: false`）后：筛选入口贴着被筛对象、页头省一个控件、空出的一行整条删除。代价是「一眼可见」变成「点开漏斗可见」，对管理端高频操作可接受。

### 6.2 双栏（master-detail）的保留条件与统一形态

- 只有当左栏承载**独立实体**（可增删改，如字典管理的「字典类型」）或**常驻可见就有价值的分组概览**（如系统配置的分组与条目数）时才用双栏；单纯的分类筛选（取值不多、不需要常驻）用页头 `Select` 即可
- 两个页面统一用 `AdminSplitPanel`（`#/components/admin`）：左栏宽度只取档位（分组概览 180 / 实体列表 200）、间距 20、列表项结构一致（选中指示条 + 主文案 + 次要文案 + 右侧计数 / 行内操作）。此前两页各写一套：系统配置是自绘 `button` 列表，字典管理是 `Card` + `div` + `stopPropagation`，观感与交互都不一致
- **左栏与右表同一套视觉逻辑**：外框 `border border-border`、标题行取表格表头的灰底与字号（`bg-background-secondary` + 14px / 600），内容区白底，两栏实测等高（76→877）、表头差 2px；这样两栏读作一对，而不是「一边有框一边浮空」
- **左栏固定高度 + 吸顶 + 内部滚动**：高度 = 内容区可视高度 `calc(100vh - var(--admin-header-height) - 2.5rem)`（实测 804px @900 视口），容器 `sticky top-0`，列表区自身 `overflow-auto`。系统配置的表格不分页（27 行），页面变矮时右栏内容会滚动，左栏因此必须吸顶——否则分组栏会随内容滚出视口
- **列表项**：整行 `px-4 py-2.5` + `border-b border-divider` + 选中 `bg-primary-bg`；选中指示由「`w-1 h-6 rounded-full` 流内占位」（短、随行高变化、切换时内容位移 8px）改为 **`border-l-[3px]` + `border-l-transparent` 占位**，与应用侧边导航同构
- **交互态对齐侧边导航**：悬停 `hover:bg-accent/60`（侧边导航用 `hover:bg-sidebar-accent/60`；半透明才在任意底色上可见，不透明的 `bg-accent` = neutral-50 在白底上几乎不可辨）、按下 `active:bg-accent`、键盘聚焦 `focus-visible:ring-2 ring-ring ring-inset`、`cursor-pointer`——缺任何一态都会让左栏「看起来不可点」
- **列宽的两个实测坑**（都表现为「内容溢出到相邻列」，看起来像数据错位）：① 单元格内容宽必须 ≤ 列宽 − 32（左右内边距）——配置「值类型」的最宽标签 `Boolean 布尔开关` 实测 113px，在 100px 列里溢出 45px，列宽提到 150 才装下；② 标准尺寸 antd `Switch` 约 78px 宽，100px 状态列装不下，故 `PublishSwitchCell` 统一改 `size="small"`（与 `SortOrderCell` 的小号输入框一致），状态列得以压到 100
- **列宽只有一种表达：每列 `width` + 恰好一列 `elastic`**（见 5.2）。此前的 `minWidth` + `tableLayout="auto"` 已废弃：auto 布局按内容 max-content 计算，演示页那种多列表会被撑到 2364px（宽度声明形同虚设），资源管理器也因此改为定宽 + `ellipsis`
- **`scroll.x` 由代码推导，页面不写**：`= Σ列宽（含展开 / 选择列）`，由 `ProTable` 自动计算。此前手写 1199 / 997 / 977 之类固定数值的写法会与列宽悄悄漂移（曾出现 `scroll.x = 710 < Σ列宽 725` 这类自相矛盾）。容器窄于它时表格内横向滚动、列宽不被压缩
- **排序 / 状态列定宽**：排序 115（`SortOrderCell` 内含 78px 输入框）、状态 100（小号开关 / 状态标签），全站统一，不再各页 90/110/130 混用
- **行展开列统一 50**：`expandable.columnWidth`（`+` 图标 16 + 单元格内边距 32 = 48，antd 默认即 48；原取 90 过宽）；各表据此重算预算——文件管理（展开 50 + 六列定宽 925 = 975，文件名得 224）、字典条目（展开 50 + 四列定宽 755 = 805，值得 174）
- **弹性列归属**：默认给操作列（数据列保持紧凑、余宽落在表格最右）；确有长文本主列时让位给它（配置值 / 文件名 / 标题 / 翻译值 / 属性串），操作列则照常声明实测宽
- **标识类列按内容定宽、内容不可控的列取长文本档位 340**：字典「标签」240、配置「配置键」220、字典「值」与配置「值」340——值列低于 340 时密钥 / JSON / 长串频繁省略（实测从 99 / 172 提到 340 后不再依赖 Tooltip）
- **行内操作弱化**：字典管理的编辑 / 删除由 `type="link"`（主色）改为 `type="text"` + `enabled:text-foreground-tertiary`，悬停提亮为 `text-primary` / `text-danger`；每行两枚主色图标会把左栏读成「按钮堆」
- 左栏不套 `Card`：与右侧表格叠成双层边框
- 保留双栏时必须按**右栏实宽**算列宽预算：右栏宽 = 1359 − 左栏宽 − 20，据此裁剪列或把详情列移入行展开
- 页面级主操作与依赖选中项的次级操作（如「新建条目」）都放页头操作段（未选中时置灰说明），不放左栏；依赖选中项的信息（当前字典名 / 条目数）写进页头 `description`，不再在右栏另起标题行
- 实例：系统配置左栏 180px 分组概览，右栏裁掉「描述」列（与配置键语义重复，详情在编辑弹窗内），6 列合计 999；字典管理左栏 200px 字典类型（含编辑 / 删除），条目表由 10 列 1420px 裁到 5 列 979（额外类型 / 额外值 / 颜色 / 创建与更新时间 进 `expandable` 行展开）

### 6.3 分析页不再用 Card 包筛选

筛选 Card 与列表页的无边框筛选段是两套观感，且控件多时会换行把「查询 / 重置」挤到第二行。改为页头筛选段（时间范围 + 主维度内联，粒度 / 对比 / 维度拆解走「筛选 ▾」）后与列表页同构；KPI 统一 `AnalyticsKpiCards`，图表仍是 `Card`。

## 7. 容器选择的取舍

同一个「新建 / 编辑表单」曾同时存在 Modal 与 Drawer 两种容器（宽度 500/520/560/600/720 与 `footer={null}` 混用）。统一为：

- **AdminFormModal**：字段 ≤ 6、无富文本 / 图片墙；宽度只取 `420 / 520 / 640`
- **AdminFormDrawer**：含富文本 / 图片墙 / 需要纵向空间的编辑器（如新闻正文），或字段多到弹窗内滚动不便；宽度 `640 / 760 / 60%`（判据是纵向空间与重编辑器，而非单纯字段数——AI 厂商配置 6 个短字段 + 可滚动的模型列表留在 `wide 640` 弹窗内）
  - 历史上的 `full: "40%"` 名不副实——1440 视口下 40% = 576px 反而窄于 `base 640`，已修正为 `60%`（约 864px），否则 rich text 表单被挤在两列宽度里
- 两者都以 `formId` 触发内部表单提交、固定 `destroyOnHidden`（编辑类组件在 `display:none` 容器中挂载会拿到 0 尺寸）、表单不再手写 `mt-4`（弹窗 body 自带 24px 内边距）

## 8. 通用态：排序与状态

`sort_order` 与 `is_published` 在数据库层由 `db/schema/columns.ts` 的 `sortable()` / `publishable()` 统一，UI 层与之对齐。

### 排序

| 场景 | 做法 | 承载物 |
|------|------|--------|
| 表头排序 | 列上 `...listQuery.sortProps("createdAt")`（`sorter: true` + 受控 `sortOrder`），由 `onTableChange` 转成查询参数 | `useListQuery().sortProps` |
| 排序权重（改值） | 失焦 / 回车提交，值未变不发请求（点分页也会触发 blur），走单字段 SFn + 审计 | `SortOrderCell` |

两者可并存：前者改查询参数，后者改行数据；改值后按新权重重排、行位置跳变是排序语义的必然结果。

### 状态

| 形态 | 组件 | 交互 |
|------|------|------|
| 布尔状态（上架 / 启用） | `PublishSwitchCell` | 切换即提交，乐观更新，失败回滚 |
| 多值枚举（只读） | `StatusTag` | 值 → 文案 + 语义色，未命中渲染 `—` |
| 多值枚举（字典驱动） | `DictTag` | 按 `dictSlug` 取 label / color，跟随字典管理 |
| 多值枚举（可就地切换） | antd `Select`（`variant="borderless"`）/ `Switch` | 同 `PublishSwitchCell`：值未变不提交、乐观更新 |

状态变更一律走单字段 SFn + `logCrud`；状态列不与操作列重复。

## 9. 图片列与时间列

- **图片列**放表最前（工具列之外的第一列），`ImageCell` 固定正方形 + `contain`，列宽 `size + 32`（默认 80），空值渲染 `—`
- **时间列**用 `valueType`（`dateTimeMinute` / `dateTime`），禁止各页手写 `dayjs().format`；列宽取 165 / 180（150 会把 `YYYY-MM-DD HH:mm` 折成两行）
- **可空列**用 `emptyText: "—"`：`null` / `undefined` / 空串由 ProTable 统一替换；非表格场景（行展开面板等）用 `formatDateTimeValue()`

## 10. 富文本高度

`@easyx/editor` 原生支持 `minHeight` / `maxHeight` / `height` / `resizable`；`@ucode/hub-ui-spa/editor` 的 `RichEditor` 默认 `minHeight 300` / `maxHeight 512`（内容超限内部滚动），使富文本在抽屉内不会顶出底部按钮。需要更大空间时用组件自带的拖拽手柄（`resizable`，默认开启）。
