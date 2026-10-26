/**
 * 内置资产模块测试：发布（逐文件哈希 / 可执行内容判定 / 覆盖语义）、清单读取（mtime 缓存与坏清单回落）、
 * 内容包的流式编码（文本 utf8、二进制 base64）、路径段校验与设备鉴权。
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const { mockFindDeviceByToken } = vi.hoisted(() => ({ mockFindDeviceByToken: vi.fn() }));
vi.mock("#/services/device/device.server", () => ({
  findDeviceByToken: mockFindDeviceByToken,
}));

import { authorizeBuiltinDevice } from "../builtin-assets.auth.server";
import {
  builtinAssetDir,
  builtinAssetPath,
  builtinAssetsRoot,
  builtinManifestPath,
  computeBuiltinFileEntries,
  createBuiltinBundleStream,
  detectExecutableContent,
  findBuiltinAsset,
  isSafeBuiltinSegment,
  publishBuiltinAsset,
  readBuiltinManifest,
  writeBuiltinManifest,
} from "../builtin-assets.server";
import type { BuiltinManifest } from "../builtin-assets.types";

const created: string[] = [];

/** 建一个临时存储根（模块内所有落盘都相对它） */
const makeStorageDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "hub-builtin-"));
  created.push(dir);
  return dir;
};

/** 建一个源目录并写入给定文件（键为相对路径，值为文本） */
const makeSourceDir = (files: Record<string, string>): string => {
  const dir = makeStorageDir();
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content, "utf8");
  }
  return dir;
};

/** 读完整个内容包流并解析成对象 */
const readBundle = async (
  asset: Parameters<typeof createBuiltinBundleStream>[0],
  dir: string,
): Promise<{ files: { path: string; encoding: string; content: string; sha256: string }[] }> => {
  const stream = createBuiltinBundleStream(asset, dir);
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(text) as {
    files: { path: string; encoding: string; content: string; sha256: string }[];
  };
};

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe("存储布局与路径段", () => {
  it("存储根、清单路径与下载路径按约定拼接", () => {
    expect(builtinAssetsRoot("/data")).toBe(join("/data", "builtin"));
    expect(builtinManifestPath("/data/builtin")).toBe(join("/data/builtin", "manifest.json"));
    expect(builtinAssetDir("/data/builtin", "demo", "1.0.0")).toBe(
      join("/data/builtin", "demo", "1.0.0"),
    );
    expect(builtinAssetPath("demo", "1.0.0")).toBe("/builtin/assets/demo/1.0.0");
  });

  it("路径段只接受字母数字开头加 ._-，路径穿越写法一律拒绝", () => {
    expect(isSafeBuiltinSegment("plugin-create")).toBe(true);
    expect(isSafeBuiltinSegment("1.0.0-beta.1")).toBe(true);
    expect(isSafeBuiltinSegment("..")).toBe(false);
    expect(isSafeBuiltinSegment(".")).toBe(false);
    expect(isSafeBuiltinSegment(".hidden")).toBe(false);
    expect(isSafeBuiltinSegment("a/b")).toBe(false);
    expect(isSafeBuiltinSegment("%2e%2e")).toBe(false);
    expect(isSafeBuiltinSegment("")).toBe(false);
    expect(isSafeBuiltinSegment(undefined)).toBe(false);
  });
});

