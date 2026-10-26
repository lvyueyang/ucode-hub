/**
 * 权限码 Tag 列组件：通配权限绿色、单个权限蓝色
 * 超过 maxVisible 个时折叠为 +N，Popover 悬浮展示全部
 */
import { Popover, Tag } from "antd";

/** 权限码元信息（name 为显示名） */
export type PermissionMetaMap = Record<string, { name: string }>;

interface PermissionTagsProps {
  /** 权限码列表 */
  permissions: string[];
  /** 权限码 → 元信息映射（PERMISSION_META / CLIENT_PERMISSION_META） */
  meta: PermissionMetaMap;
  /** 最多直接展示的 Tag 数，超出折叠，默认 2 */
  maxVisible?: number;
}

/** 权限码格式化：通配符 xxx:* 显示为 xxx(*)，其余查元信息名称 */
function formatCode(code: string, meta: PermissionMetaMap): string {
  if (code.endsWith(":*")) {
    return `${code.slice(0, -2)}(*)`;
  }
  return meta[code]?.name ?? code;
}

/** 权限 Tag 列渲染：通配符优先排序，绿色标识 */
export function PermissionTags({ permissions, meta, maxVisible = 2 }: PermissionTagsProps) {
  if (permissions.length === 0) {
    return <span className="text-muted-foreground text-xs">无权限</span>;
  }

  const wildcards = permissions.filter((p) => p.endsWith(":*")).sort();
  const individuals = permissions.filter((p) => !p.endsWith(":*")).sort();
  const sorted = [...wildcards, ...individuals];

  const renderTag = (code: string) => (
    <Tag key={code} color={code.endsWith(":*") ? "green" : "blue"} className="text-xs">
      {formatCode(code, meta)}
    </Tag>
  );

  const visible = sorted.slice(0, maxVisible);
  const overflow = sorted.length - maxVisible;
  const tagList = visible.map(renderTag);

  if (overflow <= 0) {
    return <div className="flex flex-wrap gap-1">{tagList}</div>;
  }

  tagList.push(
    <Tag key="overflow" className="text-xs">
      +{overflow}
    </Tag>,
  );

  return (
    <Popover
      trigger={["hover", "click"]}
      content={<div className="flex flex-wrap gap-1 max-w-xs">{sorted.map(renderTag)}</div>}
    >
      {/* 用 button 承载触发器：键盘可聚焦，配合 click 触发让键盘用户也能展开溢出项 */}
      <button
        type="button"
        className="flex flex-wrap gap-1 cursor-pointer"
        style={{ border: "none", background: "transparent", padding: 0 }}
      >
        {tagList}
      </button>
    </Popover>
  );
}
