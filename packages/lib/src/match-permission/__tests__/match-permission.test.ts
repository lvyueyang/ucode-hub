/**
 * 权限匹配纯函数测试
 * 覆盖 ** 超级通配符、group:* 分组通配符、精确匹配三种模式及边界情况
 */

import { describe, expect, it } from "vitest";
import { matchPermission } from "../index";

describe("matchPermission", () => {
  describe("** 超级通配符", () => {
    it("** 匹配任意权限码", () => {
      expect(matchPermission(["**"], "news:view")).toBe(true);
      expect(matchPermission(["**"], "admin:delete")).toBe(true);
      expect(matchPermission(["**"], "dashboard:view")).toBe(true);
      expect(matchPermission(["**"], "dict:create-item")).toBe(true);
    });

    it("** 在数组任一位置均生效", () => {
      expect(matchPermission(["news:view", "**", "dict:edit"], "admin:create")).toBe(true);
      expect(matchPermission(["**", "news:view"], "file:upload")).toBe(true);
    });

    it("仅 ** 一项即可匹配全部", () => {
      expect(matchPermission(["**"], "log:view")).toBe(true);
    });
  });

  describe("group:* 分组通配符", () => {
    it("news:* 匹配所有 news: 前缀权限", () => {
      const perms = ["news:*"];
      expect(matchPermission(perms, "news:view")).toBe(true);
      expect(matchPermission(perms, "news:create")).toBe(true);
      expect(matchPermission(perms, "news:edit")).toBe(true);
      expect(matchPermission(perms, "news:delete")).toBe(true);
      expect(matchPermission(perms, "news:publish")).toBe(true);
    });

    it("dict:* 匹配含连字符的 dict:create-item 等权限", () => {
      const perms = ["dict:*"];
      expect(matchPermission(perms, "dict:create-item")).toBe(true);
      expect(matchPermission(perms, "dict:edit-item")).toBe(true);
      expect(matchPermission(perms, "dict:delete-item")).toBe(true);
    });

    it("news:* 不匹配其他分组权限", () => {
      const perms = ["news:*"];
      expect(matchPermission(perms, "dict:view")).toBe(false);
      expect(matchPermission(perms, "admin:view")).toBe(false);
      expect(matchPermission(perms, "file:upload")).toBe(false);
      expect(matchPermission(perms, "dashboard:view")).toBe(false);
    });

    it("多个分组通配符各自匹配对应分组", () => {
      const perms = ["news:*", "admin:*"];
      expect(matchPermission(perms, "news:view")).toBe(true);
      expect(matchPermission(perms, "admin:create")).toBe(true);
      expect(matchPermission(perms, "admin:delete")).toBe(true);
      expect(matchPermission(perms, "dict:view")).toBe(false);
      expect(matchPermission(perms, "file:upload")).toBe(false);
    });

    it("分组通配符不匹配无冒号的权限码", () => {
      expect(matchPermission(["news:*"], "news")).toBe(false);
    });
  });

  describe("逐级分组通配符（多级权限码）", () => {
    it("一级通配匹配多级权限码", () => {
      expect(matchPermission(["open_api:*"], "open_api:material:query")).toBe(true);
    });

    it("中间级通配匹配其下多级权限码", () => {
      expect(matchPermission(["open_api:material:*"], "open_api:material:query")).toBe(true);
      expect(matchPermission(["open_api:material:*"], "open_api:material:export")).toBe(true);
    });

    it("中间级通配不匹配同级其他子域", () => {
      expect(matchPermission(["open_api:material:*"], "open_api:order:query")).toBe(false);
    });

    it("单级权限码行为不变（news:* 不匹配 dict:view）", () => {
      expect(matchPermission(["news:*"], "news:view")).toBe(true);
      expect(matchPermission(["news:*"], "dict:view")).toBe(false);
    });
  });

  describe("精确匹配", () => {
    it("精确命中", () => {
      expect(matchPermission(["news:view"], "news:view")).toBe(true);
      expect(matchPermission(["admin:delete"], "admin:delete")).toBe(true);
    });

    it("精确不命中", () => {
      expect(matchPermission(["news:view"], "news:create")).toBe(false);
      expect(matchPermission(["admin:view"], "dashboard:view")).toBe(false);
    });
  });

  describe("边界情况", () => {
    it("空权限数组不匹配任何", () => {
      expect(matchPermission([], "news:view")).toBe(false);
      expect(matchPermission([], "**")).toBe(false);
    });

    it("requiredCode 自身为 ** 时精确匹配", () => {
      expect(matchPermission(["**"], "**")).toBe(true);
    });

    it("requiredCode 自身为 group:* 时精确匹配", () => {
      expect(matchPermission(["news:*"], "news:*")).toBe(true);
    });

    it("** 和 group:* 共存时 ** 优先级最高", () => {
      const perms = ["news:*", "**"];
      expect(matchPermission(perms, "admin:view")).toBe(true);
      expect(matchPermission(perms, "dict:create")).toBe(true);
    });

    it("group:* 和精确码共存时均可匹配", () => {
      const perms = ["news:*", "dict:view"];
      expect(matchPermission(perms, "news:create")).toBe(true); // 分组匹配
      expect(matchPermission(perms, "dict:view")).toBe(true); // 精确匹配
      expect(matchPermission(perms, "dict:edit")).toBe(false); // 无匹配
    });
  });
});
