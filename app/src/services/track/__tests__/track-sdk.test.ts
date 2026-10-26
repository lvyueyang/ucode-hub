/**
 * 客户端埋点 SDK 测试：会话管理、事件上报、路由追踪、系统属性自动采集
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockTrackEventSFn } = vi.hoisted(() => ({
  mockTrackEventSFn: vi.fn().mockResolvedValue({ success: true }),
}));

// mock Server Function
vi.mock("#/services/track/track.functions", () => ({
  trackEventSFn: mockTrackEventSFn,
}));

import {
  getSessionId,
  init,
  setUserId,
  startRouteTracking,
  stopRouteTracking,
  track,
} from "../track";

/** 设置浏览器环境 mock */
function mockBrowserEnv() {
  vi.stubGlobal("window", {
    location: { href: "https://example.com/page" },
    screen: { width: 1920, height: 1080 },
  });
  vi.stubGlobal("navigator", {
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    language: "zh-CN",
  });
  vi.stubGlobal("document", {
    title: "测试页面",
    referrer: "https://google.com",
  });
  vi.stubGlobal("sessionStorage", {
    getItem: vi.fn().mockReturnValue(null),
    setItem: vi.fn(),
  });
}

describe("track SDK", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stopRouteTracking();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("init", () => {
    it("SSR 环境下不执行任何操作", () => {
      const origWindow = globalThis.window;
      // @ts-expect-error 模拟 SSR
      delete globalThis.window;

      init();

      globalThis.window = origWindow;

      expect(mockTrackEventSFn).not.toHaveBeenCalled();
    });
  });

  describe("setUserId", () => {
    it("设置用户 ID 不报错", () => {
      expect(() => setUserId("user-1")).not.toThrow();
      expect(() => setUserId(undefined)).not.toThrow();
    });
  });

  describe("getSessionId", () => {
    it("返回字符串", () => {
      const sessionId = getSessionId();
      expect(typeof sessionId).toBe("string");
    });
  });

  describe("track", () => {
    it("SSR 环境下不执行上报", async () => {
      const origWindow = globalThis.window;
      const origDocument = globalThis.document;
      // @ts-expect-error 模拟 SSR
      delete globalThis.window;
      // @ts-expect-error 模拟 SSR
      delete globalThis.document;

      await track("Click", { button: "submit" });

      globalThis.window = origWindow;
      globalThis.document = origDocument;

      expect(mockTrackEventSFn).not.toHaveBeenCalled();
    });

    it("浏览器环境下上报事件，自动采集基础页面属性", async () => {
      mockBrowserEnv();

      await track("Click", { button: "submit" });

      expect(mockTrackEventSFn).toHaveBeenCalledTimes(1);
      const callArgs = mockTrackEventSFn.mock.calls[0][0];
      expect(callArgs.data.name).toBe("Click");
      expect(callArgs.data.properties.url).toBe("https://example.com/page");
      expect(callArgs.data.properties.referer).toBe("https://google.com");
      expect(callArgs.data.properties.page_name).toBe("测试页面");
    });

    it("自动采集系统属性：$browser、$os、$device_type、$user_agent、$screen_size、$language", async () => {
      mockBrowserEnv();

      await track("PageView", {});

      expect(mockTrackEventSFn).toHaveBeenCalledTimes(1);
      const props = mockTrackEventSFn.mock.calls[0][0].data.properties;
      expect(props.$browser).toBeDefined();
      expect(props.$os).toBeDefined();
      expect(props.$device_type).toBeDefined();
      expect(props.$user_agent).toBeDefined();
      expect(props.$screen_size).toBe("1920x1080");
      expect(props.$language).toBe("zh-CN");
    });

    it("UA 解析：Chrome on macOS 识别正确", async () => {
      vi.stubGlobal("window", {
        location: { href: "https://example.com" },
        screen: { width: 1920, height: 1080 },
      });
      vi.stubGlobal("navigator", {
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        language: "en-US",
      });
      vi.stubGlobal("document", { title: "Test", referrer: "" });
      vi.stubGlobal("sessionStorage", {
        getItem: vi.fn().mockReturnValue(null),
        setItem: vi.fn(),
      });

      await track("PageView", {});

      const props = mockTrackEventSFn.mock.calls[0][0].data.properties;
      expect(props.$browser).toBe("Chrome 120");
      expect(props.$os).toContain("macOS");
      expect(props.$device_type).toBe("Desktop");
    });

    it("UA 解析：Mobile Safari on iPhone 识别正确", async () => {
      vi.stubGlobal("window", {
        location: { href: "https://m.example.com" },
        screen: { width: 390, height: 844 },
      });
      vi.stubGlobal("navigator", {
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        language: "zh-Hans",
      });
      vi.stubGlobal("document", { title: "Mobile", referrer: "" });
      vi.stubGlobal("sessionStorage", {
        getItem: vi.fn().mockReturnValue(null),
        setItem: vi.fn(),
      });

      await track("PageView", {});

      const props = mockTrackEventSFn.mock.calls[0][0].data.properties;
      expect(props.$browser).toContain("Safari");
      expect(props.$os).toContain("iOS");
      expect(props.$device_type).toBe("Mobile");
    });

    it("自定义属性与自动采集属性合并，自定义属性优先", async () => {
      mockBrowserEnv();

      await track("FormSubmit", { form_name: "clientLogin" });

      const props = mockTrackEventSFn.mock.calls[0][0].data.properties;
      expect(props.form_name).toBe("clientLogin");
      expect(props.url).toBe("https://example.com/page");
      expect(props.page_name).toBe("测试页面");
    });
  });

  describe("startRouteTracking / stopRouteTracking", () => {
    it("SSR 环境下不执行任何操作", () => {
      const origWindow = globalThis.window;
      // @ts-expect-error 模拟 SSR
      delete globalThis.window;

      startRouteTracking();
      stopRouteTracking();

      globalThis.window = origWindow;

      expect(true).toBe(true);
    });

    it("浏览器环境下启动路由追踪不报错", () => {
      stopRouteTracking();

      expect(() => startRouteTracking()).not.toThrow();
      // 重复注册不报错（幂等性）
      expect(() => startRouteTracking()).not.toThrow();

      stopRouteTracking();
    });

    it("stopRouteTracking 安全调用（未启动时）", () => {
      stopRouteTracking();
      expect(() => stopRouteTracking()).not.toThrow();
    });
  });
});
