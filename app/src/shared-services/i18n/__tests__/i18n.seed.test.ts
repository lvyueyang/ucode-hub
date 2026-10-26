/**
 * 国际化种子数据测试：验证预置翻译批量写入与冲突跳过
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#/shared-services/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const { mockDb } = vi.hoisted(() => {
  const q = () => ({ findFirst: vi.fn(), findMany: vi.fn() });
  return {
    mockDb: {
      query: {
        uiTranslation: q(),
        contentTranslation: q(),
        adminUser: q(),
        clientUser: q(),
        role: q(),
        dict: q(),
        dictItem: q(),
        systemConfig: q(),
        file: q(),
        captchaCode: q(),
        news: q(),
      },
      $count: vi.fn(),
      select: vi.fn(() => ({
        from: vi.fn(() => ({ where: vi.fn() })),
      })),
      insert: vi.fn(() => ({ values: vi.fn() })),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
      delete: vi.fn(() => ({ where: vi.fn() })),
    },
  };
});

vi.mock("#/db", () => ({ db: mockDb }));

import { ensurePresetTranslations, SEED_DATA } from "../i18n.seed";

/** 递归收集目录下 .ts/.tsx 源文件（跳过 admin 与 __tests__） */
function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "admin" || entry === "__tests__") continue;
      collectSourceFiles(full, out);
    } else if (full.endsWith(".tsx") || full.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

/** 匹配 t("字面量") / t('字面量')，排除前缀为字母/数字/_/$. 的标识符（如 format(） */
const T_CALL_RE = /(?<![A-Za-z0-9_$.])t\(\s*["']([^"']+)["']/g;

/** 从源码中提取 t() 第一参数字面量 */
function extractTranslationKeys(source: string): string[] {
  const keys: string[] = [];
  for (const match of source.matchAll(T_CALL_RE)) {
    keys.push(match[1]);
  }
  return keys;
}

/** 前台 i18n 使用范围：顶层路由（不含 admin）+ 客户端组件 */
const FRONTEND_DIRS = [
  fileURLToPath(new URL("../../../routes", import.meta.url)),
  fileURLToPath(new URL("../../../components/client", import.meta.url)),
];

/**
 * 完整性守卫：前台所有 t("中文") 字面量必须存在于英文种子数据中，
 * 防止新增文案遗漏种子导致英文站静默回退中文。
 */
describe("前台 t() 文案与英文种子数据完整性", () => {
  const seedKeys = new Set(SEED_DATA.filter((row) => row.locale === "en").map((row) => row.key));
  const missed: Record<string, string[]> = {};
  for (const file of FRONTEND_DIRS.flatMap((dir) => collectSourceFiles(dir))) {
    const source = readFileSync(file, "utf-8");
    const missing = [...new Set(extractTranslationKeys(source))].filter(
      (key) => !seedKeys.has(key),
    );
    if (missing.length > 0) missed[file] = missing;
  }

  it("所有前台翻译文案都能在英文种子数据中找到", () => {
    expect(missed).toEqual({});
  });
});

describe("ensurePresetTranslations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("批量写入全部种子数据并跳过冲突", async () => {
    const onConflictDoNothing = vi.fn(() => Promise.resolve());
    const valuesMock = vi.fn((_data: unknown) => ({ onConflictDoNothing }));
    mockDb.insert.mockReturnValue({ values: valuesMock });

    await ensurePresetTranslations();

    expect(valuesMock).toHaveBeenCalledTimes(1);
    expect(onConflictDoNothing).toHaveBeenCalledTimes(1);
    const rows = valuesMock.mock.calls[0][0] as {
      locale: string;
      key: string;
      value: string;
    }[];
    expect(rows).toHaveLength(SEED_DATA.length);
    expect(rows[0]).toMatchObject({
      locale: "en",
      key: "返回首页",
      value: "Back to Home",
    });
  });
});

describe("SEED_DATA", () => {
  it("种子数据仅包含英文语言", () => {
    const locales = new Set(SEED_DATA.map((r) => r.locale));
    expect(locales).toEqual(new Set(["en"]));
  });

  it("种子数据键值不为空且无重复键", () => {
    const keys = new Set<string>();
    for (const row of SEED_DATA) {
      expect(row.key).toBeTruthy();
      expect(row.value).toBeTruthy();
      keys.add(row.key);
    }
    expect(keys.size).toBe(SEED_DATA.length);
  });
});
