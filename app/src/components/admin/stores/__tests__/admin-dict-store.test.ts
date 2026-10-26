/**
 * 管理端字典 zustand store 测试：幂等加载、刷新、初始状态
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLoadDicts } = vi.hoisted(() => ({
  mockLoadDicts: vi.fn(),
}));

vi.mock("#/shared-services/dict/dict.functions", () => ({
  getAllDictOptionsSFn: mockLoadDicts,
}));

import { useAdminDictStore } from "#/components/admin/stores/admin-dict-store";

describe("useAdminDictStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAdminDictStore.setState({ dicts: {}, loaded: false, loading: false });
  });

  it("初始状态 dicts 为空且 loaded 为 false", () => {
    const state = useAdminDictStore.getState();
    expect(state.dicts).toEqual({});
    expect(state.loaded).toBe(false);
    expect(state.loading).toBe(false);
  });

  it("loadAll 加载字典数据并设置 loaded 为 true", async () => {
    const mockData = {
      category: [{ label: "分类1", value: "1" }],
    };
    mockLoadDicts.mockResolvedValue(mockData);

    await useAdminDictStore.getState().loadAll();

    const state = useAdminDictStore.getState();
    expect(state.dicts).toEqual(mockData);
    expect(state.loaded).toBe(true);
  });

  it("loadAll 已加载后不再重复请求（幂等）", async () => {
    useAdminDictStore.setState({ loaded: true });
    mockLoadDicts.mockResolvedValue({});

    await useAdminDictStore.getState().loadAll();

    expect(mockLoadDicts).not.toHaveBeenCalled();
  });

  it("refresh 每次都会重新请求并更新数据", async () => {
    const firstData = { category: [{ label: "旧", value: "old" }] };
    const secondData = { category: [{ label: "新", value: "new" }] };

    mockLoadDicts.mockResolvedValueOnce(firstData);
    await useAdminDictStore.getState().loadAll();

    mockLoadDicts.mockResolvedValueOnce(secondData);
    await useAdminDictStore.getState().refresh();

    const state = useAdminDictStore.getState();
    expect(state.dicts).toEqual(secondData);
    expect(state.loading).toBe(false);
    expect(mockLoadDicts).toHaveBeenCalledTimes(2);
  });
});
