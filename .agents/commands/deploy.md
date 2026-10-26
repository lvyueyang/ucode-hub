---
description: 版本发布：联动 commit 流程提交业务变更、确定 hub 新版本号、按本仓库 CHANGELOG 记变更、打 v* tag（含 commit 摘要）、推送
---
# /deploy

依次执行以下步骤：

1. 执行 `git status --porcelain` 检查是否有未提交变更：
   - 若有未提交变更，执行 git-commit skill 流程：审查变更 → 按逻辑分组暂存 → 生成 Conventional Commits 中文提交信息 → 逐组提交
   - 若工作区干净，继续下一步
2. 确定 hub 的新版本号：
   - 读取 app/package.json（@ucode/hub）当前版本号，记为 `{当前版本}`
   - 检查是否存在对应 tag：`git rev-parse -q --verify refs/tags/v{当前版本}`
   - 若 tag 已存在（当前版本已发布过）：按本次变更性质决定新版本号——破坏性变更→MAJOR、新特性→MINOR、缺陷修复→PATCH，遵循 Semantic Versioning，然后更新 app/package.json 的 version 字段
   - 若 tag 不存在（当前版本尚未发布，如初始状态 `0.1.0`）：直接以当前版本作为新版本号，不改动 version 字段
3. 更新本仓库 `CHANGELOG.md`：
   - 把 `[未发布]` 里本次的条目整理好，结构与写法见该文件顶部
4. 生成 commit 摘要（新版本 tag 的 message 正文）：
   - 有上一个 tag 时：`git log --oneline $(git describe --tags --abbrev=0)..HEAD`
   - 无 tag（首次发布）时：`git log --oneline`（全量提交）
5. `git add app/package.json CHANGELOG.md && git commit -m "chore(release): hub v{新版本号}"`
6. 将第 4 步生成的 commit 摘要拼接到 tag message，执行 `git tag -a v{新版本号} -m "chore(release): hub v{新版本号}"$'\n\n'"{commit 摘要}"`
7. `git push && git push --tags`
