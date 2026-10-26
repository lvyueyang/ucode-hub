# @ucode/hub-ui-ssr

shadcn 风格基础组件库，面向前台 SSR 展示型场景。无运行时样式，颜色完全由宿主应用通过 CSS 语义令牌注入。

## 定位与边界

| 项 | 约定 |
|----|------|
| 使用场景 | 前台（非 `/admin/*`）SSR 页面、两端共用组件 |
| 样式 | 组件只写 tailwind 类名，不引入样式文件；颜色 token（`--s-*` 语义令牌）由宿主 `global.css` 定义 |
| 编译 | 宿主 Tailwind 通过 `@source "../../packages/ui-ssr/src"` 扫描包源码类名 |
| 依赖 | `@ucode/hub-lib`（cn / match-permission 等）、`@radix-ui/react-slot`、`class-variance-authority`；react / react-dom 由宿主工作区提供 |

## subpath 导出

| subpath | 内容 | 关键导出 |
|---------|------|----------|
| `@ucode/hub-ui-ssr/ui` | shadcn 组件 | `Button`（`buttonVariants`）、`Card`（CardContent / CardHeader / CardTitle 等）、`Badge`（`badgeVariants`）、`Input`、`Textarea`、`Carousel`（embla 内核，含 `CarouselContent` / `CarouselItem` / `CarouselPrevious` / `CarouselNext` / `useCarousel` / `CarouselApi`，`autoplay` 间隔毫秒数，hover 暂停） |
| `@ucode/hub-ui-ssr/theme` | 主题切换 | `ThemeToggle`（三态：亮/暗/跟随系统）、`useThemeMode(preset)`（useSyncExternalStore，跨标签页/系统偏好联动）、`ThemeMode` / `ThemePreset` / `ThemeScheme` 类型 |
| `@ucode/hub-ui-ssr/form` | 表单辅助 | `AutofillBlocker`（阻止浏览器自动填充的诱饵输入）、`ImageCaptchaModal`（图片验证码弹窗，`getCaptcha` / `verify` 回调注入） |

## 主题机制约定

- 每个端对应一个 `ThemePreset`（明暗两档 `ThemeScheme`），`data-theme` 属性承载完整主题名，定义见 app 的 `app/src/theme/themes.ts`（单一事实来源）。
- `ThemeScheme` 的 `antdColorPrimary` / `themeColor` 须分别与 CSS `--s-primary` / `--s-surface` 同色（双写，见 use-theme-mode.ts 注释）。
- 两端共用暗色变体：`@custom-variant dark (&:is([data-theme$="-dark"] *))`。
- `ImageCaptchaModal` 通过回调注入 SFn 与错误/消息处理，包内不引入 sonner / lucide-react。

## 测试

`pnpm --filter @ucode/hub-ui-ssr test`。覆盖 theme-toggle 三态切换与 use-theme-mode 系统偏好联动、跨标签页同步。

## 相关文档

- 纯逻辑底座：[@ucode/hub-lib](../lib/README.md)
- antd 管理端组件库：[@ucode/hub-ui-spa](../ui-spa/README.md)
- 应用层架构与主题机制：[docs/architecture-overview.md](../../docs/architecture-overview.md)
