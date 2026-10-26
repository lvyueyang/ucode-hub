# 上游同步检查清单

> 双向同步（/import-upstream 吸收上游、/backport 回灌上游）时逐项检查。规则来源：upstream-sync skill + AGENTS「上游与协同进化」。

## 判定

- [ ] 候选改动经层次判定（基建层 / 业务层）
- [ ] 性质判定 4 问全过或命中「是」（脱离业务示例成立 / 不依赖业务表 / 对所有衍生系统有价值 / 纯缺陷修复）
- [ ] 已排除反例（耦合业务示例 / 仅下游有意义 / 依赖下游独有依赖）

## 移植（吸收方向 /import-upstream）

- [ ] 基线已确认（commit + 日期），失效时已走代码事实回退
- [ ] 候选来自 CHANGELOG `[infra]` 条目 + 代码 diff 佐证
- [ ] 按 [`UPSTREAM.md`](../../UPSTREAM.md) 的命名映射翻译（Cookie 名保持 `hub_*` 前缀、`@fsdx/*` → `@ucode/hub-*`、容器名与部署路径按表），刻意偏离未被推翻
- [ ] 业务示例相关条目已跳过并记录原因

## 移植（回灌方向 /backport）

- [ ] 净化三步完成：去业务化 → 去命名化 → 通用化
- [ ] 命名已翻译回 hub 的命名面（Cookie 名 `hub_admin_token`/`hub_client_token`、库名 `app_web`、包名 `@ucode/hub-*`）
- [ ] 对齐 hub 的分层与 SFn/测试约定

## 验证与记录

- [ ] 本仓库 `pnpm check` 通过（含全部包 typecheck 与测试）
- [ ] `pnpm --filter "./hub/**" test` 通过
- [ ] 基线已更新（commit + 日期），同步历史记录了吸收/跳过内容
- [ ] CHANGELOG 已记录（`[infra]` 标记 + 影响面）
