/**
 * 毫秒时长输入组件：以可读时间字符串（如 "30s"、"10min"、"2h"、"1d"）展示与输入，
 * 对外暴露的值始终为毫秒数（number | null），可直接嵌入 antd Form.Item 受控使用
 */

import { format, parse, type StringValue } from "@ucode/hub-lib/ms";
import { Input, type InputProps, Tooltip } from "antd";
import { useEffect, useState } from "react";

/** 约束边界：毫秒数或可读时间字符串（如 "1s"） */
type Bound = number | StringValue;

interface MSInputProps extends Omit<InputProps, "value" | "onChange"> {
  /** 毫秒值 */
  value?: number | null;
  /** 输入合法且满足约束时触发；清空时回传 null */
  onChange?: (value: number | null) => void;
  /** 最小值（含），如 1000 或 "1s" */
  min?: Bound;
  /** 最大值（含），如 86400000 或 "1d" */
  max?: Bound;
  /** 为 true 时 0 不受 min 约束（适用于"0 表示不限制/使用默认"的场景） */
  allowZero?: boolean;
}

/** 解析约束边界为毫秒数；字符串不可解析时抛错（组件用法错误，fail-fast） */
function resolveBound(bound: Bound): number {
  if (typeof bound === "number") {
    return bound;
  }
  const value = parse(bound);
  if (Number.isNaN(value)) {
    throw new Error(`MSInput 约束边界无法解析：${JSON.stringify(bound)}`);
  }
  return value;
}

/** 毫秒转显示文本；format 四舍五入有损时回退为 "<n>ms" 原值格式，保证所见即所得 */
function toDisplayText(value: number): string {
  const text = format(value);
  return parse(text) === value ? text : `${value}ms`;
}

/** 文本转毫秒；包裹 parse 容错空串/超长串抛错，解析失败返回 NaN */
function safeParse(text: string): number {
  try {
    return parse(text);
  } catch {
    return NaN;
  }
}

/** 将毫秒值格式化为千分位展示（聚焦时 tooltip 的真实值预览） */
function toMsText(value: number): string {
  return `${value.toLocaleString("zh-CN")} ms`;
}

/** 组装约束提示文案，如 "最小 1s，最大 1d，0 表示不限制" */
function buildRangeText(minMs?: number, maxMs?: number, allowZero?: boolean): string {
  const parts: string[] = [];
  if (minMs !== undefined) {
    parts.push(`最小 ${toDisplayText(minMs)}`);
  }
  if (maxMs !== undefined) {
    parts.push(`最大 ${toDisplayText(maxMs)}`);
  }
  if (allowZero) {
    parts.push("0 表示不限制");
  }
  return parts.join("，");
}

/**
 * 毫秒时长输入组件
 * 支持 min/max 范围约束与 allowZero（0 豁免最小值）；聚焦时 tooltip 显示真实毫秒值或错误原因
 */
export function MSInput({
  value = null,
  onChange,
  min,
  max,
  allowZero,
  onBlur,
  ...rest
}: MSInputProps) {
  const minMs = min === undefined ? undefined : resolveBound(min);
  const maxMs = max === undefined ? undefined : resolveBound(max);

  const [text, setText] = useState(() => (value == null ? "" : toDisplayText(value)));

  // 外部值变化（如表单重置）时同步文本；当前文本与外部值解析一致时保留原文本，不打断中间输入态
  useEffect(() => {
    setText((prev) => {
      const trimmed = prev.trim();
      const prevParsed = trimmed === "" ? null : (safeParse(trimmed) as number | null);
      if (prevParsed === value) {
        return prev;
      }
      return value == null ? "" : toDisplayText(value);
    });
  }, [value]);

  /** 校验解析值是否满足范围约束 */
  const inRange = (parsed: number): boolean => {
    if (allowZero && parsed === 0) {
      return true;
    }
    if (minMs !== undefined && parsed < minMs) {
      return false;
    }
    if (maxMs !== undefined && parsed > maxMs) {
      return false;
    }
    return true;
  };

  const trimmed = text.trim();
  const parsed = trimmed === "" ? null : (safeParse(trimmed) as number | null);
  // 错误态派生：非空且（无法解析 或 超出约束）
  const hasError = trimmed !== "" && (parsed === null || Number.isNaN(parsed) || !inRange(parsed));

  // 聚焦 tooltip 内容随输入实时派生：真实毫秒值 / 格式提示 / 越界提示
  let tooltipTitle: string | undefined;
  if (trimmed !== "") {
    if (parsed === null || Number.isNaN(parsed)) {
      tooltipTitle = "无法识别的时长格式，支持 30s、10min、2h、1d 等";
    } else if (!inRange(parsed)) {
      tooltipTitle = `超出允许范围：${buildRangeText(minMs, maxMs, allowZero)}`;
    } else {
      // 展示取整后的实际存储值，与 onChange 输出保持一致
      tooltipTitle = toMsText(Math.round(parsed));
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setText(raw);
    const t = raw.trim();
    if (t === "") {
      onChange?.(null);
      return;
    }
    const p = safeParse(t);
    // 无法解析或越界：仅红框提示，不触发 onChange，保留旧值
    if (Number.isNaN(p) || !inRange(p)) {
      return;
    }
    // 取整对齐服务端 zod int() 校验（如 "1.5ms" 输入）
    onChange?.(Math.round(p));
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    // 合法输入失焦时规整为标准格式（如 "1  h" → "1h"）；非法输入保留原文 + 红框
    if (!hasError) {
      setText(value == null ? "" : toDisplayText(value));
    }
    onBlur?.(e);
  };

  return (
    <Tooltip trigger="focus" title={tooltipTitle} mouseEnterDelay={0.2} placement="topLeft">
      <Input
        {...rest}
        value={text}
        status={hasError ? "error" : undefined}
        placeholder="如 30s、10min、2h、1d"
        onChange={handleChange}
        onBlur={handleBlur}
      />
    </Tooltip>
  );
}
