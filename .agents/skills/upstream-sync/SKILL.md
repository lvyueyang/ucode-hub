---
name: upstream-sync
description: >
  上游基座（easyx-dev/fsdx）与下游衍生项目（hub，及其以后再派生的项目）双向同步的判定与移植准则。
  当需要把上游基建变更吸收到本仓（/import-upstream）、把本仓实践回灌上游（/backport），
  或判断某个改动属于「基建」还是「业务」时触发。
  上游基线与命名映射见 UPSTREAM.md，背景模型与命名面策略见 docs/project-ecosystem.md。
---

# 上游 ↔ 下游 双向同步

## 演进方向判定准则

所有同步操作的第一步是**分类**：判断一个改动属于「基建（可跨项目流通）」还是「业务（留在项目内）」。

**层次判定**：
- 基建层：库包（上游 `@fsdx/lib` → 本仓 `@ucode/hub-lib`）、认证/RBAC/权限、缓存、埋点、审计、i18n、文件存储、日志、错误处理、部署/CI、UI 基础组件、测试基础设施、文档体系、命名面收敛改造；
- 业务层：业务示例模块（上游基座的 `news` 与 `/admin/demo`，本工程已删）、具体业务表/字段、具体业务路由；其余（dict / files · file-explorer / messages / config / translations / track / operation-logs / ai-providers 等）均为基建能力（AI 富文本 `@easyx/ai-rich-editor` 与图片处理 `@easyx/image-toolkit` 已抽离为独立 npm 包）。

**性质判定**（命中任一「是」即为基建）：
1. 脱离本项目的业务示例是否依然成立？
2. 是否不依赖任何具体业务表/字段/路由？
3. 是否对所有衍生系统都有价值？
4. 是否仅为缺陷修复且不引入业务语义？

**反例排除**（以下情况不回灌 / 不吸收）：
- 需要联动业务示例一起改（已耦合业务）；
- 只对该衍生项目有意义；
- 依赖下游独有依赖（技术栈不一致）。

## 变更可发现性（CHANGELOG `[infra]`）

- 上游基建变更一律记入 CHANGELOG 的 `Infrastructure` / `Fix` 分类，条目加 `[infra]` 前缀，描述注明「可被衍生项目吸收」的影响面；
- commit 约定 `feat(infra)` / `fix(infra)` scope（仅辅助，不作为唯一事实）；
- **候选吸收清单** = 上游 CHANGELOG 自基线起的 `[infra]` 条目，经判定准则复核，代码 diff 兜底佐证。

## 基线管理（UPSTREAM.md）

每个衍生项目根目录维护 `UPSTREAM.md`，记录上游仓库、上次吸收的 commit、配置映射表（Cookie 名/库名/包名等）、同步历史。

**基线失效处理**：衍生项目可能重写/删除 git 历史，导致基线 commit 失效。此时回退到**代码事实对比**：
1. `git rev-parse` 校验记录的基线 commit 仍存在；
2. 失效则依据 CHANGELOG 自记录日期起的 `[infra]` 条目 + 关键基建文件 diff 判定吸收范围；
3. 更新基线时同时记录 commit sha 与日期双保险。

## 下游吸收上游（`/import-upstream`，在 hub 内执行）

1. 读 [`UPSTREAM.md`](../../../UPSTREAM.md)：确认基线 + 命名映射 + 刻意偏离；
2. `git fetch upstream`，取基线后的差异；
3. 用判定准则分类 → 筛出基建候选（CHANGELOG `[infra]` + diff 佐证）；
4. 按命名映射表应用：**B 面**——Cookie 名保持 `hub_*` 前缀（集中常量）、e2e 库名/账号改 env 值，A/C/D/F 面清单替换翻译（见 derive-project skill）；
5. 逐个移植 → 本仓库 `pnpm check`（含全部包 typecheck 与测试）；
6. 更新 `UPSTREAM.md` 基线 + 同步历史。

## 上游吸收下游（`/backport`，在 hub 处于上游位置时执行）

hub 当前没有下游；若以后派生，在本仓执行：

1. 收集候选：用户主动提出，或定期 review 下游仓库的变更；
2. 用判定准则判断是否值得回灌；
3. **净化三步**：
   - 去业务化：移除仅对下游有意义的业务代码/字段/路由；
   - 去命名化：把下游特有命名翻译回 hub 的命名面（Cookie 名 → `hub_admin_token`/`hub_client_token`、包名 → `@ucode/hub-*`、库名 → `app_web`）；
   - 通用化：对齐 hub 既有技术栈、分层约定（core/services/routes 归属、SFn 规范、UI 选型）；
4. 移植 → 本仓库 `pnpm check`；
5. 记入本仓 CHANGELOG（`[infra]` 标记）。

## 常见场景

| 场景 | 处理 |
|------|------|
| 上游修复了一个认证缺陷 | 基建 → hub 应吸收（`/import-upstream`） |
| 上游抽离了一个通用工具函数 | 基建 → 吸收并归入 `@ucode/hub-lib` |
| 下游新增业务表/业务页面 | 业务 → 不回灌 |
| 上游新增业务示例模块（如上游自带的 news） | 业务 → 下游不吸收（本工程已删除示例业务） |
| 下游调整了品牌色/站点名 | 品牌 → 不回灌（上游基座保持默认品牌） |

> 详细背景见 [docs/project-ecosystem.md](../../../docs/project-ecosystem.md)；上游基线与命名映射见 [UPSTREAM.md](../../../UPSTREAM.md)；更名流程见 [derive-project](../derive-project/SKILL.md)；验证见 [upstream-sync-checklist](../../checklists/upstream-sync-checklist.md)。
