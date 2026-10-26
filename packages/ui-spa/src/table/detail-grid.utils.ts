/**
 * 行展开面板（DetailGrid）的纯逻辑：空值判据、值文本归一与复制内容推导
 * 与组件分离，便于在无 DOM 环境的测试中直接覆盖
 */
import type { ReactNode } from "react";

/** 空值占位符 */
export const DETAIL_EMPTY_TEXT = "—";

/** 行展开面板的单个字段 */
export interface DetailGridItem {
  /** 字段标识，同时作为 React key */
  key: string;
  /** 中文业务标签 */
  label: string;
  /** 字段原始英文键，渲染为标签旁的中性标识；缺省不展示 */
  fieldKey?: string;
  /** 展示值；空值（null / undefined / 空串）由组件渲染占位符 */
  value?: ReactNode;
  /** 是否展示复制按钮；缺省在复制内容可推导时展示，传 false 关闭 */
  copyable?: boolean;
  /** 复制到剪贴板的文本；缺省取字符串形式的 value */
  copyText?: string;
  /** 单元格头部右侧的附加操作（如「查链路」） */
  extra?: ReactNode;
}

/** 是否渲染占位符：null / undefined / 空串视为空值 */
export function isEmptyDetailValue(value: ReactNode): boolean {
  return value === null || value === undefined || value === "";
}

/** 原始属性值的展示文本：对象序列化为 JSON，空值转占位符 */
export function formatDetailValue(value: unknown, emptyText: string = DETAIL_EMPTY_TEXT): string {
  if (value === null || value === undefined || value === "") return emptyText;
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

/** 复制内容：显式 copyText 优先，否则取字符串形式的 value；不可推导时返回 null */
export function resolveDetailCopyText(item: DetailGridItem): string | null {
  if (item.copyText !== undefined) {
    return item.copyText === "" ? null : item.copyText;
  }
  return typeof item.value === "string" && item.value !== "" ? item.value : null;
}
