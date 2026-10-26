# 组件检查清单

> 新增或修改 UI 组件时逐项检查。规则来源：AGENTS.md「组件约定」与「视觉风格与主题约定」。

## 组件库选型

- [ ] 管理端（`/admin/*`）用 antd，不混用 shadcn 同类组件
- [ ] 前台 SSR 用 shadcn/ui，不混用 antd 同类组件
- [ ] 公共组件归属正确（两端共用偏向前台 shadcn/ui）

## 视觉风格

- [ ] 圆角归零（仅圆形元素如头像/徽章/红点可用 `rounded-full`）
- [ ] 颜色走语义令牌类（`primary` / `foreground` / `border` 等），无硬编码色值
- [ ] 两端共用 `@custom-variant dark` 暗色变体，颜色暗色自适应
- [ ] antd `colorPrimary` 与 CSS `--s-primary` 同色双写

## 表格操作列

- [ ] 操作列用 `TableOperate` 容器组件包裹（`@ucode/hub-ui-spa/table`）
- [ ] 标准操作子组件：`TableOperate.Edit` / `TableOperate.Delete` / `TableOperate.Link` / `TableOperate.Custom`
- [ ] 操作按钮统一「图标 + 文字」风格
- [ ] `TableOperate.Delete` 内置 Popconfirm + 错误处理，确认文案 `"确定删除{recordName}？"`

## 静态函数导入

- [ ] `message` / `modal` / `notification` 从 `@ucode/hub-ui-spa/antd-static` 导入
- [ ] 禁止静态导入 antd（会脱离 StyleProvider layer 与 ConfigProvider 上下文）

## 错误通知

- [ ] 管理端用 antd `message.error/success`
- [ ] 前台用 sonner `toast.error/success`
- [ ] loader/beforeLoad 失败走 `errorComponent`，不调用 DOM API
