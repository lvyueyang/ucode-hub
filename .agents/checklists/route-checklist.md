# 路由检查清单

> 新增或修改路由时逐项检查。规则来源：AGENTS.md「路由」与「路由目录组织」。

## 页面结构

- [ ] 页面本体建成路由文件（有 URL / 进菜单 / 可深链分享 / 前进后退可达）
- [ ] 页面未塞进 `-mods/`
- [ ] 非路由 companion 全部放入 `-mods/`
- [ ] `-mods/` 不嵌套子目录（组件 >6 个时优先拆子路由）
- [ ] 单页 vs 子路由符合决策矩阵

## beforeLoad 守卫

- [ ] 管理端路由通过 Server Function（`getCurrentAdminSFn` 等）获取当前用户
- [ ] 前台路由按需走 `getCurrentClientSFn`
- [ ] loader/beforeLoad 失败配置了 `errorComponent`

## 目录组织

- [ ] `-mods/` 内逻辑文件用 `模块名.类型.ts` 命名
- [ ] 路由级组件用 PascalCase
- [ ] 路由目录不包含 `*.server.ts`（一律归 `services/`）
- [ ] `routeTree.gen.ts` 未被手改（由路由文件自动生成）

## 渲染策略

- [ ] 管理端 SPA 走 `_admin.tsx` 总布局，无需父布局 `<Outlet/>`
- [ ] 前台 SSR 页面正确处理水合
- [ ] 首页不目录化（`index/index.tsx` 会改变路径，保持 `index.tsx` 平级）
