# hub

UCode 的中继服务：运营方在后台管理账号与设备，UCode 主动出站长连（WS 隧道）把公网请求回灌到本机服务，
后续还要承载模型端点与内置资产下发。每企业一套自建部署，不做多租户。方案见 UCode 仓库的
[plans/hub.md](https://github.com/lvyueyang/ucode/blob/main/plans/hub.md)。

本仓库是独立 git 仓库（UCode 侧以 submodule 挂在 `hub/`），自带 workspace 清单、锁文件与工具链，
克隆后在本仓库根 `pnpm install` 即可开发，不依赖 UCode 仓库。

## 目录结构

```
app/                  # @ucode/hub —— 应用包（TanStack Start + Nitro）：管理端 SPA + 客户端 SSR 前台
packages/lib/         # @ucode/hub-lib —— 纯可复用逻辑库（无 React、零全局态、不读 env/db）
packages/ui-spa/      # @ucode/hub-ui-spa —— antd 管理端组件
packages/ui-ssr/      # @ucode/hub-ui-ssr —— shadcn 前台组件
deploy/               # 生产部署（compose、部署 / 备份脚本、运维手册），是仓内普通目录
docs/                 # 机制与设计文档
.agents/              # 规则、skills、commands、checklists
Dockerfile            # 生产镜像（构建上下文是本仓库根）
```

`package.json` 只是编排壳（不含依赖、不是工作区包）：脚本一律 `pnpm --filter @ucode/hub …` 转发给 `app/`，
依赖声明在各子包。工程本体是 `easyx-dev/fsdx` 基座的衍生项目，基线见 [UPSTREAM.md](./UPSTREAM.md)。

## 本地起一个

三步（第一条只需跑一次）：

```bash
# 1) 无需数据库服务：SQLite 库文件在首次启动时自动建（默认 ./data/data.db，目录会自动创建）

# 2) 配置：cp app/.env.example app/.env，填 DATABASE_URL（库文件路径）、JWT_SECRET 与 STORAGE_DIR。
#    （不想落文件也可以每次命令行传这三个变量：DATABASE_URL=… JWT_SECRET=… STORAGE_DIR=…）

# 3) 起服务
pnpm dev                # vite dev；浏览器用 http://localhost:3009（只监听 [::1]，127.0.0.1 会拒连）
#   或跑产物：pnpm build && pnpm start
```

首次访问 `http://localhost:3009/admin` 会跳到 `/admin/init` 初始化超管账号（**唯一超管、自助**），
其余运营账号由超管在后台创建；客户端账号可从前台 `/register` 注册。

客户端账号在前台 **`/devices`「我的设备」**里点某台在线设备的「打开」，就经隧道直接进入那台设备上的
UCode（地址是 `/d/<设备 id>/`，与 hub 同源，不另外依赖域名解析与证书）。前提是那台设备跑的是
**含 `<base href>` 改写的 UCode 版本**（旧构建产物里没有这行，页面资源会落到 hub 自己的路径上）。

停：`pnpm db:hub:down`（数据留在命名卷里，加 `-v` 才会连数据一起删）。

## 命令

在本仓库根执行。UCode 仓库根也留了转发命令（`pnpm dev:hub` / `pnpm build:hub` / `pnpm start:hub` /
`pnpm db:hub:up` / `pnpm db:hub:down`），那几条会切到 submodule 目录再跑；本仓库需先 `pnpm install`。

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 开发服务器（vite dev，**只监听 IPv6 的 `[::1]:3009`**，浏览器用 `http://localhost:3009`；`127.0.0.1` 会拒绝连接） |
| `pnpm build` | 生产构建到 `app/.output` |
| `pnpm start` | 跑构建产物（需先 `build`；在 `app/` 下运行，迁移目录相对 cwd 解析） |
| `pnpm check` | Biome + 各包 `tsc --noEmit` + 各包测试（CI 跑的就是这条） |
| `pnpm test`（app 内） | app 的 Vitest 测试 |
| `pnpm e2e` | Playwright 端到端测试（需先 `pnpm --filter @ucode/hub exec playwright install chromium`） |
| `pnpm db:generate` / `pnpm db:migrate` / `pnpm db:pull` / `pnpm db:studio` | 迁移流程 |

镜像构建的上下文是本仓库根：`docker build -t hub .`。

## 文档

| 文档 | 说明 |
|------|------|
| [architecture-overview](docs/architecture-overview.md) | 分层架构、数据流、路由体系 |
| [auth-permission-model](docs/auth-permission-model.md) | 双用户体系、RBAC、JWT、中间件链路 |
| [database-design](docs/database-design.md) | 表清单、ER 图、列命名约定、约束汇总 |
| [cache-system](docs/cache-system.md) | MemoryCache 设计与生命周期 |
| [event-tracking](docs/event-tracking.md) | 事件埋点的采集与查询 |
| [i18n](docs/i18n.md) | 两层翻译模型与写路径 |
| [admin-design](docs/admin-design.md) | 管理端界面规范 |
| [deployment-ops](docs/deployment-ops.md) | 部署、迁移、备份与恢复 |
| [spike](docs/spike.md) | 单进程承载数据面的验证（隧道与 ingress 的边界） |
| [tunnel](docs/tunnel.md) | 隧道与 ingress（协议、端点、镜像来源头、部署要点） |
| [builtin-assets](docs/builtin-assets.md) | 内置资产下发（存放布局、清单、两个接口、发布脚本、可执行内容的生效边界） |
| [model-endpoint](docs/model-endpoint.md) | 模型端点与用量（端点、鉴权、上游解析、流式与 token 口径、限制） |
| [documentation-architecture](docs/documentation-architecture.md) | 文档角色、事实 SSOT 与维护规则 |
| [project-ecosystem](docs/project-ecosystem.md) | 与上游基座的关系与同步方式 |

规则本体在 [AGENTS.md](./AGENTS.md)，上游基线与偏离在 [UPSTREAM.md](./UPSTREAM.md)。

## 与 UCode 的关系

hub 只做中继：UCode 主动出站建连，hub 把公网请求回灌到 UCode 服务层（同一套 `/api/v1` + 事件流），
只多一个来源标记；因此经 hub 到达 UCode 的请求等同本机 owner 身份，hub 的入口鉴权是唯一门。
协议边界、设备域与落地阶段见 UCode 仓库的
[plans/hub.md](https://github.com/lvyueyang/ucode/blob/main/plans/hub.md)。

## 上游

hub 是 `easyx-dev/fsdx` 基座的衍生项目，目录映射、命名映射、刻意偏离与同步方式记在
[UPSTREAM.md](./UPSTREAM.md)，吸收上游基建改动走 `/import-upstream`。
