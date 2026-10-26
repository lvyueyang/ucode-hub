# 项目定位与衍生项目协同进化

> 定位：平台机制类 · 人类阅读 + AI 执行参考
> 单一事实来源：本文件为「衍生协同」机制的 owner；命名面与基线等事实指向 [UPSTREAM.md](../UPSTREAM.md) 与代码（标注以代码为准）
> 引用关系：← 被 [.agents/guide.md](../.agents/guide.md) 导航；→ 引用 [UPSTREAM.md](../UPSTREAM.md)、`app/src/constants/cookie-names.ts`、`app/e2e/helpers/env.ts`
> 更新触发：上游基线变化、命名面收敛改造、同步协议迭代时

## 1. 项目定位

hub 是 **UCode 的中继服务**：运营方在后台管账号与设备，UCode 主动出站长连（WS 隧道）把公网请求回灌到本机服务（方案见 [plans/hub.md](https://github.com/lvyueyang/ucode/blob/main/plans/hub.md)）。工程本体来自上游基座 `easyx-dev/fsdx` 的裁切，因此 hub 在「衍生协同」关系里处于**下游（衍生项目）**，不再兼任基座模板：

- **上游**：`easyx-dev/fsdx`（全栈工程基座），其基建改动是 hub 的吸收来源；
- **本仓（hub）**：只做中继相关的改造，保留上游基建，上游自带的业务示例已删除（见 [UPSTREAM.md](./UPSTREAM.md) 的刻意偏离）；
- hub 若以后再派生自己的下游项目，本文的判定准则与命名面策略同样适用。

**协同进化的核心问题**：如何判断一个改动属于「基建（应跨项目流通）」还是「业务（留在项目内）」。判定准则见第 2 节。

## 2. 演进方向判定准则

所有同步操作（吸收 / 回灌）的第一步都是**分类**。两个维度：

### 2.1 层次判定

- **基建层**：`@ucode/hub-lib` 库、认证/RBAC/权限、缓存、埋点、审计、i18n、文件存储、日志、错误处理、部署/CI、UI 基础组件、测试基础设施、文档体系本身、命名面收敛化改造。
- **业务层**：具体业务模块、具体业务表/字段、具体业务路由、业务权限码、示例内容。注：dict / files · file-explorer / messages / config / translations / track / operation-logs / ai-providers 等均为基建能力，非业务示例；其中图片处理（`@easyx/image-toolkit`）已抽离为独立 npm 包，宿主侧接入代码属基建能力。

### 2.2 性质判定

命中任一「是」即为基建，可跨项目流通：

1. 脱离本项目的业务模块是否依然成立（把 dict 删掉它还能跑吗）？
2. 是否不依赖任何具体业务表/字段/路由？
3. 是否对所有衍生系统都有价值？
4. 是否仅为缺陷修复且不引入业务语义？

### 2.3 反例排除

以下情况**不**回灌 / 不吸收：

- 需要联动业务示例一起改（说明已耦合业务）；
- 只对该衍生项目有意义；
- 依赖下游独有依赖（技术栈不一致）。

## 3. 命名面收敛与更名映射

**总原则**：运行期标识中**随环境变化的才配置注入**（e2e 库名/账号），**随项目变化的用集中常量**（Cookie 名，与包名/主题名同等对待）；无法配置化的面保留清单替换机制。

| 面 | 内容 | 策略 | 事实落点 |
|----|------|------|---------|
| A 包名面 | workspace 包名 `@ucode/hub-*`、各 package.json、imports、pnpm-lock | 清单替换（全局替换 + `pnpm install` 再生锁文件） | 各 `package.json`、[UPSTREAM.md](../UPSTREAM.md) 命名映射（以代码为准） |
| B 运行标识面 | **Cookie 名**（`app/src/constants/cookie-names.ts` 集中常量，当前 `hub_admin_token` / `hub_client_token`）、**e2e 库名/账号邮箱**（env 注入） | Cookie 名集中常量（更名点）；e2e 配置 env 化 | `app/src/constants/cookie-names.ts`、`app/e2e/helpers/env.ts`、`app/e2e/helpers/db.ts` |
| C 部署面 | 容器名（`hub-app` / `hub-db`）、镜像名、部署目录（`/opt/hub/`）、CI 配置 | 清单替换（与交付方绑定） | `docker-compose.yml`、`deploy/docker-compose.yml`（以代码为准） |
| D 品牌面 | 站点名（系统配置，已收敛）、品牌色、主题名、favicon/logo、版权 | 站点名配置化；其余清单替换 | `src/theme/themes.ts` + global.css、系统配置 |
| E 数据面 | e2e 账号（随 B 收敛）、预置数据默认值 | 配置化 + 清单 | 以代码为准 |
| F 文档面 | README/docs 中的路径示例 | **中性化占位**（如 `/opt/{项目名}/`） | docs/（本文件为示例） |

> 更名与同步时的命名翻译，按面逐项执行。B 面 Cookie 名改集中常量、e2e 配置改 env 值，A/C/D/F 面走清单替换。

## 4. 变更可发现性（CHANGELOG `[infra]` 标记）

**主渠道：CHANGELOG.md**。由于衍生项目可能重写/删除 git 历史，不可依赖 git log 作为唯一事实：

- 凡属基建层的变更，CHANGELOG 条目加 `[infra]` 前缀（置于 `Infrastructure` / `Fix` 分类），描述注明「可被衍生项目吸收」的影响面；
- commit 约定 `feat(infra)` / `fix(infra)` scope（仅辅助）；
- **下游候选吸收清单** = 上游 CHANGELOG 自基线起的 `[infra]` 条目，经第 2 节准则复核，代码 diff 兜底佐证。

## 5. 基线管理（UPSTREAM.md）

每个衍生项目根目录维护 `UPSTREAM.md`，记录：

- 上游仓库地址与 remote 名；
- 上次吸收的上游 commit（历史重写则回退 CHANGELOG `[infra]` 条目 + 代码 diff 对比）；
- **配置映射表**：本项目 env/命名 ↔ 上游默认值（如 Cookie 名、库名、包名）；
- 同步历史：日期 / 吸收内容 / 跳过内容及原因。

模板仅在本文件第 7 节登记上下游关系，基线状态一律以本仓 [`UPSTREAM.md`](../UPSTREAM.md) 为准（避免单点维护）。

## 6. 同步流程

### 6.1 下游吸收上游（`/import-upstream`，在 hub 内执行）

1. 读 [`UPSTREAM.md`](../UPSTREAM.md)：基线 + 命名映射 + 刻意偏离；
2. `git fetch upstream`（remote 缺失先 `git remote add upstream <仓库地址>`），取基线后的差异；
3. 第 2 节准则分类 → 筛出基建候选（上游 CHANGELOG `[infra]` + 代码 diff 佐证）；
4. 按命名映射表应用：B 面——Cookie 名保持 `hub_*` 前缀（集中常量），e2e 库名/账号改 env 值；A/C/D/F 面清单替换翻译；
5. 逐个移植 → 本仓库 `pnpm check`（含 typecheck 与测试）；
6. 更新 `UPSTREAM.md` 基线 + 记录；需记发布历史时在本仓库 CHANGELOG 注明「吸收自上游 vX」。

### 6.2 上游吸收下游（`/backport`，在 hub 处于上游位置时执行）

hub 当前没有下游；若以后派生，在本仓执行：

1. 收集候选（用户主动提出 / 定期 review 下游仓库变更）；
2. 第 2 节准则判断是否值得回灌；
3. **净化三步**：去业务化（移除仅对下游有意义的业务代码）→ 去命名化（翻译回 hub 的命名面）→ 通用化（对齐既有技术栈/分层约定）；
4. 移植 → 本仓库 `pnpm check`；
5. 记入本仓库 CHANGELOG（`[infra]` 标记）。

## 7. 上下游登记

| 方向 | 项目 | 关系 |
|------|------|------|
| 上游 | `easyx-dev/fsdx` | hub 的工程基座来源；基线 commit、目录/命名映射与刻意偏离记在本仓 [`UPSTREAM.md`](../UPSTREAM.md) |
| 本仓 | hub | 上游的下游衍生项目；当前没有自己的下游 |

> 基线一律以本仓 `UPSTREAM.md` 为准，此处仅登记关系。

## 8. 相关资源

| 资源 | 说明 |
|------|------|
| [UPSTREAM.md](../UPSTREAM.md) | 上游基线、目录/命名映射、刻意偏离与同步历史（SSOT） |
| [AGENTS.md](../AGENTS.md)「上游与协同进化」 | 规则本体（命名面、`[infra]` 标记） |
| [.agents/skills/derive-project](../.agents/skills/derive-project/SKILL.md) | 派生新项目更名全流程 |
| [.agents/skills/upstream-sync](../.agents/skills/upstream-sync/SKILL.md) | 双向同步判定与移植准则 |
| [.agents/commands/derive.md](../.agents/commands/derive.md) | `/derive` 命令 |
| [.agents/commands/import-upstream.md](../.agents/commands/import-upstream.md) | `/import-upstream` 命令 |
| [.agents/commands/backport.md](../.agents/commands/backport.md) | `/backport` 命令 |
