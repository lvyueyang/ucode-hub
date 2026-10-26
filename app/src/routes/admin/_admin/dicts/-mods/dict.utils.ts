/**
 * 字典模块共享工具
 */
import { PRESET_DICTS } from "#/constants";

/** 判断是否为预置字典（预置字典禁止删除与改标识） */
export function isPresetDict(slug: string): boolean {
  return PRESET_DICTS.some((d) => d.slug === slug);
}
