/**
 * 编辑器类型选择器：基于 antd Select，自动注入 EDITOR_TYPES 选项
 */

import { Select } from "antd";
import type { ComponentPropsWithoutRef } from "react";
import { EDITOR_TYPE_LABELS, EDITOR_TYPES } from "#/constants/editor-types";

type SelectProps = ComponentPropsWithoutRef<typeof Select>;

interface EditorTypeSelectProps extends Omit<SelectProps, "options"> {
  allowClear?: boolean;
  placeholder?: string;
}

export function EditorTypeSelect({
  placeholder = "选择编辑器类型",
  ...rest
}: EditorTypeSelectProps) {
  return (
    <Select
      placeholder={placeholder}
      options={EDITOR_TYPES.map((t) => ({
        label: EDITOR_TYPE_LABELS[t],
        value: t,
      }))}
      {...rest}
    />
  );
}
