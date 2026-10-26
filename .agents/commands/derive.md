---
description: 派生新项目：以 hub 为上游创建衍生业务系统，按命名面清单完成项目更名并初始化 UPSTREAM.md
---
# /derive

> 以 hub 为上游派生新业务系统：完整更名 + 初始化上游同步基线。

## 适用场景

- 基于本仓（hub）创建新的衍生项目
- 需要执行项目更名（包名 / 运行标识 / 部署 / 品牌 / 文档）

## 前置条件

- 已确认新项目名与命名决策（参照 [derive-project](../skills/derive-project/SKILL.md) 的前置准备表）
- 已复制本项目代码到新项目目录（或从 git 克隆）

## 执行步骤

1. 读 [derive-project](../skills/derive-project/SKILL.md)，完成「前置准备：填写命名决策表」；
2. 按命名面逐面执行（A 包名面 → B 运行标识面 → C 部署面 → D 品牌面 → E 数据面 → F 文档面）；
3. 在项目根目录创建 `UPSTREAM.md`（记录上游仓库 + 配置映射）；
4. 逐项跑 [derive-checklist](../checklists/derive-checklist.md) 验证；
5. `pnpm install` + 本仓库 `pnpm check`；
6. 启动 `pnpm dev` 验证登录 Cookie 为新常量值。

## 完成标准

- [ ] 旧项目名残留仅剩历史文档与上游引用
- [ ] 本仓库 `pnpm check` 通过
- [ ] `UPSTREAM.md` 已创建且配置映射完整
- [ ] 登录/退出流程验证 Cookie 名为新常量值

## 引用关联

- [derive-project](../skills/derive-project/SKILL.md)（更名全流程）
- [derive-checklist](../checklists/derive-checklist.md)（验证清单）
- [docs/project-ecosystem.md](../../docs/project-ecosystem.md)（背景模型）
