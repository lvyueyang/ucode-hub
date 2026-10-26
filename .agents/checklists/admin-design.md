# 管理端设计规范验收清单

> 用途：新增或改造任何 `/admin` 页面（列表 / 表单 / 分析）后逐项自查。
> 规范本体见 [admin-design skill](../skills/admin-design/SKILL.md)，机制与依据见 [docs/admin-design.md](../../docs/admin-design.md)，规则见 [AGENTS.md](../../AGENTS.md)。
> 用法：逐条勾选，不适用的条目注明原因。

## 页头与布局

- [ ] 页面用 `AdminListPage`（列表）或 `AdminPageContent`（分析 / 看板）组织，无手写标题栏
- [ ] **没有独立筛选行**（`AdminTableToolbar` 已删除），筛选进 `filters`、操作进 `extra`
- [ ] 筛选控件左起紧贴标题（`gap-3`），未使用两端对齐
- [ ] 「查询 / 重置」紧邻筛选末尾，未分置页面两端
- [ ] 主操作（`type="primary"`）只有 1 个且位于操作段最后；次要操作 ≤2 个，其余进「更多」
- [ ] 标题段只有标题（超长省略、限宽 300px），页面说明以 Tooltip 悬停标题显示，未占用标题栏第二行
- [ ] 放不下的低频筛选收进「筛选 ▾」（`AdminFilters` 的 `more` + `moreCount`），未新增第二行
- [ ] `stats` 仅用于必须常驻的页面级工具；无多余包裹层与手写 `marginBottom` / `display:flex`

## 筛选落点

- [ ] 状态类筛选（上架 / 临时 / 未读 / 启用…）在**列头漏斗**（`filters` + `filterMultiple: false` + 受控 `filteredValue`），不在页头
- [ ] 关键词搜索用 `Input.Search`（内嵌查询图标），未外挂独立「搜索」按钮
- [ ] 分类筛选（取值 > 8）用页头 `Select`；时间范围用 `RangePicker` + `presets`
- [ ] 粒度 / 对比 / 维度拆解等低频项在「筛选 ▾」内
- [ ] 显式查询页（日志 / 埋点 / 分析）未点查询不发请求；即时筛选页 `onChange` 即查
- [ ] 日期快选未铺成第二行

## 表格列

- [ ] **`Σ列宽 ≤ 该表预算`**（参考视口 1600：全宽 1359 / 双栏 1157、1137）：1600 视口下 `.ant-table-content` 的 `scrollWidth === clientWidth`
- [ ] **每列都显式 `width`**（档位列引 `COLUMN_WIDTH.*`，其余按「最长文案宽 + 32」并注释依据），页面**未手写 `scroll.x`**（由 ProTable 推导）
- [ ] **恰好一列 `elastic: true`**，且按优先级取（操作列 → 长文本主列 → 首个可伸缩文本列 → 不设）；弹性列自身也声明了 `width`
- [ ] 页面未写 `tableLayout="auto"`（ProTable 固定 `fixed`），无 `minWidth`
- [ ] 开发期控制台无「列宽预算」告警；列定义在 `-mods/xxxColumns.ts` 的表已登记进 `column-budget.test.ts` 的 CASES
- [ ] 按 `docs/admin-design.md` §5.4 的脚本复测：内容溢出（扫**全部行**）与横向溢出均为 0
- [ ] 所有可长文本列都带 `ellipsis`（避免单元格外溢顶出横向滚动条）
- [ ] 图片 / 封面列在表最前且用 `ImageCell`（宽 80）
- [ ] 时间列用 `valueType: "dateTimeMinute"`（或 `"dateTime"`），宽 165 / 180，可空列带 `emptyText: "—"`；无手写 `dayjs().format`
- [ ] 字节列用 `formatBytes`
- [ ] 排序列用 `...list.sortProps("字段名")`，字段名在服务层白名单内
- [ ] 双栏页面用 `AdminSplitPanel`（左栏宽度取档位 180 / 200，间距 20），左栏未套 `Card`，右表预算按右栏实宽算
- [ ] 双栏左栏与右表同色系（灰底标题行 + 白底内容 + `border-border` 外框），两栏等高
- [ ] 左栏列表项：选中态用「主色竖条 + `bg-primary-bg`」且不引起位移；行内操作默认弱化、悬停提亮
- [ ] 双栏左栏未承载主操作（新建入口在页头），依赖选中项的次级操作在页头且未选中时置灰；未选中时右栏有空态
- [ ] 详情性长文本（路径 / 哈希 / 更新时间等）已进 `expandable` 行展开或详情容器，未硬塞进列
- [ ] 状态列按形态选组件（`PublishSwitchCell` / `StatusTag` / `DictTag` / `Select`），内联编辑列未加 `ellipsis` / `copyable`

