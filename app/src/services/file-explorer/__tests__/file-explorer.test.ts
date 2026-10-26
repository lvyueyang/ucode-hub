/**
 * 资源管理器服务层测试
 * 核心测试：路径安全校验、写保护检查、目录操作
 */
import { mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// mock getConfig
const { mockGetConfig } = vi.hoisted(() => ({
  mockGetConfig: vi.fn(),
}));

vi.mock("#/shared-services/config/config.server", () => ({
  getConfig: mockGetConfig,
}));

import {
  buildBreadcrumb,
  createDirectory,
  createFileReadStream,
  deleteEntry,
  getDirectoryInfo,
  getFileInfo,
  getTextContent,
  isPathSafe,
  isWriteProtected,
  listDirectory,
  renameEntry,
  saveUploadedFile,
} from "#/services/file-explorer/file-explorer.server";

/** 为每个 describe 创建独立的临时存储目录 */
function createTestStorageDir(label: string): string {
  return join(tmpdir(), `fe-test-${label}-${Date.now()}`);
}

describe("isPathSafe", () => {
  let testDir: string;
  let canonicalDir: string;

  beforeAll(async () => {
    testDir = createTestStorageDir("isPathSafe");
    process.env.STORAGE_DIR = testDir;
    await mkdir(testDir, { recursive: true });
    canonicalDir = await realpath(testDir);
    await mkdir(join(testDir, "subdir"), { recursive: true });
    await writeFile(join(testDir, "test.txt"), "hello");
    await writeFile(join(testDir, "subdir/nested.txt"), "nested");
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("正常子路径应在存储目录范围内", async () => {
    const result = await isPathSafe("subdir");
    expect(result).toBe(join(canonicalDir, "subdir"));
  });

  it("空路径返回存储目录本身", async () => {
    const result = await isPathSafe("");
    expect(result).toBe(canonicalDir);
  });

  it("带多层目录的子路径", async () => {
    const result = await isPathSafe("subdir/nested.txt");
    expect(result).toBe(join(canonicalDir, "subdir/nested.txt"));
  });

  it(".. 路径逃逸应被拒绝", async () => {
    await expect(isPathSafe("../../../etc/passwd")).rejects.toThrow("禁止访问存储目录之外的文件");
  });

  it("/ 绝对路径逃逸应被拒绝", async () => {
    await expect(isPathSafe("/etc/passwd")).rejects.toThrow("禁止访问存储目录之外的文件");
  });
});

describe("isWriteProtected", () => {
  let testDir: string;
  let canonicalDir: string;

  beforeAll(async () => {
    testDir = createTestStorageDir("isWriteProtected");
    process.env.STORAGE_DIR = testDir;
    await mkdir(testDir, { recursive: true });
    await mkdir(join(testDir, "logs"), { recursive: true });
    await mkdir(join(testDir, "logs/2024"), { recursive: true });
    await mkdir(join(testDir, "uploads"), { recursive: true });
    await mkdir(join(testDir, "data"), { recursive: true });
    canonicalDir = await realpath(testDir);
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("STORAGE_DIR 根目录始终写保护", async () => {
    mockGetConfig.mockResolvedValue("");
    const result = await isWriteProtected(canonicalDir);
    expect(result).toBe(true);
  });

  it("logs 目录匹配写保护列表", async () => {
    mockGetConfig.mockResolvedValue(JSON.stringify(["logs"]));
    const result = await isWriteProtected(join(canonicalDir, "logs"));
    expect(result).toBe(true);
  });

  it("logs 子目录也受保护", async () => {
    mockGetConfig.mockResolvedValue(JSON.stringify(["logs"]));
    const result = await isWriteProtected(join(canonicalDir, "logs/2024"));
    expect(result).toBe(true);
  });

  it("非保护目录不受限制", async () => {
    mockGetConfig.mockResolvedValue(JSON.stringify(["logs"]));
    const result = await isWriteProtected(join(canonicalDir, "data"));
    expect(result).toBe(false);
  });

  it("空配置时非根目录不受保护", async () => {
    mockGetConfig.mockResolvedValue("");
    const result = await isWriteProtected(join(canonicalDir, "data"));
    expect(result).toBe(false);
  });
});

describe("listDirectory", () => {
  let testDir: string;

  beforeAll(async () => {
    testDir = createTestStorageDir("listDirectory");
    process.env.STORAGE_DIR = testDir;
    await mkdir(testDir, { recursive: true });
    await mkdir(join(testDir, "dir-a"), { recursive: true });
    await mkdir(join(testDir, "dir-b"), { recursive: true });
    await writeFile(join(testDir, "file-1.txt"), "content1");
    await writeFile(join(testDir, "file-2.txt"), "content22");
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("列出根目录内容，目录优先排序", async () => {
    const result = await listDirectory("");
    expect(result.total).toBe(4);
    expect(result.entries[0].type).toBe("directory");
    expect(result.entries[1].type).toBe("directory");
    expect(result.entries[2].type).toBe("file");
    expect(result.entries[3].type).toBe("file");
  });

  it("文件条目包含正确的 size", async () => {
    const result = await listDirectory("");
    const file1 = result.entries.find((e) => e.name === "file-1.txt");
    expect(file1).toBeDefined();
    expect(file1!.size).toBe(8);
    expect(file1!.type).toBe("file");
  });
});

describe("buildBreadcrumb", () => {
  it("空路径只有 root", async () => {
    const result = await buildBreadcrumb("");
    expect(result).toEqual([{ label: "root", path: "" }]);
  });

  it("单层路径", async () => {
    const result = await buildBreadcrumb("logs");
    expect(result).toEqual([
      { label: "root", path: "" },
      { label: "logs", path: "logs" },
    ]);
  });

  it("多层路径", async () => {
    const result = await buildBreadcrumb("uploads/2024/01");
    expect(result).toEqual([
      { label: "root", path: "" },
      { label: "uploads", path: "uploads" },
      { label: "2024", path: "uploads/2024" },
      { label: "01", path: "uploads/2024/01" },
    ]);
  });
});

describe("getDirectoryInfo", () => {
  let testDir: string;

  beforeAll(async () => {
    testDir = createTestStorageDir("getDirectoryInfo");
    process.env.STORAGE_DIR = testDir;
    await mkdir(testDir, { recursive: true });
    await mkdir(join(testDir, "sub"), { recursive: true });
    await writeFile(join(testDir, "a.txt"), "hello");
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  beforeEach(() => vi.clearAllMocks());

  it("返回目录内容、面包屑与写保护状态", async () => {
    mockGetConfig.mockResolvedValue("");

    const result = await getDirectoryInfo("sub");

    expect(result.total).toBe(0);
    expect(result.currentPath).toBe("sub");
    expect(result.breadcrumb).toEqual([
      { label: "root", path: "" },
      { label: "sub", path: "sub" },
    ]);
    expect(result.writeProtected).toBe(false);
  });

  it("写保护目录时标记 writeProtected 为 true", async () => {
    mockGetConfig.mockResolvedValue(JSON.stringify(["sub"]));

    const result = await getDirectoryInfo("sub");

    expect(result.writeProtected).toBe(true);
  });
});

describe("getTextContent", () => {
  let testDir: string;

  beforeAll(async () => {
    testDir = createTestStorageDir("getTextContent");
    process.env.STORAGE_DIR = testDir;
    await mkdir(testDir, { recursive: true });
    await writeFile(join(testDir, "doc.txt"), "文本内容");
    await mkdir(join(testDir, "folder"), { recursive: true });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("读取文本文件内容", async () => {
    const content = await getTextContent("doc.txt");
    expect(content).toBe("文本内容");
  });

  it("目标是目录时抛错", async () => {
    await expect(getTextContent("folder")).rejects.toThrow("目标不是文件");
  });
});

describe("getFileInfo", () => {
  let testDir: string;

  beforeAll(async () => {
    testDir = createTestStorageDir("getFileInfo");
    process.env.STORAGE_DIR = testDir;
    await mkdir(testDir, { recursive: true });
    await writeFile(join(testDir, "pic.png"), "0123456789");
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("返回文件名、大小与修改时间", async () => {
    const info = await getFileInfo("pic.png");

    expect(info.name).toBe("pic.png");
    expect(info.size).toBe(10);
    expect(info.mtime).toBeTruthy();
  });
});

describe("createFileReadStream", () => {
  let testDir: string;

  beforeAll(async () => {
    testDir = createTestStorageDir("createFileReadStream");
    process.env.STORAGE_DIR = testDir;
    await mkdir(testDir, { recursive: true });
    await writeFile(join(testDir, "data.bin"), "stream-content");
    await mkdir(join(testDir, "folder"), { recursive: true });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("为文件创建读取流并返回文件名", async () => {
    const { stream, name } = await createFileReadStream("data.bin");

    expect(name).toBe("data.bin");
    const chunks: Buffer[] = [];
    const result = await new Promise<Buffer>((resolve, reject) => {
      stream.on("data", (c: string | Buffer) => chunks.push(Buffer.from(c)));
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", reject);
    });
    expect(result.toString("utf-8")).toBe("stream-content");
  });

  it("目标是目录时抛错", async () => {
    await expect(createFileReadStream("folder")).rejects.toThrow("目标不是文件");
  });
});

describe("createDirectory", () => {
  let testDir: string;

  beforeAll(async () => {
    testDir = createTestStorageDir("createDirectory");
    process.env.STORAGE_DIR = testDir;
    await mkdir(testDir, { recursive: true });
    await mkdir(join(testDir, "workspace"), { recursive: true });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  beforeEach(() => vi.clearAllMocks());

  it("在非保护目录下创建子目录", async () => {
    mockGetConfig.mockResolvedValue("");

    await createDirectory("workspace", "new-dir");

    const { stat } = await import("node:fs/promises");
    const info = await stat(join(testDir, "workspace/new-dir"));
    expect(info.isDirectory()).toBe(true);
  });

  it("写保护目录下创建子目录被拒绝", async () => {
    await mkdir(join(testDir, "locked"), { recursive: true });
    mockGetConfig.mockResolvedValue(JSON.stringify(["locked"]));

    await expect(createDirectory("locked", "sub")).rejects.toThrow("禁止创建子目录");
  });

  it("目录名含路径分隔符时被拒绝", async () => {
    mockGetConfig.mockResolvedValue("");

    await expect(createDirectory("workspace", "a/b")).rejects.toThrow("目录名不合法");
  });
});

describe("deleteEntry", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = createTestStorageDir("deleteEntry");
    process.env.STORAGE_DIR = testDir;
    await mkdir(testDir, { recursive: true });
    await writeFile(join(testDir, "del.txt"), "x");
    await mkdir(join(testDir, "empty-dir"), { recursive: true });
    await mkdir(join(testDir, "locked"), { recursive: true });
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("删除文件并返回类型", async () => {
    mockGetConfig.mockResolvedValue("");

    const result = await deleteEntry("del.txt");

    expect(result).toEqual({ deletedName: "del.txt", type: "file" });
  });

  it("删除空目录并返回类型", async () => {
    mockGetConfig.mockResolvedValue("");

    const result = await deleteEntry("empty-dir");

    expect(result).toEqual({ deletedName: "empty-dir", type: "directory" });
  });

  it("写保护路径删除被拒绝", async () => {
    mockGetConfig.mockResolvedValue(JSON.stringify(["locked"]));

    await expect(deleteEntry("locked")).rejects.toThrow("禁止删除");
  });
});

describe("renameEntry", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = createTestStorageDir("renameEntry");
    process.env.STORAGE_DIR = testDir;
    await mkdir(testDir, { recursive: true });
    await writeFile(join(testDir, "old.txt"), "x");
    await writeFile(join(testDir, "target.txt"), "y");
    await mkdir(join(testDir, "locked"), { recursive: true });
    await writeFile(join(testDir, "locked/l.txt"), "z");
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("重命名文件成功", async () => {
    mockGetConfig.mockResolvedValue("");

    const result = await renameEntry("old.txt", "new.txt");

    expect(result).toEqual({ oldName: "old.txt", newName: "new.txt" });
  });

  it("目标名称已存在时抛错", async () => {
    mockGetConfig.mockResolvedValue("");

    await expect(renameEntry("old.txt", "target.txt")).rejects.toThrow("目标名称");
  });

  it("写保护路径重命名被拒绝", async () => {
    mockGetConfig.mockResolvedValue(JSON.stringify(["locked"]));

    await expect(renameEntry("locked/l.txt", "x.txt")).rejects.toThrow("禁止重命名");
  });

  it("新名称含路径分隔符时被拒绝且不移动文件", async () => {
    mockGetConfig.mockResolvedValue("");

    await expect(renameEntry("old.txt", "../escaped.txt")).rejects.toThrow("新名称不合法");

    const { access } = await import("node:fs/promises");
    await expect(access(join(testDir, "old.txt"))).resolves.toBeUndefined();
  });

  it("新名称为上级目录引用时被拒绝", async () => {
    mockGetConfig.mockResolvedValue("");

    await expect(renameEntry("old.txt", "..")).rejects.toThrow("新名称不合法");
  });

  it("新名称为空时被拒绝", async () => {
    mockGetConfig.mockResolvedValue("");

    await expect(renameEntry("old.txt", "")).rejects.toThrow("新名称不合法");
  });
});

describe("saveUploadedFile", () => {
  let testDir: string;

  beforeAll(async () => {
    testDir = createTestStorageDir("saveUploadedFile");
    process.env.STORAGE_DIR = testDir;
    await mkdir(testDir, { recursive: true });
    await mkdir(join(testDir, "workspace"), { recursive: true });
    await mkdir(join(testDir, "locked"), { recursive: true });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  beforeEach(() => vi.clearAllMocks());

  it("将内容写入非保护目录", async () => {
    mockGetConfig.mockResolvedValue("");

    await saveUploadedFile("workspace", "up.bin", Buffer.from("数据"));

    const { readFile } = await import("node:fs/promises");
    const content = await readFile(join(testDir, "workspace/up.bin"));
    expect(content.toString("utf-8")).toBe("数据");
  });

  it("写保护目录下上传被拒绝", async () => {
    mockGetConfig.mockResolvedValue(JSON.stringify(["locked"]));

    await expect(saveUploadedFile("locked", "up.bin", Buffer.from("x"))).rejects.toThrow(
      "禁止上传文件",
    );
  });

  it("文件名含逃逸路径时被拒绝且不落盘", async () => {
    mockGetConfig.mockResolvedValue("");

    await expect(
      saveUploadedFile("workspace", "../../escaped.bin", Buffer.from("x")),
    ).rejects.toThrow("文件名不合法");

    const { access } = await import("node:fs/promises");
    // 拒绝语义：不做 basename 收敛，文件不应以任何形式落到存储目录内
    await expect(access(join(testDir, "workspace/escaped.bin"))).rejects.toThrow("ENOENT");
  });

  it("文件名为上级目录引用时被拒绝", async () => {
    mockGetConfig.mockResolvedValue("");

    await expect(saveUploadedFile("workspace", "..", Buffer.from("x"))).rejects.toThrow(
      "文件名不合法",
    );
  });
});
