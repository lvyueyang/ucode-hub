/**
 * 前台主题切换按钮测试：三态循环（亮/暗/跟随系统）
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ThemeToggle from "../theme-toggle";
import type { ThemePreset } from "../use-theme-mode";

/** 测试用主题预设 */
const TEST_PRESET: ThemePreset = {
  storageKey: "test-theme",
  light: {
    dataTheme: "client-light",
    isDark: false,
    antdColorPrimary: "#111111",
    themeColor: "#ffffff",
  },
  dark: {
    dataTheme: "client-dark",
    isDark: true,
    antdColorPrimary: "#333333",
    themeColor: "#0a0a0a",
  },
};

function setupMatchMedia() {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

describe("ThemeToggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.spyOn(document.documentElement, "setAttribute").mockImplementation(() => {});
    setupMatchMedia();
  });

  afterEach(() => {
    cleanup();
  });

  it("默认 auto 模式显示 Auto", () => {
    render(<ThemeToggle preset={TEST_PRESET} />);
    expect(screen.getByRole("button").textContent).toBe("Auto");
  });

  it("点击按 auto → light → dark → auto 三态循环", () => {
    render(<ThemeToggle preset={TEST_PRESET} />);
    const button = screen.getByRole("button");

    fireEvent.click(button); // auto → light
    expect(button.textContent).toBe("Light");
    expect(localStorage.getItem("test-theme")).toBe("light");

    fireEvent.click(button); // light → dark
    expect(button.textContent).toBe("Dark");
    expect(localStorage.getItem("test-theme")).toBe("dark");

    fireEvent.click(button); // dark → auto
    expect(button.textContent).toBe("Auto");
    expect(localStorage.getItem("test-theme")).toBe("auto");
  });

  it("从 localStorage 的 dark 模式开始点击回到 auto", () => {
    localStorage.setItem("test-theme", "dark");
    render(<ThemeToggle preset={TEST_PRESET} />);
    const button = screen.getByRole("button");
    expect(button.textContent).toBe("Dark");

    fireEvent.click(button);
    expect(button.textContent).toBe("Auto");
  });
});
