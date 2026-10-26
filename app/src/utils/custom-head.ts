/**
 * 自定义 head 配置解析：将管理端配置的 JSON 字符串解析为 head 标签结构
 * 非法 JSON 或结构不符时告警并返回空配置，避免影响页面渲染
 */

import type { JSX } from "react";
import { z } from "zod";

/** 自定义 head 配置结构（对齐 TanStack Router head() 返回值的标签属性类型） */
export interface CustomHeadConfig {
  meta?: Array<JSX.IntrinsicElements["meta"]>;
  links?: Array<JSX.IntrinsicElements["link"]>;
  scripts?: Array<JSX.IntrinsicElements["script"]>;
  styles?: Array<JSX.IntrinsicElements["style"]>;
}

/** 空配置，解析失败时的兜底值 */
const EMPTY_HEAD_CONFIG: CustomHeadConfig = {};

/**
 * meta/link 项校验：二者为自闭合 void 元素，渲染侧出现非空的
 * children / dangerouslySetInnerHTML 会让 react-dom SSR 直接抛异常
 * 导致整站渲染失败，这里提前拦截
 */
const voidElementItemsSchema = (field: string) =>
  z.array(
    z
      .record(z.string(), z.unknown())
      .refine(
        (item) => item.children === undefined && item.dangerouslySetInnerHTML === undefined,
        `${field} 不允许 children / dangerouslySetInnerHTML`,
      ),
  );

/**
 * script/style 项校验：children 须为字符串（内联代码）；渲染侧 children 与
 * dangerouslySetInnerHTML 互斥，且后者必须为 { __html } 形式，否则 react-dom
 * SSR 会抛异常导致整站渲染失败，这里提前拦截
 */
const childrenAwareHeadItemsSchema = (field: string) =>
  z.array(
    z.record(z.string(), z.unknown()).refine((item) => {
      const hasChildren = item.children !== undefined;
      const hasDangerous = item.dangerouslySetInnerHTML !== undefined;
      const dangerousValid =
        typeof item.dangerouslySetInnerHTML === "object" &&
        item.dangerouslySetInnerHTML !== null &&
        "__html" in item.dangerouslySetInnerHTML;
      return (
        (!hasChildren || typeof item.children === "string") &&
        (!hasDangerous || (!hasChildren && dangerousValid))
      );
    }, `${field} 格式不合法（children 须为字符串，且与 dangerouslySetInnerHTML 互斥）`),
  );

const customHeadConfigSchema = z.object({
  meta: voidElementItemsSchema("meta").optional(),
  links: voidElementItemsSchema("links").optional(),
  scripts: childrenAwareHeadItemsSchema("scripts").optional(),
  styles: childrenAwareHeadItemsSchema("styles").optional(),
});

/**
 * 解析自定义 head 配置 JSON 字符串
 * 非法 JSON 或结构不符时告警并返回空配置，避免影响页面渲染
 */
export function parseCustomHeadConfig(raw: string | undefined): CustomHeadConfig {
  if (!raw) return EMPTY_HEAD_CONFIG;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn("[head-config] 自定义 head 配置不是合法 JSON，已忽略");
    return EMPTY_HEAD_CONFIG;
  }

  const result = customHeadConfigSchema.safeParse(parsed);
  if (!result.success) {
    console.warn(
      "[head-config] 自定义 head 配置结构不合法，已忽略",
      JSON.stringify(result.error.issues),
    );
    return EMPTY_HEAD_CONFIG;
  }

  return result.data as CustomHeadConfig;
}
