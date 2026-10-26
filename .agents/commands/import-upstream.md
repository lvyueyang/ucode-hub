---
description: 吸收上游：在本仓（hub）内拉取上游基座（easyx-dev/fsdx）的基建变更（CHANGELOG [infra] 条目），按 UPSTREAM.md 的命名映射翻译后移植并更新基线
---
# /import-upstream

> 在**本仓（hub）**内执行：吸收上游基座（`easyx-dev/fsdx`）的基建变更。

## 适用场景

- 上游发布了新版本，希望把基建改进/缺陷修复吸收到本仓
- 定期同步上游变更，避免基建落后

## 前置条件

- 当前目录为 hub（上游的下游衍生项目，非上游本身）
- [`UPSTREAM.md`](../../UPSTREAM.md) 已登记基线、命名映射与刻意偏离

## 执行步骤

1. 读 [`UPSTREAM.md`](../../UPSTREAM.md)：确认基线（commit + 日期）、命名映射与刻意偏离；
2. `git fetch upstream`（若 remote 缺失先 `git remote add upstream <仓库地址>`）；
3. 校验基线有效性：`git rev-parse upstream/基线commit`——失效（历史被重写）则回退**代码事实对比**（依据 [upstream-sync](../skills/upstream-sync/SKILL.md)「基线管理」）；
4. 取候选：上游 CHANGELOG 自基线起的 `[infra]` 条目 + 对应代码 diff；
5. 用判定准则（[upstream-sync](../skills/upstream-sync/SKILL.md)「演进方向判定准则」）筛出基建候选，跳过业务示例相关条目；
6. 逐个移植：按命名映射表翻译（Cookie 名保持 `hub_*` 前缀、`@fsdx/*` → `@ucode/hub-*`、容器名与部署路径按表）；刻意偏离（不用 deploy 子模块、工具链跟随本仓、依赖走 catalog）不要被上游写法推翻；
7. 本仓库 `pnpm check`（含各包 typecheck 与测试）+ `pnpm --filter "./hub/**" test`；
8. 更新 `UPSTREAM.md`：基线 commit、同步历史（吸收内容对应上游条目、跳过内容及原因）。

## 完成标准

- [ ] 基建候选全部移植或明确记录跳过原因
- [ ] 本仓库 `pnpm check` / `pnpm --filter "./hub/**" test` 通过
- [ ] `UPSTREAM.md` 基线已更新（commit + 日期）
- [ ] 如需发布历史，本仓 CHANGELOG 记录本次吸收来源

## 引用关联

- [upstream-sync](../skills/upstream-sync/SKILL.md)（判定准则 + 基线回退 + 移植）
- [upstream-sync-checklist](../checklists/upstream-sync-checklist.md)（验证清单）
- [docs/project-ecosystem.md](../../docs/project-ecosystem.md)（背景模型）
