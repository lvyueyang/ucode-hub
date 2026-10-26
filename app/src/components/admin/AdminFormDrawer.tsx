/**
 * 表单抽屉：管理端「新建 / 编辑」的承载容器
 *
 * 与表单组件解耦：抽屉内放任意 `XxxForm`。
 * - 传 `formId`：表单以 `id` 标记其 <form>，抽屉渲染吸底 footer 并据此触发提交
 *   （表单侧需配合 `formId` / `hideActions` / `onSubmittingChange` 三个可选 prop）
 * - 不传：抽屉不渲染 footer，由表单自带操作按钮（兼容既有 `XxxForm` 实现）
 *
 * 固定 destroyOnHidden：隐藏即卸载，避免富文本等组件在 display:none 容器中挂载
 * 拿到 0 尺寸导致工具栏/内容区渲染异常，也避免残留校验态。
 */
import { Button, Drawer } from "antd";
import type { ReactNode } from "react";

/** 抽屉宽度档位：基础表单 640 / 含图片墙等中等表单 760 / 强编辑场景（富文本）按视口比例 */
export const FORM_DRAWER_WIDTH = {
  base: 640,
  wide: 760,
  /** 强编辑场景（富文本 + 图片墙）：1440 视口下约 864px，此前取 40% 反而窄于 base */
  full: "60%",
} as const;

interface AdminFormDrawerProps {
  open: boolean;
  onClose: () => void;
  /** 实体中文名，用于生成「新建 X」「编辑 X」标题 */
  entityName: string;
  /** 编辑态记录 id；有值即编辑，无值即新建 */
  id?: string | null;
  /** 表单 <form id>：传入即渲染吸底 footer，主按钮据此提交 */
  formId?: string;
  /** 提交中（控制主按钮 loading） */
  submitting?: boolean;
  width?: (typeof FORM_DRAWER_WIDTH)[keyof typeof FORM_DRAWER_WIDTH];
  okText?: string;
  children: ReactNode;
}

export function AdminFormDrawer({
  open,
  onClose,
  entityName,
  id,
  formId,
  submitting,
  width = FORM_DRAWER_WIDTH.base,
  okText = "保存",
  children,
}: AdminFormDrawerProps) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`${id ? "编辑" : "新建"}${entityName}`}
      width={width}
      destroyOnHidden
      footer={
        formId ? (
          <div className="flex justify-end gap-2">
            <Button onClick={onClose}>取消</Button>
            <Button type="primary" htmlType="submit" form={formId} loading={submitting}>
              {okText}
            </Button>
          </div>
        ) : null
      }
    >
      {children}
    </Drawer>
  );
}
