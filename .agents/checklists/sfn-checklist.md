# Server Function 检查清单

> 新增或修改 SFn 时逐项检查。规则来源：AGENTS.md「接口约定」+ [server-function](../skills/server-function/SKILL.md)。

## 命名与归属

- [ ] `createServerFn` 定义的函数以 `SFn` 为后缀
- [ ] `.server.ts` 中的辅助函数无 `SFn` 后缀
- [ ] `.functions.ts` 中无未被引用的 SFn（死代码）
- [ ] SFn 就近路由 `-mods/`（跨端共享 SFn 留 `services/`）

## 输入校验

- [ ] `validator` 使用 Zod schema（FormData 上传类允许裸函数类型守卫）
- [ ] 调用方通过 `{ data: ... }` 传参
- [ ] schema 归属正确：被服务层 `z.infer` 派生或跨端复用 → `*.schemas.ts`；纯路由局部 → 随 SFn

## 鉴权

- [ ] 有权限要求的 SFn 添加了 middleware
- [ ] 管理端用 `adminPermGuard(permission)` / `adminPermRouteGuard`
- [ ] 客户端用 `clientPermGuard(permission)` / `clientPermRouteGuard`
- [ ] 公开接口（登录、注册等）无 middleware
- [ ] 权限码常量引用 `src/permissions/`

## 分层边界

- [ ] 路由/组件不直接 import `.server.ts`
- [ ] `.server.ts` 不 import 任何 `.functions.ts`（RPC 边界只允许被调用方引用）
- [ ] `services/**` 不反向 import `routes/**`

## 错误处理

- [ ] handler 无静默返回 null
- [ ] 数据不存在时 throw Error
- [ ] 无空 catch 块
- [ ] 无重复错误日志（sfErrorLogger 已自动覆盖）

## 客户端调用（统一 helper）

- [ ] 事件回调 / 提交 / 删除 / 副作用中的 SFn 调用经 `#/utils/sfn-error` 的 `sfnUnwrap` / `callSfn` 包裹
- [ ] 未在本地 `message.error` / `toast.error` 重复展示 SFn 错误
- [ ] 有意静默用 `{ silent: true }`，而非裸 `catch {}`
- [ ] `loader` / `beforeLoad` 例外：保持裸调，错误交 `errorComponent`
- [ ] 登录 / 注册 / 初始化等 `{ success, message }` 业务分支保持原样
- [ ] 服务端在错误消息末尾追加 `（类型：…；请求号：…；SFn：方法名）` 元信息后缀（类型经 `classifyError` + 鉴权错误类判定；请求号始终携带，SFn 方法名仅非生产环境携带）；客户端组装为「可读标题 + 详情弹窗」，错误边界展示前剥离后缀；生产环境仅保留请求号，SFn 方法名与原始信息不可见（按请求号查服务端日志）

## 操作日志

- [ ] 写操作（create/update/delete）用一行式 `logCrud(context.user, module, action, target)`
- [ ] `logCrud` 是 fire-and-forget（不阻塞主流程）
