/**
 * 字典标签 Tag 组件
 * 根据 dictSlug 从 zustand store 获取字典选项，按 value 匹配显示标签和颜色
 */
import { Tag } from "antd";
import { useAdminDictStore } from "#/components/admin/stores/admin-dict-store";

interface DictTagProps {
  /** 字典标识 */
  dictSlug: string;
  /** 当前值 */
  value: string;
}

export function DictTag({ dictSlug, value }: DictTagProps) {
  const options = useAdminDictStore((s) => s.dicts[dictSlug] ?? []);
  const item = options.find((o) => o.value === value);
  return <Tag color={item?.color ?? undefined}>{item?.label || value}</Tag>;
}
