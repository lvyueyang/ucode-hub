# 内置资产下发

内置资产（技能正文、提示词命令）可以随产品发版，也可以由运营侧从中继下发更新。本页是中继侧的接口与存放约定；
**下发方向是 UCode 主动出站拉取**，中继不发起连接——中继不可达只是「拿不到更新」，不影响 UCode 启动与装配。
UCode 侧的比对 / 校验 / 物化流程与生效边界见 UCode 仓库的 [`plans/hub.md`](https://github.com/lvyueyang/ucode/blob/main/plans/hub.md) 的「内置资产云同步」。

## 存放布局

```
{STORAGE_DIR}/builtin/
├── manifest.json            # 索引：登记了哪些 id、哪些版本、逐文件 sha256
├── <id>/<version>/...       # 内容目录，原样发布、原样下发
└── <id>/<version>/...
```

- **没有数据库表**：索引就是 `manifest.json` 这一份文件，发布即改它。清单按文件 mtime 缓存，
  改完不需要重启中继（下一请求读到新 mtime 即失效重读）。
- 发布与下发都只认普通文件，**符号链接一律拒绝**（会指到资产目录之外）。
- `id` / `version` 同时是目录名与 URL 段，只接受字母数字开头、其余为字母数字与 `._-` 的取值；
  `.` / `..` / 含 `/` 的取值直接被拒，路径穿越没有入口。

## 清单结构

`GET /builtin/manifest` 的响应体就是这份文件：

```jsonc
{
  "version": 1,
  "updatedAt": "2026-05-01T08:00:00.000Z",   // 空字符串表示还没发布过任何资产
  "assets": [
    {
      "id": "plugin-create",
      "kind": "skill",                        // skill / prompt / 其它自定义类型
      "version": "0.2.0",
      "executable": false,                    // 是否含可执行内容（见下）
      "path": "/builtin/assets/plugin-create/0.2.0",  // 相对中继根的下载路径，不给绝对地址
      "size": 18432,                          // 全部文件字节数之和
      "files": [
        { "path": "SKILL.md", "sha256": "<64 位十六进制>", "size": 18432 }
      ]
    }
  ]
}
```

`path` 是**相对路径**而不是绝对地址：清单不该决定「去哪台机器取内容」，否则清单被换掉就等于把下发指向别处。
UCode 侧同样只接受配置里的中继域，不跟随清单给出的任意外链。

## 接口

两个接口都在中继根下（不在 `/api/v1` 里），都要求设备身份：

| 方法与路径 | 说明 | 失败 |
| --- | --- | --- |
| `GET /builtin/manifest` | 上面那份清单 | 未登记设备 → `401 { "error": "设备令牌无效或已吊销" }` |
| `GET /builtin/assets/<id>/<version>` | 该版本的内容包（JSON） | 未登记设备 → `401` 同上；未登记的 id / 版本或非法路径段 → `404 { "error": "资产不存在" }` |

- **鉴权**：`Authorization: Bearer <deviceToken>`，与隧道共用同一套设备令牌（`device.token_hash` 比对），
  只放行未软删除且 `status = active` 的设备。**不新造凭证**：设备在后台登记 / 轮换令牌即可。
- 两个响应都带 `cache-control: no-store`：资产内容是内容寻址的，但清单随发布而变，缓存清单会拿到旧版本。
- 内容包是**边读盘边编码的 JSON 流**（`{ id, kind, version, executable, files: [...] }`），
  逐文件给 `path` / `sha256` / `size` / `encoding` / `content`：可打印文本按 `utf8` 原样给，
  其余按 `base64`——技能正文占绝大多数，整包 base64 会白涨三分之一体积。
- 内容包里的 `sha256` 与清单里的登记值同源；UCode 侧**以清单为准**逐文件校验，不信任内容包自报的哈希。

## 发布

```
pnpm -F @ucode/hub builtin:publish -- --id plugin-create --version 0.2.0 --dir ./skills/plugin-create
pnpm -F @ucode/hub builtin:publish -- --id review --kind prompt --version 0.2.0 --dir ./prompts/review
```

- `--kind` 默认 `skill`；`--kind prompt` 用于单文件提示词命令。
- **`--kind prompt` 的目录里必须有一个与 id 同名的文件**（`<id>.md`）：UCode 侧把它写成
  `$APP_HOME/app/builtin/prompts/<id>.md`，换成别的文件名（或多文件）会被拒给并保留上一版。
- 脚本只读 `STORAGE_DIR`（发布内容与清单都写在它下面），**不需要数据库**。
- 同一 `id` + 版本重复发布即**覆盖**（先清空旧目录，避免上一版删掉的文件残留在下发内容里）；
  同一 id 的其他版本保留着——旧版本可能还有设备在用。
- 发布是运营侧动作，与中继进程无关：内容进了 `STORAGE_DIR` 就立刻可被拉取。

## 可执行内容为什么不自动生效

`executable` 由发布脚本逐文件判定：命中 `plugin.json` / `hooks.json` / `hooks/` / `bin/` / `extensions/` /
`.mcp.json` / `mcp.json`，或文件带可执行位、以 shebang 开头，整个资产即标记为含可执行内容。

**标记不等于生效**：UCode 侧对 `executable: true` 的资产只落盘、不激活，并记一条
「已下载但未生效（含可执行内容，需显式信任）」的诊断。理由与第三方插件一致——
命令式钩子、`bin/`、MCP 服务器与 TS 扩展都是以用户权限执行的代码，**来源是运营方并不构成信任依据**；
签名 + 显式信任是后续加固项（见 [`plans/hub.md`](https://github.com/lvyueyang/ucode/blob/main/plans/hub.md) 的「待定」）。
v1 只让纯文本与声明式内容（技能正文、提示词）直接生效。
