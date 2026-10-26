# 单进程承载数据面的验证（阶段 2）

> 结论：**4/4 项通过**（2026-10-20，跑在生产产物 `app/.output` 上）。隧道与 ingress 可以在
> 与 admin 同一个进程、同一个端口上实现，**管道走 Nitro server route**（`app/server/**`），
> 不经过 TanStack 的路由匹配与请求体处理。

## 为什么先验证

方案定的形态是**单进程**：admin、隧道 WS、ingress 同端口。风险不在业务代码，而在框架的默认行为——
TanStack Start / Nitro 是 SSR 框架，它接管请求的方式（路由匹配、请求体解析、响应压缩、超时）
可能挡住管道要的原始语义：

- 大请求体（附件上传）必须**边收边转**，不能整包读进内存；
- 事件流（SSE）必须**首帧即到**，不能被缓冲到整条响应结束；
- WS 升级与普通 HTTP、以及按 Host 路由的 ingress 要在同一个端口上共存；
- 客户端断开时服务端必须**能看到取消**，否则在飞的请求会永远挂着。

四项任一不过，就按方案的回退预案把管道拆成独立进程。

## 怎么跑

前置：Docker（或本机 PostgreSQL）、Node 24。

```bash
# 1) 临时 PostgreSQL（端口错开生产与 dev）
docker compose -f .tmp/hub-spike/compose.yml up -d --wait     # 模板见下

# 2) 构建产物
pnpm -F @ucode/hub build

# 3) 用 HUB_SPIKE=1 起产物（必须在 app 下起：迁移目录相对 cwd 解析）
cd app
HUB_SPIKE=1 PORT=3199 \
DATABASE_URL=postgresql://hub:hub@127.0.0.1:15432/hub \
JWT_SECRET=<至少 32 字符> STORAGE_DIR=<数据目录> \
node .output/server/index.mjs

# 4) 跑驱动（另一个终端）
HUB_SPIKE_BASE=http://127.0.0.1:3199 pnpm -F @ucode/hub spike
```

`HUB_SPIKE=1` 没开时，验证路由与中间件一律 404，不会在生产环境暴露。

## 验证内容与判定标准

验证代码在 `app/server/**`（Nitro 扫描的 `routes` / `middleware`），驱动在
`app/scripts/spike/run.ts`。四条标准与实测：

| 实验 | 判定标准 | 实测（2026-10-20） |
| --- | --- | --- |
| ① 大请求体流式 | 200MB 流式上传，收到字节数一致、**首块 < 200ms**、首块时 RSS 增涨 < 64MB | 200.0MB / 3469 块，首块 **1ms**，RSS 增涨 **0.1MB**，全程 70ms |
| ② SSE 逐帧下发 | `text/event-stream`、5 帧全部到达、**首帧 < 300ms**、帧间隔偏差 < 300ms | 首帧 **5ms**，到达时刻 `[5, 206, 408, 610, 811]`（期望 200ms 间隔） |
| ③ 同端口共存 | 普通 HTTP 路由 200；`Host: dev-1.spike.local` 的请求被 ingress 接住并回包；WS 升级成功且回声正确 | 三者同时成立：`/health` 200、ingress 返回 `{"device":"dev-1","via":"ingress"}`、WS 收到 `welcome` 并回声 `ping` |
| ④ 断开可观测 | 客户端中途断开后，服务端计数在 5s 内观察到取消 | 断开前 `sseClosed=1` → 断开后 `2` |

交付前用仓库里同一份代码重跑过一次，四项仍全绿（首块 1ms、首帧 2ms、同端口三者共存、断开可观测）。

## 结论（对阶段 4 的约束）

1. **管道落在 Nitro server route / middleware 上**：`app/server/routes/**`（隧道升级、ingress）与
   `app/server/middleware/**`（按 Host 认设备）——h3 给的 `getBodyStream` 是真正的流，
   `EventStream` 是真正的逐帧下发，都不需要绕过框架去碰裸 socket。
2. **入口要在 nitro 配置里声明**：`nitro({ serverDir: "server", features: { websocket: true } })`；
   不写 `serverDir` 时 Nitro 不扫描 `server/routes`（这是上游模板默认少的那一块）。
3. **ingress 用 Host 判定而不是路径前缀**：middleware 里按 Host 认出设备后直接回包，
   请求不进入 TanStack 路由；生产把 `.spike.local` 换成 `<deviceId>.<baseDomain>` 即可。
4. **响应头要显式声明不缓冲**：`cache-control: no-cache` 与 `x-accel-buffering: no`
   已经写在 SSE 路由里；反代侧对应 `proxy_buffering off`（部署文档已记）。
5. **回退预案不再需要**：既然单进程能承载，就不拆进程；但验证代码留着——阶段 4 用它做回归
   （把 `spike/*` 的处理器换成真正的隧道与 ingress 后，同一套驱动仍应全绿）。

## 验证代码的去向

`app/server/{routes,middleware}/spike/**` 与 `app/scripts/spike/run.ts` 是**验证脚手架**：
阶段 4 实现隧道与 ingress 时，把 `spike` 处理器替换为真正的数据面实现，驱动脚本改成对着真实
路径跑同样的四项断言（那时不再需要 `HUB_SPIKE` 开关）。

## 未覆盖

- **dev 形态**（`pnpm dev`，vite dev server）未单独验证：本次结论基于生产产物，
  它是交付形态；开发期按需再补。
- 反代层（nginx）的缓冲与超时设置未在本机验证：那是部署配置项，写进了部署文档。
- 并发压力、背压水位、多设备并存没有压测：阶段 4 实现多路复用时补。
