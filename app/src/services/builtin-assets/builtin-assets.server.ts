/**
 * 内置资产：存放布局、清单读写与内容包的流式读取。
 *
 * 布局（`{STORAGE_DIR}/builtin/`）：`manifest.json` 是索引，`<id>/<version>/` 是内容目录。
 * 没有数据库表——发布就是把目录拷进来并登记哈希，清单按 mtime 缓存后按需读盘，
 * 因此运营侧新增资产后不需要重启服务（见 docs/builtin-assets.md）。
 *
 * 内容包按流返回：逐个文件读盘、逐个编码，响应体不进内存整包。
 */
import { isUtf8 } from "node:buffer";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import { env } from "#/env";
import { logger } from "#/shared-services/logger";

import { builtinManifestCache } from "./builtin-assets.cache";
import { builtinManifestSchema } from "./builtin-assets.schemas";
import type {
  BuiltinAssetBundle,
  BuiltinAssetFileEntry,
  BuiltinManifest,
  BuiltinManifestAsset,
} from "./builtin-assets.types";

/** 存储根下的目录名 */
export const BUILTIN_DIRNAME = "builtin";

/** 清单文件名（位于存储根下） */
export const BUILTIN_MANIFEST_FILENAME = "manifest.json";

/** 下载路径前缀（清单里的 `path` 与路由路径共用同一串） */
export const BUILTIN_ASSET_PATH_PREFIX = "/builtin/assets/";

/**
 * 可执行内容的路径判据：插件清单、命令式钩子、`bin/`、TS 扩展、MCP 配置。
 * 命中的资产照常发布与下发，但下发侧不会让它生效（见 UCode 仓库的 plans/hub.md「内置资产云同步」）。
 */
const EXECUTABLE_PATH_PATTERNS = [
  /(^|\/)plugin\.json$/,
  /(^|\/)hooks\.json$/,
  /(^|\/)hooks\//,
  /(^|\/)bin\//,
  /(^|\/)extensions\//,
  /(^|\/)\.mcp\.json$/,
  /(^|\/)mcp\.json$/,
];

/** 存储根：发布与读取共用；生产取 `env.storageDir`，测试与脚本可显式给 */
export const builtinAssetsRoot = (storageDir: string = env.storageDir): string =>
  join(storageDir, BUILTIN_DIRNAME);

/** 清单路径 */
export const builtinManifestPath = (root: string): string => join(root, BUILTIN_MANIFEST_FILENAME);

/** 某个资产的内容目录 */
export const builtinAssetDir = (root: string, id: string, version: string): string =>
  join(root, id, version);

/** 某个资产的下载路径（相对中继根） */
export const builtinAssetPath = (id: string, version: string): string =>
  `${BUILTIN_ASSET_PATH_PREFIX}${id}/${version}`;

/**
 * id 与版本号同时是 URL 段与目录名：只接受字母数字加 `._-`，且首字符必须是字母数字。
 * 因此 `.` / `..` 这类段名直接被拒，天然挡掉路径穿越；URL 里编码过的取值也过不了这一关。
 */
export const isSafeBuiltinSegment = (value: string | undefined): value is string =>
  typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);

/** 文件的 sha256（十六进制小写） */
const sha256Of = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

/**
 * 递归列目录下的普通文件，返回相对路径（posix 写法，按码位字典序）。
 * 符号链接一律拒绝：它会指到目录之外，发布时等于把外部内容带进资产目录。
 */
const listRegularFiles = (dir: string): string[] => {
  const files: string[] = [];

  const walk = (current: string, prefix: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error(`不支持符号链接：${path}`);
      if (entry.isDirectory()) {
        walk(join(current, entry.name), path);
        continue;
      }
      if (entry.isFile()) files.push(path);
    }
  };

  walk(dir, "");
  return files.sort();
};

/** 逐文件登记：路径、sha256、体积；按路径的码位字典序 */
export const computeBuiltinFileEntries = (dir: string): BuiltinAssetFileEntry[] =>
  listRegularFiles(dir).map((path) => {
    const full = join(dir, path);
    return { path, sha256: sha256Of(readFileSync(full)), size: statSync(full).size };
  });

