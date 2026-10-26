# @ucode/hub-ui-spa

antd 管理端组件库，面向数据密集型后台场景（表单、表格、上传、编辑器）。antd 为 peerDependency，宿主应用提供唯一实例。

## 定位与边界

| 项 | 约定 |
|----|------|
| 使用场景 | 管理端 `/admin/*` 页面 |
| antd 单实例 | antd 声明为 peerDependency，宿主提供唯一实例；`antd-static` 桥接必须在宿主 `<App>` 上下文内工作，双实例会导致 message/modal 脱离 ConfigProvider |
| 样式 | 直角风格（`borderRadius: 0`）、统一语义令牌（`--s-*`），同 AGENTS.md 视觉约定 |
| 依赖 | `@ucode/hub-lib`、`@monaco-editor/react`；peer：`antd` / `@ant-design/icons` / `@tanstack/react-router` / `dayjs` / `monaco-editor` / `@easyx/editor` |
| 测试 | 无独立测试脚本 |

## subpath 导出

| subpath | 内容 | 关键导出 |
|---------|------|----------|
| `@ucode/hub-ui-spa/antd-static` | antd 静态方法桥接 | `AntdStaticBridge`（挂载于宿主 `<App>` 内，从 `App.useApp()` 捕获实例）、`message` / `modal` / `notification`（未挂载即调用会抛错） |
| `@ucode/hub-ui-spa/table` | 表格 | `ProTable`（`ProColumnType` / `ProTableProps`，增强 antd Table，`valueType` 支持 `text` / `dateTime` / `dateTimeMinute`，`emptyText` 为空值提供占位内容，`formatDateTimeValue` 供行展开面板等非表格场景复用同一时间格式化，可继承页面骨架注入的表体高度）、`TableOperate`（操作列容器：`Edit` / `Delete` / `Link` / `More` / `Custom`，按钮统一「图标 + 文字」风格，支持 `disabledReason` 置灰说明，`More` 折叠低频操作以控制列宽）、`SortOrderCell` / `PublishSwitchCell`（单元格内联编辑，乐观更新 + 失败回滚）、`StatusTag`（状态语义色）、`ImageCell`（图片列固定正方形 + contain）、`TableHeightProvider` / `useTableBodyHeight` / `useTableHeight`（表体高度实测与注入）、**列宽**：`COLUMN_WIDTH`（列宽档位常量）+ `actionsWidth(...labels)`（操作列宽度按文案实算）+ `elastic: true`（弹性列标记，恰好一列，余宽归它）+ `applyColumnBudget`（推导 `scroll.x` = 各列宽度之和，并产出超预算 / 弹性列不唯一 / 缺 `width` 的开发期告警）+ `TableBudgetProvider` / `useTableBudget`（骨架按布局下发参考可用宽度，`budget={null}` 显式关闭校验）+ `enableColumnBudgetWarning`（宿主在 DEV 下开启告警，避免生产构建输出） |
| `@ucode/hub-ui-spa/clipboard` | 剪贴板 | `copyText(text, options?)`（基于 `@ucode/hub-lib/clipboard`，集成 antd message 提示，`successMsg` / `failMsg` / `successType` 可定制） |
| `@ucode/hub-ui-spa/upload` | 上传 | `FileUpload`（`UploadFileFn` / `UploadResult`，上传/文件库/下载回调注入）、`ImageUpload`、`PhotoWall`（`ImageItem`）、`SelectFileModal`（`FetchFiles` / `SelectableFile` / `acceptToMimePrefix` / `formatSize`（已废弃别名，指向 `@ucode/hub-lib/format-bytes` 的 `formatBytes`））、`renderUploadItem` |
| `@ucode/hub-ui-spa/editor` | 编辑器 | `CodeEditor`（Monaco）、`RichEditor`（`@easyx/editor` Tiptap 内核，经 `RichEditorMedia` 注入图片/视频/音频/附件上传 + 媒体库列表，`valueType` 对接 `EditorType`；高度可经 `minHeight` / `maxHeight` / `height` / `resizable` 覆盖，默认 300 / 512） |
| `@ucode/hub-ui-spa/permission-tags` | 权限展示 | `PermissionTags`（通配符优先排序、绿色标识、超 `maxVisible` 折叠，元信息由宿主传入 `PermissionMetaMap`） |
| `@ucode/hub-ui-spa/json-import-button` | JSON 导入 | `JsonImportButton`（弹窗 + 拖拽 + JSON 编辑器预览，`onImport` 回调） |
| `@ucode/hub-ui-spa/ms-input` | 时长输入 | `MSInput`（以 `"30s"` / `"10min"` / `"1d"` 展示、以毫秒值提交，`min` / `max` / `allowZero` 约束，复用 `@ucode/hub-lib/ms`） |

## 使用约束

1. **禁止静态 `import { message } from "antd"`**：antd 静态函数会创建独立 React root，脱离 `<StyleProvider layer>` 与 ConfigProvider 主题（暗色算法、品牌色不生效，且未分层样式会压制 `@layer`）。`message` / `modal` / `notification` 统一从 `@ucode/hub-ui-spa/antd-static` 导入。
2. **调用时机**：`AntdStaticBridge` 实例在 `<App>` 挂载后才捕获，调用必须发生在渲染完成后的交互/副作用（事件处理、useEffect）中；路由 loader / beforeLoad 等早于 App 挂载阶段调用会抛错（宁抛错不静默）。
3. **宿主集成**：上传与文件库组件不直接调 SFn，由宿主注入回调（如 `uploadFileSFn` / `getFileListSFn`）。

## 相关文档

- 纯逻辑底座：[@ucode/hub-lib](../lib/README.md)
- shadcn 前台组件库：[@ucode/hub-ui-ssr](../ui-ssr/README.md)
- 应用层架构、组件选型与视觉令牌约定：[docs/architecture-overview.md](../../docs/architecture-overview.md)、[AGENTS.md](../../AGENTS.md)
