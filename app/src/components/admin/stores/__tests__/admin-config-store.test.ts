/**
 * 管理端系统配置 zustand store 测试：幂等加载、初始状态
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLoadConfig } = vi.hoisted(() => ({
  mockLoadConfig: vi.fn(),
}));

vi.mock("#/shared-services/config/config.functions", () => ({
  getVisibleConfigsSFn: mockLoadConfig,
}));

import { useAdminConfigStore } from "#/components/admin/stores/admin-config-store";

describe("useAdminConfigStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAdminConfigStore.setState({ config: {}, loaded: false });
  });

  it("初始状态 config 为空且 loaded 为 false", () => {
    const state = useAdminConfigStore.getState();
    expect(state.config).toEqual({});
    expect(state.loaded).toBe(false);
  });

  it("loadAll 加载配置并设置 loaded 为 true", async () => {
    const mockData = { site_name: "测试站点" };
    mockLoadConfig.mockResolvedValue(mockData);

    await useAdminConfigStore.getState().loadAll();

    const state = useAdminConfigStore.getState();
    expect(state.config).toEqual(mockData);
    expect(state.loaded).toBe(true);
  });

  it("loadAll 已加载后不再重复请求（幂等）", async () => {
    useAdminConfigStore.setState({ loaded: true });
    mockLoadConfig.mockResolvedValue({});

    await useAdminConfigStore.getState().loadAll();

    expect(mockLoadConfig).not.toHaveBeenCalled();
  });
});
