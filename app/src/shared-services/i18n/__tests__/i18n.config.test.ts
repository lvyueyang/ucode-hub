/**
 * 国际化工具函数与常量测试
 * 覆盖 SUPPORTED_LOCALES / DEFAULT_LOCALE / LOCALE_COOKIE / createI18nInstance
 * 注意：生产环境中 zh 的 translations 为空对象（{}），因为默认语言无需自我翻译
 */

import { describe, expect, it } from "vitest";
import { createI18nInstance } from "../i18n.config";
import type { Translations } from "../i18n.types";
import { DEFAULT_LOCALE, LOCALE_COOKIE, SUPPORTED_LOCALES } from "../i18n.types";

describe("SUPPORTED_LOCALES", () => {
  it("包含 zh 和 en", () => {
    expect(SUPPORTED_LOCALES).toContain("zh");
    expect(SUPPORTED_LOCALES).toContain("en");
    expect(SUPPORTED_LOCALES).toHaveLength(2);
  });
});

describe("DEFAULT_LOCALE", () => {
  it("默认语言为 zh", () => {
    expect(DEFAULT_LOCALE).toBe("zh");
  });
});

describe("LOCALE_COOKIE", () => {
  it("Cookie 名为 lang", () => {
    expect(LOCALE_COOKIE).toBe("lang");
  });
});

describe("createI18nInstance", () => {
  // 模拟生产环境：
  // zh locale → getUITranslations("zh") → {}（默认语言无自我翻译）
  // en locale → getUITranslations("en") → { "首页": "Home", ... }

  const enTranslations: Translations = {
    首页: "Home",
    新闻: "News",
    关于: "About",
  };

  it("中文 locale + 空翻译：t('首页') 返回原文本身", () => {
    const i18n = createI18nInstance("zh", {});
    expect(i18n.t("首页")).toBe("首页");
  });

  it("英文 locale 下 t('首页') 返回对应的英文值", () => {
    const i18n = createI18nInstance("en", enTranslations);
    expect(i18n.t("首页")).toBe("Home");
  });

  it("未翻译的 key 在非默认语言下返回 key 本身", () => {
    const i18n = createI18nInstance("en", enTranslations);
    expect(i18n.t("未翻译文案")).toBe("未翻译文案");
  });

  it("每次调用返回独立的 i18next 实例", () => {
    const i18n1 = createI18nInstance("en", { 首页: "Home" });
    const i18n2 = createI18nInstance("en", { 首页: "Home" });
    expect(i18n1).not.toBe(i18n2);
  });

  it("带插值的翻译正常工作", () => {
    const i18n = createI18nInstance("en", {
      "共 {{total}} 篇": "{{total}} articles",
    });
    expect(i18n.t("共 {{total}} 篇", { total: 10 })).toBe("10 articles");
  });

  it("关闭 fallback 后未翻译 key 仍返回 key 本身（returnNull: false）", () => {
    const i18n = createI18nInstance("en", { 首页: "Home" }, false);
    expect(i18n.t("未翻译文案")).toBe("未翻译文案");
  });

  it("空翻译对象不影响基本功能", () => {
    const i18n = createI18nInstance("zh", {});
    expect(i18n.t("任意文本")).toBe("任意文本");
  });

  it("跨语言翻译隔离：en 实例不影响 zh 实例", () => {
    const zh = createI18nInstance("zh", {});
    const en = createI18nInstance("en", { 首页: "Home" });

    expect(zh.t("首页")).toBe("首页");
    expect(en.t("首页")).toBe("Home");
  });

  describe("实际种子数据集成测试", () => {
    /** 模拟 en locale 的种子数据 */
    const seedTranslations: Translations = {
      全栈开发工程基座: "Full-Stack Development Base",
      浏览新闻: "Browse News",
      暂无数据: "No Data",
      "共 {{total}} 篇": "{{total}} articles",
    };

    it("中文 + 空翻译：直接返回原文", () => {
      const i18n = createI18nInstance("zh", {});
      expect(i18n.t("全栈开发工程基座")).toBe("全栈开发工程基座");
      expect(i18n.t("浏览新闻")).toBe("浏览新闻");
    });

    it("英文返回对应翻译", () => {
      const i18n = createI18nInstance("en", seedTranslations);
      expect(i18n.t("全栈开发工程基座")).toBe("Full-Stack Development Base");
      expect(i18n.t("浏览新闻")).toBe("Browse News");
    });

    it("插值 + 翻译组合正常", () => {
      const i18n = createI18nInstance("en", seedTranslations);
      expect(i18n.t("共 {{total}} 篇", { total: 5 })).toBe("5 articles");
    });
  });
});
