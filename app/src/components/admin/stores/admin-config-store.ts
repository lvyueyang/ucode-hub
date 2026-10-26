/**
 * 管理端系统配置 zustand store
 * 进入 admin 时一次性加载客户端可见配置，供全局组件读取
 */
import { create } from "zustand";
import { getVisibleConfigsSFn } from "#/shared-services/config/config.functions";
import { sfnUnwrap } from "#/utils/sfn-error";

interface AdminConfigState {
  config: Record<string, string>;
  loaded: boolean;
  loadAll: () => Promise<void>;
}

export const useAdminConfigStore = create<AdminConfigState>((set, get) => ({
  config: {},
  loaded: false,
  loadAll: async () => {
    if (get().loaded) return;
    // 配置预加载：失败静默，未加载成功则不置 loaded，下次进入可重试
    const [config] = await sfnUnwrap(getVisibleConfigsSFn(), { silent: true });
    if (config !== null) set({ config, loaded: true });
  },
}));
