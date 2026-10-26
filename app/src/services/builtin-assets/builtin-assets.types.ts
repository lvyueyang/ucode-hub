/**
 * 内置资产的接口契约结构：发布清单（磁盘索引）与内容包（接口响应体）。
 *
 * 字段口径见 docs/builtin-assets.md；两张结构都不含数据库表——索引就是清单文件本身。
 */

/** 清单里的单个文件登记项：路径相对资产根，哈希与体积用于下发侧逐文件校验 */
export type BuiltinAssetFileEntry = {
  /** 相对资产根的 posix 路径 */
  path: string;
  /** 文件内容的 sha256（十六进制小写） */
  sha256: string;
  /** 字节数 */
  size: number;
};

/** 清单里的一项资产 */
export type BuiltinManifestAsset = {
  /** 资产 id，也是存储目录名（如 `plugin-create`） */
  id: string;
  /** 资产类型：v1 只有 `skill`（技能目录）与 `prompt`（单文件提示词命令）可生效 */
  kind: string;
  /** 发布版本；下发侧按「id + 版本」比对，版本不同才重新拉 */
  version: string;
  /** 是否含可执行内容（插件清单 / hooks / bin / extensions / MCP 配置、可执行位或 shebang） */
  executable: boolean;
  /** 下载路径（相对中继根，如 `/builtin/assets/<id>/<version>`）；不给绝对地址，避免清单被换成外链 */
  path: string;
  /** 全部文件的字节数之和 */
  size: number;
  /** 逐文件登记，按路径字典序 */
  files: BuiltinAssetFileEntry[];
};

/** 发布清单：`{STORAGE_DIR}/builtin/manifest.json` 的全部内容，也是 `GET /builtin/manifest` 的响应体 */
export type BuiltinManifest = {
  /** 清单结构版本；字段有破坏性变化时递增 */
  version: 1;
  /** 最近一次发布时刻（ISO）；空字符串表示还没发布过任何资产 */
  updatedAt: string;
  assets: BuiltinManifestAsset[];
};

/** 内容包里的单个文件：文本按 utf8 原样给，二进制走 base64 */
export type BuiltinAssetFilePayload = {
  path: string;
  sha256: string;
  size: number;
  encoding: "utf8" | "base64";
  content: string;
};

/** `GET /builtin/assets/<id>/<version>` 的响应体 */
export type BuiltinAssetBundle = {
  id: string;
  kind: string;
  version: string;
  executable: boolean;
  files: BuiltinAssetFilePayload[];
};
