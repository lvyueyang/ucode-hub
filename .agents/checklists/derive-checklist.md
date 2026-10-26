# 派生项目检查清单

> 基于 hub 派生新项目（更名）时逐项检查。规则来源：derive-project skill + AGENTS「上游与协同进化」。

## 命名面

- [ ] A 包名面：`hub/package.json` 与各包 `package.json` name 已替换，`@ucode/hub-*` → `@{包名前缀}*`，锁文件已再生
- [ ] B 运行标识面：`cookie-names.ts` 集中常量已改（`COOKIE_NAMES.ADMIN_TOKEN` / `CLIENT_TOKEN`），`.env` / `.env.example` 库名已改
- [ ] C 部署面：容器名、镜像名、CI 配置已替换
- [ ] D 品牌面：品牌色、主题名、favicon/logo、版权已替换；站点名待初始化时配置
- [ ] F 文档面：README 标题/描述已替换（已中性化的占位无需改）

## 代码验证

- [ ] 全仓旧项目名残留仅剩历史文档（archive/changelog）与上游引用
- [ ] `pnpm install` 成功且锁文件无 `@ucode/hub` 残留（除历史引用）
- [ ] 本仓库 `pnpm check` 通过
- [ ] `pnpm --filter "./hub/**" test` 通过
- [ ] `pnpm dev` 启动，登录/退出流程 Cookie 名为新常量值

## 同步基线

- [ ] `UPSTREAM.md` 已创建：上游仓库、配置映射完整
- [ ] 配置映射覆盖：Cookie 名、库名、e2e 库名/邮箱、包名