/** 单个文件是否可执行内容：路径命中名单、带可执行位，或以 shebang 开头 */
const isExecutableFile = (full: string, relativePath: string): boolean => {
  if (EXECUTABLE_PATH_PATTERNS.some((pattern) => pattern.test(relativePath))) return true;
  if ((statSync(full).mode & 0o111) !== 0) return true;
  const head = readFileSync(full).subarray(0, 2);
  return head[0] === 0x23 && head[1] === 0x21;
};

/** 目录内是否含可执行内容（逐文件判定，命中即返回） */
export const detectExecutableContent = (dir: string): boolean =>
  listRegularFiles(dir).some((path) => isExecutableFile(join(dir, path), path));

/** 空清单：还没发布过任何资产时用它，读盘失败也回落到它 */
const emptyManifest = (): BuiltinManifest => ({ version: 1, updatedAt: "", assets: [] });

/**
 * 读清单：按 mtime 缓存，文件不存在或结构不合法都回落到空清单（前者是还没发布，后者记 warn）。
 * 读失败不让接口报错——运营侧看到的是「一个资产都没有」，而不是 500。
 */
export const readBuiltinManifest = (root: string = builtinAssetsRoot()): BuiltinManifest => {
  const path = builtinManifestPath(root);
  let mtimeMs: number;
  try {
    mtimeMs = statSync(path).mtimeMs;
  } catch {
    return emptyManifest();
  }

  const key = `${path}:${mtimeMs}`;
  const cached = builtinManifestCache.get(key);
  if (cached) return cached;

  let manifest: BuiltinManifest;
  try {
    const parsed = builtinManifestSchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
    if (parsed.success) {
      manifest = parsed.data;
    } else {
      logger.warn(
        { path, problems: parsed.error.issues.map((issue) => issue.message) },
        "内置资产清单结构不合法，按空清单处理",
      );
      manifest = emptyManifest();
    }
  } catch (error) {
    logger.warn(
      { path, error: error instanceof Error ? error.message : String(error) },
      "内置资产清单读取失败",
    );
    manifest = emptyManifest();
  }

  // 单条语义：旧 mtime 的条目不会再用到，留着只会积内存
  builtinManifestCache.clear();
  builtinManifestCache.set(key, manifest);
  return manifest;
};

/** 按 id + 版本取清单里的一项 */
export const findBuiltinAsset = (
  manifest: BuiltinManifest,
  id: string,
  version: string,
): BuiltinManifestAsset | null =>
  manifest.assets.find((asset) => asset.id === id && asset.version === version) ?? null;

/** 写清单（发布用）：写盘后刷新时间戳，缓存靠 mtime 自然失效 */
export const writeBuiltinManifest = (
  manifest: BuiltinManifest,
  root: string = builtinAssetsRoot(),
): string => {
  const path = builtinManifestPath(root);
  mkdirSync(root, { recursive: true });
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return path;
};

/**
 * 内容包响应体：先写头部，再逐文件读盘编码，最后收尾。
 * 文本原样给 utf8，其余走 base64——技能正文占绝大多数，走 base64 会白涨三分之一体积。
 */
export const createBuiltinBundleStream = (
  asset: BuiltinManifestAsset,
  dir: string,
): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  const header =
    `{"id":${JSON.stringify(asset.id)},"kind":${JSON.stringify(asset.kind)},` +
    `"version":${JSON.stringify(asset.version)},"executable":${asset.executable},"files":[`;

  let index = 0;
  let started = false;

  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (!started) {
        started = true;
        controller.enqueue(encoder.encode(header));
        return;
      }
      if (index >= asset.files.length) {
        controller.enqueue(encoder.encode("]}"));
        controller.close();
        return;
      }

      const entry = asset.files[index];
      index += 1;

      let bytes: Buffer;
      try {
        bytes = readFileSync(join(dir, entry.path));
      } catch (error) {
        // 清单与实际内容对不上（人工改过目录）：让响应体中断，而不是回一个残缺的 JSON 让下发侧存疑
        controller.error(
          new Error(
            `资产 ${asset.id}@${asset.version} 的内容缺失：${entry.path}（${
              error instanceof Error ? error.message : String(error)
            }）`,
          ),
        );
        return;
      }

      const text = isUtf8(bytes);
      const payload: BuiltinAssetBundle["files"][number] = {
        path: entry.path,
        sha256: entry.sha256,
        size: entry.size,
        encoding: text ? "utf8" : "base64",
        content: text ? bytes.toString("utf8") : bytes.toString("base64"),
      };
      controller.enqueue(encoder.encode(`${index > 1 ? "," : ""}${JSON.stringify(payload)}`));
    },
  });
};

