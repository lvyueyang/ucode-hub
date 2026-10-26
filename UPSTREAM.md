# 上游同步记录

hub 由上游基座 `easyx-dev/fsdx` 裁切而来，是它的**下游衍生项目**——hub 自己只做中继
（方案见 UCode 仓库的 [plans/hub.md](https://github.com/lvyueyang/ucode/blob/main/plans/hub.md)），上游的基建改动按下面的映射吸收。

## 上游

| 项 | 值 |
|----|----|
| 仓库 | https://github.com/easyx-dev/fsdx |
| remote 名 | `upstream`（首次同步前 `git remote add upstream <仓库地址>`） |
| 基线分支 | `main` |
| 基线 commit | `cb8e7734d0fae1a1f9613acd0a821a62dd7a45b8`（2026-10-15） |
| 导入时间 | 2026-10-17 |

## 目录映射

| 上游 | 本仓 |
|------|------|
| `app/` | `app/` |
| `packages/lib/` | `packages/lib/` |
| `packages/ui-spa/` | `packages/ui-spa/` |
| `packages/ui-ssr/` | `packages/ui-ssr/` |
| 根编排脚本（dev / build / test / check …） | `package.json`（`pnpm --filter @ucode/hub …` 转发）+ `check` |
| `README.md` / `docs/` / `.agents/` | 同名路径（均在本仓库根） |
| `.gitlab-ci.yml`、部署子模块 | 不在本仓；本仓 CI 见 `.github/workflows/check.yml`，部署见 `deploy/` |

## 命名映射

| 上游 | 本仓 |
|------|------|
| `@fsdx/web` | `@ucode/hub` |
| `@fsdx/lib` | `@ucode/hub-lib` |
| `@fsdx/ui-spa` | `@ucode/hub-ui-spa` |
| `@fsdx/ui-ssr` | `@ucode/hub-ui-ssr` |
| 包名前缀 `@fsdx/*` | `@ucode/hub-*` |
| 容器 `fsdx-app` / `fsdx-db` | `hub-app` / `hub-db` |
| 部署目录 `/opt/fsdx-web` | `/opt/hub` |
| Cookie `admin_token` / `client_token` | `hub_admin_token` / `hub_client_token`（`hub/app/src/constants/cookie-names.ts`） |

## 刻意偏离

- **不用 deploy 子模块**：上游把生产部署放在 `fsdx-deploy` 独立仓库并作为子模块挂载；hub 把内容内联为仓内普通目录
  `deploy/`，同步部署脚本时按仓内路径核对，不要引回子模块。
- **工具链自带一份**：hub 是独立仓库，lint 由本仓库根的 `biome.json` 管辖、TypeScript 版本由本仓库
  `pnpm-workspace.yaml` 的 `catalog` 统一（各包一律 `"catalog:"`）；这两份配置与 UCode 仓库里的**刻意保持一致**
  （改一处规则时两边一起改），但各是各的文件，不存在继承关系。
- **依赖版本走本仓 catalog**：跨包共用的依赖一律 `"catalog:"`，不照搬上游包内的版本号。
- **Cookie 名带项目前缀**：见上表命名映射（同域下多套系统共存时靠前缀区分登录态）。
- **测试脚本显式 `NODE_ENV=test`**：本机 / 生产 shell 常见 `NODE_ENV=production`，会让 react 走 production 构建、
  `@testing-library` 的 `act` 失效，故写死在 `app/package.json` 的 `test` 脚本里。
- **删除上游的示例业务**：上游自带的 `news`（表 / 服务 / 前台页 / 管理页 / 权限码 / 菜单与文案）与 `/admin/demo`
  示例页（含 AI 富文本演示）已从 hub 删除，上游对这两块的改动不吸收也不回灌。
- **生成文件不进 lint**：`routeTree.gen.ts`（TanStack Router 生成）由根 `biome.json` 排除。
- **镜像构建上下文是本仓库根**：`docker build -t hub .`。

## 同步方式

1. 在 hub 内执行 `/import-upstream`：读本文件的基线与映射 → 取上游 CHANGELOG 自基线起的 `[infra]` 条目
   （`feat(infra)` / `fix(infra)` scope 仅作辅助）+ 代码 diff 佐证 → 按
   [.agents/skills/upstream-sync/SKILL.md](./.agents/skills/upstream-sync/SKILL.md) 的判定准则筛出基建候选；
2. 移植前先看上面的**命名映射**与**刻意偏离**：命名面按表翻译（`@fsdx/*` → `@ucode/hub-*`、Cookie 保持
   `hub_*` 前缀、容器名与部署路径按上表），上游写死的部署结构与工具链配置不要照搬；
3. 逐个移植后跑本仓库的 `pnpm check`（Biome + 全部包 typecheck 与测试）；
4. 更新本文件的**基线**与同步历史。

> 业务层（具体业务表、业务路由与业务权限码）不吸收也不回灌；基建 / 业务的判定准则见
> [.agents/skills/upstream-sync/SKILL.md](./.agents/skills/upstream-sync/SKILL.md)。

## 同步历史

| 日期 | 基线 | 内容 |
|------|------|------|
| 2026-10-17 | `cb8e7734d0fae1a1f9613acd0a821a62dd7a45b8` | 首次导入：以 fsdx `main` 为基线裁切为 `hub/`（`app/` + 三个 `packages/*` + 文档与 `.agents/`），做命名面替换（`fsdx` → `hub`、`@fsdx/*` → `@ucode/hub*`），并入 UCode 仓库的 pnpm workspace 与工具链，部署内容内联为 `hub/deploy/` |
| 2026-10-26 | 同基线 | 从 UCode 仓库独立成单独仓库：原 `hub/` 的内容成为本仓库根（`app/` + `packages/*`），自带 `pnpm-workspace.yaml` 与锁文件、`biome.json`、CI，部署内容在 `deploy/`；UCode 侧改为 submodule 挂载，并按 `packages/hub-protocol` 各留一份协议副本 |
