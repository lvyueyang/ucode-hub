/**
 * 管理端字典 zustand store
 * 进入 admin 时一次性加载全部字典，所有 DictSelect/DictTag 组件同步读取
 */
import { create } from "zustand";
import { getAllDictOptionsSFn } from "#/shared-services/dict/dict.functions";
import { sfnUnwrap } from "#/utils/sfn-error";

/** 字典选项 */
export interface DictOption {
  label: string;
  value: string;
  color?: string | null;
}

interface AdminDictState {
  /** 全部字典选项（按 slug 分组） */
  dicts: Record<string, DictOption[]>;
  /** 是否已加载完成 */
  loaded: boolean;
  /** 是否正在加载中 */
  loading: boolean;
  /** 加载全部字典（幂等，已加载则跳过） */
  loadAll: () => Promise<void>;
  /** 刷新全部字典（异步） */
  refresh: () => Promise<void>;
}

export const useAdminDictStore = create<AdminDictState>((set, get) => ({
  dicts: {},
  loaded: false,
  loading: false,
  loadAll: async () => {
    if (get().loaded) return;
    // 字典预加载：失败静默，未加载成功则不置 loaded，下次进入可重试
    const [dicts] = await sfnUnwrap(getAllDictOptionsSFn(), { silent: true });
    if (dicts !== null) set({ dicts, loaded: true });
  },
  refresh: async () => {
    set({ loading: true });
    const [dicts] = await sfnUnwrap(getAllDictOptionsSFn(), { silent: true });
    if (dicts !== null) set({ dicts });
    set({ loading: false });
  },
}));
