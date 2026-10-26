/**
 * 表格内联编辑单元格：通用态（排序权重 / 上架状态）在单元格内直接修改
 *
 * 两个组件均为纯 UI：不接触 SFn / message，提交动作由页面注入（onSubmit / onToggle），
 * 错误由调用方的统一出口（callSfn / sfnUnwrap）提示，本组件只负责交互与失败回滚。
 *
 * 交互约定：
 * - 排序：失焦或回车提交，值未变更不发请求（点分页、点开其他单元格都会触发 blur）
 * - 上架：切换即提交并乐观更新，失败回滚到上一次的服务端值
 * - 行内 in-flight 期间控件禁用，避免连点产生乱序响应
 */
import { InputNumber, Switch } from "antd";
import { useEffect, useRef, useState } from "react";
import { withDisabledReason } from "./table-operate";

/** 排序单元格 Props */
export interface SortOrderCellProps {
  /** 当前排序值（服务端值） */
  value: number;
  /**
   * 提交动作；失败时向上抛出即可（错误已由调用方出口提示），
   * 本组件会捕获并把显示回滚为 value
   */
  onSubmit: (next: number) => void | Promise<void>;
  min?: number;
  max?: number;
  disabled?: boolean;
  disabledReason?: string;
}

/**
 * 排序权重单元格：失焦 / 回车提交
 * 常用于「数字越大越靠前」的列表排序，避免为改一个数字打开编辑抽屉
 */
export function SortOrderCell({
  value,
  onSubmit,
  min = 0,
  max = 9999,
  disabled,
  disabledReason,
}: SortOrderCellProps) {
  const [draft, setDraft] = useState<number | null>(value);
  const [submitting, setSubmitting] = useState(false);
  /** 提交基线：连点/并发时以最后一次服务端值为回滚基准 */
  const baselineRef = useRef(value);

  // 外部值变化（保存成功后的列表刷新）同步草稿
  useEffect(() => {
    baselineRef.current = value;
    setDraft(value);
  }, [value]);

  const commit = async () => {
    const next = draft;
    if (next === null || next === baselineRef.current) return;
    setSubmitting(true);
    try {
      await onSubmit(next);
      baselineRef.current = next;
    } catch {
      // 错误已由调用方统一提示，这里只回滚显示
      setDraft(baselineRef.current);
    } finally {
      setSubmitting(false);
    }
  };

  const cell = (
    <InputNumber
      size="small"
      value={draft}
      min={min}
      max={max}
      step={1}
      precision={0}
      disabled={disabled || submitting}
      style={{ width: 78 }}
      onChange={(next) => setDraft(next)}
      onBlur={() => void commit()}
      onPressEnter={() => void commit()}
    />
  );

  return withDisabledReason(cell, disabled, disabledReason);
}

/** 上架状态单元格 Props */
export interface PublishSwitchCellProps {
  /** 当前是否已上架（服务端值） */
  published: boolean;
  /** 切换动作；失败时向上抛出即可（错误已由调用方出口提示），本组件会回滚开关 */
  onToggle: (next: boolean) => void | Promise<void>;
  /** 嵌在开关轨道内的文案：默认 已上架 / 未上架（news 等用「已发布 / 未发布」） */
  labels?: { on: string; off: string };
  disabled?: boolean;
  disabledReason?: string;
}

/**
 * 上架状态单元格：切换即提交（乐观更新 + 失败回滚）
 *
 * 状态文案经 antd Switch 的 `checkedChildren` / `unCheckedChildren` 嵌在轨道内，
 * 不再额外渲染并排文本：轨道宽度取两段文案的较大值，`loading` 期间 antd 会自动
 * 置为禁用并隐藏文案（宽度不跳动），因此无需自己叠加 disabled。
 * 用 `size="small"`：与 SortOrderCell 的小号输入框一致，且能把状态列压在 100px 内不溢出。
 */
export function PublishSwitchCell({
  published,
  onToggle,
  labels,
  disabled,
  disabledReason,
}: PublishSwitchCellProps) {
  const [checked, setChecked] = useState(published);
  const [submitting, setSubmitting] = useState(false);
  const baselineRef = useRef(published);

  useEffect(() => {
    baselineRef.current = published;
    setChecked(published);
  }, [published]);

  const handleChange = async (next: boolean) => {
    setChecked(next);
    setSubmitting(true);
    try {
      await onToggle(next);
      baselineRef.current = next;
    } catch {
      // 错误已由调用方统一提示，这里只回滚开关
      setChecked(baselineRef.current);
    } finally {
      setSubmitting(false);
    }
  };

  const cell = (
    <Switch
      size="small"
      checked={checked}
      loading={submitting}
      disabled={disabled}
      checkedChildren={labels?.on ?? "已上架"}
      unCheckedChildren={labels?.off ?? "未上架"}
      onChange={(next) => void handleChange(next)}
    />
  );

  return withDisabledReason(cell, disabled, disabledReason);
}
