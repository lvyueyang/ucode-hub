/**
 * 主题注册表测试：dataTheme 唯一性、明暗方案完整性
 */
import { describe, expect, it } from "vitest";
import { ADMIN_THEME, CLIENT_THEME } from "../themes";

describe("主题注册表", () => {
  it("管理端与前台各自持有亮暗两档主题", () => {
    expect(ADMIN_THEME.storageKey).toBe("admin-theme");
    expect(CLIENT_THEME.storageKey).toBe("client-theme");

    for (const preset of [ADMIN_THEME, CLIENT_THEME]) {
      expect(preset.light.isDark).toBe(false);
      expect(preset.dark.isDark).toBe(true);
      expect(preset.light.dataTheme.endsWith("-light")).toBe(true);
      expect(preset.dark.dataTheme.endsWith("-dark")).toBe(true);
      expect(preset.light.antdColorPrimary).toBeTypeOf("string");
      expect(preset.dark.antdColorPrimary).toBeTypeOf("string");
    }
  });

  it("所有 dataTheme 全局唯一", () => {
    const seen = new Set<string>();
    for (const preset of [ADMIN_THEME, CLIENT_THEME]) {
      for (const scheme of [preset.light, preset.dark]) {
        expect(seen.has(scheme.dataTheme)).toBe(false);
        seen.add(scheme.dataTheme);
      }
    }
  });
});
