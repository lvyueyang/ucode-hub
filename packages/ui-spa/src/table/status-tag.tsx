/**
 * 状态列通用展示：值 → 文案 + 语义色，避免各页自选 Tag 颜色
 *
 * 状态列的三种形态（见 docs/admin-design.md「状态列」）：
 * - 布尔状态（上架 / 启用）：用 `PublishSwitchCell` 在单元格内直接切换
 * - 枚举状态（多值，只读）：用 `StatusTag` 统一文案与语义色
 * - 枚举状态需要内联切换：用 antd `Select`（`variant="borderless"`）或 `Switch`，
 *   交互与失败回滚同 `PublishSwitchCell`（值未变不提交、乐观更新、失败回滚）
 */
import { Tag } from "antd";

/** 语义色调：映射到 antd Tag 的状态色预设，随主题与暗色自适应 */
export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

const TONE_COLOR: Record<StatusTone, string> = {
  success: "success",
  warning: "warning",
  danger: "error",
  info: "processing",
  neutral: "default",
};

/** 单个取值的展示配置 */
export interface StatusTagOption {
  /** 展示文案 */
  label: string;
  /** 语义色调，默认 neutral */
  tone?: StatusTone;
}

export interface StatusTagProps {
  /** 当前状态值（布尔 / 字符串 / 数字，按字符串匹配 options） */
  value: string | number | boolean;
  /** 值 → 展示配置；未命中时渲染 fallback */
  options: Record<string, StatusTagOption>;
  /** 未命中选项时的兜底文案，默认「—」 */
  fallback?: string;
  /** 兜底时的色调，默认 neutral */
  fallbackTone?: StatusTone;
}

export function StatusTag({
  value,
  options,
  fallback = "—",
  fallbackTone = "neutral",
}: StatusTagProps) {
  const option = options[String(value)];
  const tone = option?.tone ?? (option ? "neutral" : fallbackTone);
  return (
    <Tag color={TONE_COLOR[tone]} style={{ marginInlineEnd: 0 }}>
      {option?.label ?? fallback}
    </Tag>
  );
}
