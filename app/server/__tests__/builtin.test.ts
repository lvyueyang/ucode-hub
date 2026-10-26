/**
 * 内置资产两个 server route 的契约测试：鉴权 401、未登记资产 404（含非法路径段）、
 * 清单与内容包 200（含 `cache-control: no-store`）。不连数据库——设备查询按服务层 mock 掉。
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { H3Event } from "nitro/h3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockFindDeviceByToken } = vi.hoisted(() => ({ mockFindDeviceByToken: vi.fn() }));
vi.mock("#/services/device/device.server", () => ({
  findDeviceByToken: mockFindDeviceByToken,
}));

import { publishBuiltinAsset } from "#/services/builtin-assets/builtin-assets.server";

import assetRoute from "../routes/builtin/assets/[id]/[version].get";
import manifestRoute from "../routes/builtin/manifest.get";

const created: string[] = [];

/** route handler 只用到 req / url / context.params 三处，其余字段不参与 */
const makeEvent = (url: string, token?: string, params?: Record<string, string>): H3Event =>
  ({
    req: new Request(url, { headers: token ? { authorization: `Bearer ${token}` } : {} }),
    url: new URL(url),
    context: params ? { params } : {},
  }) as unknown as H3Event;

const AUTH_DEVICE = { id: "device-1", status: "active" };

beforeEach(() => {
  const storageDir = mkdtempSync(join(tmpdir(), "hub-builtin-route-"));
  created.push(storageDir);
  vi.stubEnv("STORAGE_DIR", storageDir);

  publishBuiltinAsset({
    sourceDir: makeSourceDir(),
    id: "demo-skill",
    kind: "skill",
    version: "1.0.0",
    storageDir,
  });
  mockFindDeviceByToken.mockResolvedValue(AUTH_DEVICE);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** 建一个含单个 SKILL.md 的源目录 */
function makeSourceDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "hub-builtin-src-"));
  created.push(dir);
  writeFileSync(join(dir, "SKILL.md"), "# 技能", "utf8");
  return dir;
}

describe("GET /builtin/manifest", () => {
  it("未登记设备 401，带 no-store", async () => {
    const response = await manifestRoute(makeEvent("http://hub.test/builtin/manifest"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "设备令牌无效或已吊销" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("已登记设备拿到清单", async () => {
    const response = await manifestRoute(
      makeEvent("http://hub.test/builtin/manifest", "device-token"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const manifest = (await response.json()) as { version: number; assets: { id: string }[] };
    expect(manifest.version).toBe(1);
    expect(manifest.assets.map((asset) => asset.id)).toEqual(["demo-skill"]);
  });
});

describe("GET /builtin/assets/<id>/<version>", () => {
  const url = "http://hub.test/builtin/assets/demo-skill/1.0.0";

  it("未登记设备 401", async () => {
    const response = await assetRoute(
      makeEvent(url, undefined, { id: "demo-skill", version: "1.0.0" }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "设备令牌无效或已吊销" });
  });

  it("资产不存在 404", async () => {
    const response = await assetRoute(
      makeEvent(url, "device-token", { id: "demo-skill", version: "9.9.9" }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "资产不存在" });
  });

  it("非法路径段 404（不区分不存在与不合法）", async () => {
    for (const params of [
      { id: "..", version: "1.0.0" },
      { id: "%2e%2e", version: "1.0.0" },
      { id: "demo-skill", version: ".." },
    ]) {
      const response = await assetRoute(makeEvent(url, "device-token", params));
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "资产不存在" });
    }
  });

  it("内容包 200：逐文件给 path / sha256 / encoding / content", async () => {
    const response = await assetRoute(
      makeEvent(url, "device-token", { id: "demo-skill", version: "1.0.0" }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toContain("application/json");

    const bundle = (await response.json()) as {
      id: string;
      version: string;
      executable: boolean;
      files: { path: string; encoding: string; content: string; sha256: string }[];
    };
    expect(bundle).toMatchObject({ id: "demo-skill", version: "1.0.0", executable: false });
    expect(bundle.files).toHaveLength(1);
    expect(bundle.files[0]).toMatchObject({
      path: "SKILL.md",
      encoding: "utf8",
      content: "# 技能",
    });
    expect(bundle.files[0]?.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
