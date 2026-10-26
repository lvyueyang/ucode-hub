/**
 * 字典选项 Select 组件
 * 根据 dictSlug 从 zustand store 获取字典选项，渲染 antd Select
 */
import type { SelectProps } from "antd";
import { Button, Divider, Flex, Select } from "antd";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { useAdminDictStore } from "#/components/admin/stores/admin-dict-store";

interface DictSelectProps extends Omit<SelectProps, "options"> {
  /** 字典标识 */
  dictSlug: string;
  /** 排除的选项值（如创建模式下排除 "archived"） */
  excludeValues?: string[];
}

export function DictSelect({ dictSlug, excludeValues, ...rest }: DictSelectProps) {
  const allOptions = useAdminDictStore((s) => s.dicts[dictSlug] ?? []);
  const refresh = useAdminDictStore((s) => s.refresh);
  const loading = useAdminDictStore((s) => s.loading);

  const options = useMemo(() => {
    if (!excludeValues?.length) return allOptions;
    const excludeSet = new Set(excludeValues);
    return allOptions.filter((o) => !excludeSet.has(o.value));
  }, [allOptions, excludeValues]);

  return (
    <Select
      {...rest}
      options={options}
      loading={loading}
      popupRender={(menu: ReactNode) => {
        return (
          <>
            {menu}
            <Divider size="small" />
            <Flex justify="flex-end">
              <Button
                type="primary"
                size="small"
                onClick={() => {
                  refresh();
                }}
              >
                刷新
              </Button>
            </Flex>
          </>
        );
      }}
    />
  );
}