## 操作列

- [ ] 用 `TableOperate` 包裹，按钮统一「图标 + 文字」，项数 ≤4（5 项全平铺须已裁掉低价值列腾宽），低频项进 `TableOperate.More`
- [ ] 操作列宽度用 `actionsWidth("编辑", "删除")` 按文案实算（1 项 100 / 2 项 170 / 3 项 240 / 含四字 270 / 4 项 320），未写死数字
- [ ] 默认 `elastic: true`（余宽归操作列）；若弹性让给了长文本主列，操作列保持 `fixed: "right"` + 实测宽
- [ ] `fixed: "right"` 仅在无横向滚动（`Σ ≤ 预算`）时使用
- [ ] `TableOperate.Delete` 的 `onConfirm` 交调用方 `sfnUnwrap`，无本地 `message.error` 吞错
- [ ] 无权限操作用 `disabled` + `disabledReason`（未隐藏按钮）
- [ ] 上下架 / 排序等通用态未重复出现在操作列

## 弹窗与抽屉

- [ ] 新建 / 编辑用 `AdminFormModal`（字段 ≤6 且无富文本 / 图片墙）或 `AdminFormDrawer`（否则），未手写 `Modal` / `Drawer`
- [ ] 宽度只取档位（Modal 420/520/640；Drawer 640/760/60%），未写任意数值
- [ ] 底部主按钮经 `formId` 触发提交（或走 `onOk`），提交期 `loading` / `confirmLoading`
- [ ] 容器 `destroyOnHidden`；表单初值由调用方在打开时装配
- [ ] 表单未手写 `className="mt-4"` 之类弹层内边距
- [ ] 危险操作确认：行内 `Popconfirm` / 页面级 `Modal.confirm`
- [ ] 无 `create.tsx` / `$id/edit.tsx` 路由页

## 表单

- [ ] `layout="vertical"`；必填与校验规则齐全
- [ ] 控件按选型表（`Input` / `Select` / `DictSelect` / `Switch` / `Segmented` / `DatePicker` / `FileUpload`·`ImageUpload` / `RichEditor` / `PermissionSelector`）
- [ ] 服务端错误交 `callSfn` / `sfnUnwrap`，未在表单内 `try/catch + message.error`
- [ ] 富文本 / 图片墙高度不溢出弹层（无双层滚动、不顶出底部按钮）

## 查询状态与服务端

- [ ] 用 `useListQuery`，首屏数据来自路由 loader，`fetcher` 用 `useCallback` 且依赖为空
- [ ] ProTable 只接 `loading` / `onChange={list.onTableChange}` / `pagination={list.pagination}`，**没有** `pagination.onChange`
- [ ] 无 `useEffect` 自动拉取；增删改 / 内联更新后 `list.reload()`
- [ ] 列头筛选经 `mapColumnFilters` 接入；翻页不会被列筛选重置回第 1 页
- [ ] 列表 schema 以 `listSchema` 为基座，`pageSize` 全链路透传，排序在白名单内
- [ ] 单字段变更各配独立 SFn + `logCrud` 审计

## 反馈与状态

- [ ] `message` / `modal` / `notification` 从 `@ucode/hub-ui-spa/antd-static` 导入
- [ ] 空态中文占位；加载态位置正确（表格 `loading` / 按钮 `loading` / 页面 `Spin`）
- [ ] 分析页筛选进页头（无 `Card` 包筛选区），KPI 用 `AnalyticsKpiCards`

## 兜底

- [ ] 本仓库 `pnpm check` 通过（类型检查 + Biome），相关单测通过
- [ ] 相关单测通过；新增 schema / 服务函数有覆盖
- [ ] 手工冒烟：翻页、每页条数、排序、列头筛选、内联编辑、弹窗 / 抽屉新建编辑、权限置灰
- [ ] 实测无横向滚动（1440×900 下 `.ant-table-content` 无溢出）
