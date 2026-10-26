/**
 * 资源管理器：服务端辅助函数
 * 浏览和管理 STORAGE_DIR 下的文件系统，含路径安全校验和写保护
 */
import { createReadStream } from "node:fs";
import {
  access,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  rmdir,
  stat,
  unlink,
} from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
import { env } from "#/env";
import { getConfig } from "#/shared-services/config/config.server";
import { logger } from "#/shared-services/logger";

/** 系统配置中存储写保护路径列表的 key */
const WRITE_PROTECTED_CONFIG_KEY = "file_explorer_write_protected_paths";

/** 单次文本预览最大字节数 */
const MAX_TEXT_PREVIEW_BYTES = 1024 * 1024;

/** 获取 STORAGE_DIR 的规范化绝对路径（包含符号链接解析） */
async function getStorageDir(): Promise<string> {
  const raw = resolve(env.storageDir);
  try {
    return await realpath(raw);
  } catch {
    return raw;
  }
}

/**
 * 路径安全校验
 * 将相对子路径解析为绝对路径，检查是否在 STORAGE_DIR 范围内，防止目录逃逸
 * 返回规范化的绝对路径
 */
export async function isPathSafe(subPath: string): Promise<string> {
  const storageDir = await getStorageDir();
  const resolved = resolve(storageDir, subPath);

  if (!resolved.startsWith(storageDir + sep) && resolved !== storageDir) {
    throw new Error("禁止访问存储目录之外的文件");
  }

  try {
    const real = await realpath(resolved);
    if (!real.startsWith(storageDir + sep) && real !== storageDir) {
      throw new Error("禁止通过符号链接访问存储目录之外的文件");
    }
    return real;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return resolved;
    }
    throw err;
  }
}

/**
 * 校验叶子名称（上传文件名 / 新名称 / 新目录名）
 * 拒绝空名称、`.` / `..` 与含路径分隔符的输入，避免拼接后逃逸出目标目录
 * 反斜杠在 POSIX 下本属合法字符，一并拒绝是为了拦截 Windows 风格的 `..\..\x`
 */
function assertSafeLeafName(name: string, label: string): string {
  if (!name || name === "." || name === ".." || /[\\/]/.test(name)) {
    throw new Error(`${label}不合法：不能为空，且不允许包含路径分隔符或上级目录引用`);
  }
  return name;
}

/**
 * 检查路径是否在写保护列表中
 * 匹配规则：路径前缀匹配受保护路径
 */
export async function isWriteProtected(absolutePath: string): Promise<boolean> {
  const storageDir = await getStorageDir();

  // 同样规范化输入路径，避免 macOS /tmp 符号链接导致的路径不一致
  let normalizedPath = absolutePath;
  try {
    normalizedPath = await realpath(absolutePath);
  } catch {
    // 路径不存在时保持原样
  }

  if (normalizedPath === storageDir) {
    return true;
  }

  const rawConfig = await getConfig(WRITE_PROTECTED_CONFIG_KEY);
  if (!rawConfig) return false;

  try {
    const protectedPaths: string[] = JSON.parse(rawConfig);
    const relativePath = normalizedPath.slice(storageDir.length).replace(/^\//, "");

    return protectedPaths.some(
      (p) =>
        relativePath === p || relativePath.startsWith(`${p}/`) || relativePath.startsWith(`${p}\\`),
    );
  } catch {
    logger.error({ rawConfig }, "解析写保护路径配置失败，默认拒绝写操作");
    return true;
  }
}

/** 条目类型 */
export type EntryType = "file" | "directory";

/** 文件系统条目 */
export interface FsEntry {
  name: string;
  type: EntryType;
  size: number;
  mtime: string;
}

/** 目录列表结果 */
export interface ListDirectoryResult {
  entries: FsEntry[];
  total: number;
  currentPath: string;
}

export async function listDirectory(subPath: string): Promise<ListDirectoryResult> {
  const absolutePath = await isPathSafe(subPath);

  const dirEntries = await readdir(absolutePath, { withFileTypes: true });

  const entries: FsEntry[] = [];

  for (const entry of dirEntries) {
    try {
      const entryPath = join(absolutePath, entry.name);
      const entryStat = await stat(entryPath);

      entries.push({
        name: entry.name,
        type: entry.isDirectory() ? "directory" : "file",
        size: entryStat.size,
        mtime: entryStat.mtime.toISOString(),
      });
    } catch (err) {
      logger.error(
        { path: join(absolutePath, entry.name), error: (err as Error).message },
        "读取条目信息失败",
      );
    }
  }

  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name, "zh");
  });

  return {
    entries,
    total: entries.length,
    currentPath: subPath || "/",
  };
}