/** 发布入参 */
export type PublishBuiltinAssetInput = {
  /** 要发布的本地目录（内容原样拷进存储） */
  sourceDir: string;
  /** 资产 id */
  id: string;
  /** 资产类型：`skill` / `prompt` / 其它自定义类型（只有前两种会在下发侧生效） */
  kind: string;
  /** 版本号 */
  version: string;
  /** 存储根，默认 `env.storageDir` */
  storageDir?: string;
};

/** 发布结果 */
export type PublishBuiltinAssetResult = {
  /** 登记进清单的资产（含逐文件哈希） */
  asset: BuiltinManifestAsset;
  /** 清单路径 */
  manifestPath: string;
  /** 本次发布覆盖的文件数 */
  fileCount: number;
};

/**
 * 发布一个目录：拷贝进 `{STORAGE_DIR}/builtin/<id>/<version>/`、算逐文件 sha256、写清单。
 * 同一 id + 版本重复发布即覆盖（内容寻址下这是唯一合理的语义）；非法 id / 版本 / 空目录一律抛错。
 */
export const publishBuiltinAsset = (input: PublishBuiltinAssetInput): PublishBuiltinAssetResult => {
  if (!isSafeBuiltinSegment(input.id)) throw new Error(`资产 id 非法：${input.id}`);
  if (!isSafeBuiltinSegment(input.version)) throw new Error(`版本号非法：${input.version}`);
  if (!input.kind.trim()) throw new Error("资产类型不能为空");
  if (!existsSync(input.sourceDir) || !statSync(input.sourceDir).isDirectory()) {
    throw new Error(`源目录不存在或不是目录：${input.sourceDir}`);
  }

  const root = builtinAssetsRoot(input.storageDir);
  const dest = builtinAssetDir(root, input.id, input.version);
  // 覆盖发布：先清掉旧内容，避免上一版删掉的文件留在目录里继续被下发
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });

  const relativePaths = listRegularFiles(input.sourceDir);
  if (relativePaths.length === 0) throw new Error(`源目录里没有文件：${input.sourceDir}`);
  for (const path of relativePaths) {
    const source = join(input.sourceDir, path);
    const target = join(dest, path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
    // copyFile 不一定带过权限位，`bin/` 这类资产靠它保住可执行位
    chmodSync(target, statSync(source).mode & 0o777);
  }

  const files = computeBuiltinFileEntries(dest);
  const asset: BuiltinManifestAsset = {
    id: input.id,
    kind: input.kind.trim(),
    version: input.version,
    executable: detectExecutableContent(dest),
    path: builtinAssetPath(input.id, input.version),
    size: files.reduce((total, file) => total + file.size, 0),
    files,
  };

  const previous = readBuiltinManifest(root);
  const manifest: BuiltinManifest = {
    version: 1,
    updatedAt: new Date().toISOString(),
    // 同一 id 的其他版本保留：下发侧按版本比对，旧版本还在被某些设备用着
    assets: [
      ...previous.assets.filter((item) => item.id !== asset.id || item.version !== asset.version),
      asset,
    ].sort((a, b) => a.id.localeCompare(b.id) || a.version.localeCompare(b.version)),
  };

  return { asset, manifestPath: writeBuiltinManifest(manifest, root), fileCount: files.length };
};