describe("computeBuiltinFileEntries / detectExecutableContent", () => {
  it("逐文件算 sha256 与体积，并按路径字典序", () => {
    const dir = makeSourceDir({ "SKILL.md": "正文", "references/api.md": "参考" });
    const entries = computeBuiltinFileEntries(dir);

    expect(entries.map((entry) => entry.path)).toEqual(["SKILL.md", "references/api.md"]);
    expect(entries[0]?.size).toBe(Buffer.byteLength("正文"));
    expect(entries[0]?.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("纯文本技能不算可执行内容，hooks / bin / 可执行位 / shebang 都算", () => {
    expect(detectExecutableContent(makeSourceDir({ "SKILL.md": "# 技能" }))).toBe(false);
    expect(detectExecutableContent(makeSourceDir({ "hooks/hooks.json": "{}" }))).toBe(true);
    expect(detectExecutableContent(makeSourceDir({ "bin/tool": "#!/bin/sh\n" }))).toBe(true);
    expect(detectExecutableContent(makeSourceDir({ "extensions/main.ts": "export {}" }))).toBe(
      true,
    );
    expect(detectExecutableContent(makeSourceDir({ "plugin.json": "{}" }))).toBe(true);
    expect(detectExecutableContent(makeSourceDir({ "scripts/run.txt": "#!/bin/sh\n" }))).toBe(true);
  });
});

describe("publishBuiltinAsset", () => {
  it("拷贝内容、登记哈希、写清单，并支持按 id 保留其他版本", () => {
    const storageDir = makeStorageDir();
    const first = publishBuiltinAsset({
      sourceDir: makeSourceDir({ "SKILL.md": "第一版" }),
      id: "demo-skill",
      kind: "skill",
      version: "1.0.0",
      storageDir,
    });

    expect(first.fileCount).toBe(1);
    expect(first.asset).toMatchObject({
      id: "demo-skill",
      kind: "skill",
      version: "1.0.0",
      executable: false,
      path: "/builtin/assets/demo-skill/1.0.0",
    });
    expect(
      readFileSync(
        join(builtinAssetDir(builtinAssetsRoot(storageDir), "demo-skill", "1.0.0"), "SKILL.md"),
        "utf8",
      ),
    ).toBe("第一版");

    publishBuiltinAsset({
      sourceDir: makeSourceDir({ "SKILL.md": "第二版" }),
      id: "demo-skill",
      kind: "skill",
      version: "2.0.0",
      storageDir,
    });
    const manifest = readBuiltinManifest(builtinAssetsRoot(storageDir));
    expect(manifest.assets.map((asset) => asset.version)).toEqual(["1.0.0", "2.0.0"]);

    // 同 id + 同版本重发即覆盖，且上一版多出来的文件不会残留
    publishBuiltinAsset({
      sourceDir: makeSourceDir({ "SKILL.md": "第二版修订" }),
      id: "demo-skill",
      kind: "skill",
      version: "2.0.0",
      storageDir,
    });
    const version2Dir = builtinAssetDir(builtinAssetsRoot(storageDir), "demo-skill", "2.0.0");
    expect(readFileSync(join(version2Dir, "SKILL.md"), "utf8")).toBe("第二版修订");
    expect(readBuiltinManifest(builtinAssetsRoot(storageDir)).assets).toHaveLength(2);
  });

  it("含可执行内容的资产照常发布，但标记 executable", () => {
    const storageDir = makeStorageDir();
    const result = publishBuiltinAsset({
      sourceDir: makeSourceDir({ "hooks/hooks.json": "{}", "SKILL.md": "# 技能" }),
      id: "demo-exec",
      kind: "skill",
      version: "1.0.0",
      storageDir,
    });
    expect(result.asset.executable).toBe(true);
  });

  it("非法 id / 版本 / 空目录一律抛错", () => {
    const storageDir = makeStorageDir();
    const source = makeSourceDir({ "SKILL.md": "# 技能" });

    expect(() =>
      publishBuiltinAsset({
        sourceDir: source,
        id: "../etc",
        kind: "skill",
        version: "1.0.0",
        storageDir,
      }),
    ).toThrow(/id 非法/);
    expect(() =>
      publishBuiltinAsset({
        sourceDir: source,
        id: "demo",
        kind: "skill",
        version: "../x",
        storageDir,
      }),
    ).toThrow(/版本号非法/);
    expect(() =>
      publishBuiltinAsset({
        sourceDir: makeStorageDir(),
        id: "demo",
        kind: "skill",
        version: "1.0.0",
        storageDir,
      }),
    ).toThrow(/没有文件/);
    expect(() =>
      publishBuiltinAsset({
        sourceDir: join(storageDir, "missing"),
        id: "demo",
        kind: "skill",
        version: "1.0.0",
        storageDir,
      }),
    ).toThrow(/源目录不存在/);
  });
});

describe("readBuiltinManifest", () => {
  it("清单不存在时给空清单", () => {
    const root = builtinAssetsRoot(makeStorageDir());
    expect(readBuiltinManifest(root)).toEqual({ version: 1, updatedAt: "", assets: [] });
  });

  it("按 mtime 缓存：内容变化后读到新值，坏清单回落空清单", () => {
    const root = builtinAssetsRoot(makeStorageDir());
    const manifest: BuiltinManifest = {
      version: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
      assets: [],
    };
    writeBuiltinManifest(manifest, root);
    expect(readBuiltinManifest(root)).toEqual(manifest);

    // 直接改文件（模拟运营侧手工编辑）：mtime 变化后必须读到新内容
    const changed: BuiltinManifest = {
      version: 1,
      updatedAt: "2026-02-02T00:00:00.000Z",
      assets: [],
    };
    writeFileSync(builtinManifestPath(root), JSON.stringify(changed), "utf8");
    expect(readBuiltinManifest(root)).toEqual(changed);

    writeFileSync(builtinManifestPath(root), "{ 不是 JSON", "utf8");
    expect(readBuiltinManifest(root)).toEqual({ version: 1, updatedAt: "", assets: [] });
  });
});

describe("findBuiltinAsset", () => {
  it("按 id + 版本命中，缺任一项都取不到", () => {
    const storageDir = makeStorageDir();
    publishBuiltinAsset({
      sourceDir: makeSourceDir({ "SKILL.md": "# 技能" }),
      id: "demo",
      kind: "skill",
      version: "1.0.0",
      storageDir,
    });
    const manifest = readBuiltinManifest(builtinAssetsRoot(storageDir));

    expect(findBuiltinAsset(manifest, "demo", "1.0.0")?.path).toBe("/builtin/assets/demo/1.0.0");
    expect(findBuiltinAsset(manifest, "demo", "2.0.0")).toBeNull();
    expect(findBuiltinAsset(manifest, "other", "1.0.0")).toBeNull();
  });
});

describe("createBuiltinBundleStream", () => {
  it("文本按 utf8、二进制按 base64，且带逐文件 sha256", async () => {
    const storageDir = makeStorageDir();
    const source = makeSourceDir({ "SKILL.md": "# 技能" });
    const binary = Buffer.from([0x00, 0xff, 0x10, 0x80]);
    mkdirSync(join(source, "assets"), { recursive: true });
    writeFileSync(join(source, "assets/logo.bin"), binary);

    const result = publishBuiltinAsset({
      sourceDir: source,
      id: "demo",
      kind: "skill",
      version: "1.0.0",
      storageDir,
    });
    const bundle = await readBundle(
      result.asset,
      builtinAssetDir(builtinAssetsRoot(storageDir), "demo", "1.0.0"),
    );

    const text = bundle.files.find((file) => file.path === "SKILL.md");
    expect(text?.encoding).toBe("utf8");
    expect(text?.content).toBe("# 技能");
    expect(text?.sha256).toBe(result.asset.files.find((file) => file.path === "SKILL.md")?.sha256);

    const binaryPayload = bundle.files.find((file) => file.path === "assets/logo.bin");
    expect(binaryPayload?.encoding).toBe("base64");
    expect(Buffer.from(binaryPayload?.content ?? "", "base64")).toEqual(binary);
  });

  it("内容缺失时让流中断，而不是回一个残缺的 JSON", async () => {
    const storageDir = makeStorageDir();
    const result = publishBuiltinAsset({
      sourceDir: makeSourceDir({ "SKILL.md": "# 技能" }),
      id: "demo",
      kind: "skill",
      version: "1.0.0",
      storageDir,
    });
    const dir = builtinAssetDir(builtinAssetsRoot(storageDir), "demo", "1.0.0");
    rmSync(join(dir, "SKILL.md"));

    await expect(readBundle(result.asset, dir)).rejects.toThrow(/内容缺失/);
  });
});

describe("authorizeBuiltinDevice", () => {
  it("无令牌 / 非 active 设备都拒，合法设备放行", async () => {
    const request = (authorization?: string): Request =>
      new Request("http://hub.test/builtin/manifest", {
        headers: authorization ? { authorization } : {},
      });

    expect(await authorizeBuiltinDevice(request())).toBeNull();
    expect(mockFindDeviceByToken).not.toHaveBeenCalled();

    // 令牌查不到设备（mock 默认返回 undefined）与设备已吊销走同一结果
    expect(await authorizeBuiltinDevice(request("Bearer abc"))).toBeNull();

    mockFindDeviceByToken.mockResolvedValue({ id: "d1", status: "revoked" });
    expect(await authorizeBuiltinDevice(request("Bearer abc"))).toBeNull();

    mockFindDeviceByToken.mockResolvedValue({ id: "d1", status: "active" });
    expect(await authorizeBuiltinDevice(request("bearer abc"))).toMatchObject({ id: "d1" });
  });
});