/** 目录全量信息：内容列表 + 面包屑 + 写保护状态 */
export async function getDirectoryInfo(subPath: string): Promise<{
  entries: FsEntry[];
  total: number;
  currentPath: string;
  breadcrumb: { label: string; path: string }[];
  writeProtected: boolean;
}> {
  const [dirResult, breadcrumb] = await Promise.all([
    listDirectory(subPath),
    buildBreadcrumb(subPath),
  ]);

  const absolutePath = await isPathSafe(subPath);
  const protected_ = await isWriteProtected(absolutePath);

  return { ...dirResult, breadcrumb, writeProtected: protected_ };
}

/** 读取文本文件内容（限制 1MB） */
export async function getTextContent(subPath: string): Promise<string> {
  const absolutePath = await isPathSafe(subPath);

  const fileStat = await stat(absolutePath);
  if (!fileStat.isFile()) {
    throw new Error("目标不是文件");
  }

  if (fileStat.size > MAX_TEXT_PREVIEW_BYTES) {
    throw new Error("文件过大，无法预览（限制 1MB）");
  }

  return readFile(absolutePath, "utf-8");
}

export async function getFileInfo(subPath: string): Promise<{
  name: string;
  size: number;
  mtime: string;
}> {
  const absolutePath = await isPathSafe(subPath);
  const fileStat = await stat(absolutePath);

  return {
    name: basename(absolutePath),
    size: fileStat.size,
    mtime: fileStat.mtime.toISOString(),
  };
}

export async function createFileReadStream(subPath: string): Promise<{
  stream: ReturnType<typeof createReadStream>;
  name: string;
}> {
  const absolutePath = await isPathSafe(subPath);

  const fileStat = await stat(absolutePath);
  if (!fileStat.isFile()) {
    throw new Error("目标不是文件");
  }

  return {
    stream: createReadStream(absolutePath),
    name: basename(absolutePath),
  };
}

export async function createDirectory(subPath: string, dirName: string): Promise<void> {
  const parentPath = await isPathSafe(subPath);

  const safeName = assertSafeLeafName(dirName, "目录名");
  const safePath = await isPathSafe(join(subPath, safeName));

  const writeProtected = await isWriteProtected(parentPath);
  if (writeProtected) {
    throw new Error("当前目录处于写保护状态，禁止创建子目录");
  }

  await mkdir(safePath, { recursive: false });
}

/** 删除文件或空目录 */
export async function deleteEntry(
  subPath: string,
): Promise<{ deletedName: string; type: EntryType }> {
  const absolutePath = await isPathSafe(subPath);

  const writeProtected = await isWriteProtected(absolutePath);
  if (writeProtected) {
    throw new Error("该路径处于写保护状态，禁止删除");
  }

  const entryStat = await stat(absolutePath);
  const entryName = basename(absolutePath);

  if (entryStat.isDirectory()) {
    await rmdir(absolutePath);
    return { deletedName: entryName, type: "directory" };
  }

  await unlink(absolutePath);
  return { deletedName: entryName, type: "file" };
}

export async function renameEntry(
  subPath: string,
  newName: string,
): Promise<{ oldName: string; newName: string }> {
  const absolutePath = await isPathSafe(subPath);

  const writeProtected = await isWriteProtected(absolutePath);
  if (writeProtected) {
    throw new Error("该路径处于写保护状态，禁止重命名");
  }

  const safeName = assertSafeLeafName(newName, "新名称");
  // 拼到条目的真实父目录（absolutePath 已过 isPathSafe），保持「原地改名」语义且不跨目录
  const newPath = join(dirname(absolutePath), safeName);

  try {
    await access(newPath);
    throw new Error(`目标名称 "${safeName}" 已存在`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
  }

  const oldName = basename(absolutePath);
  await rename(absolutePath, newPath);

  return { oldName, newName: safeName };
}

/** 保存上传文件到指定目录 */
export async function saveUploadedFile(
  subPath: string,
  fileName: string,
  content: Buffer,
): Promise<void> {
  const dirPath = await isPathSafe(subPath);

  const writeProtected = await isWriteProtected(dirPath);
  if (writeProtected) {
    throw new Error("当前目录处于写保护状态，禁止上传文件");
  }

  const safeName = assertSafeLeafName(fileName, "文件名");
  const { writeFile } = await import("node:fs/promises");
  const filePath = await isPathSafe(join(subPath, safeName));
  await writeFile(filePath, content);
}

/**
 * 构建面包屑路径
 * 返回从根目录到当前路径的每一级信息
 */
export async function buildBreadcrumb(subPath: string): Promise<{ label: string; path: string }[]> {
  const breadcrumbs: { label: string; path: string }[] = [{ label: "root", path: "" }];

  if (!subPath) return breadcrumbs;

  const segments = subPath.split("/").filter(Boolean);
  let accumulated = "";

  for (const segment of segments) {
    accumulated = accumulated ? `${accumulated}/${segment}` : segment;
    breadcrumbs.push({ label: segment, path: accumulated });
  }

  return breadcrumbs;
}
