/**
 * 表单弹窗：管理端「字段较少的单对象新建 / 编辑」承载容器（与 AdminFormDrawer 对称）
 *
 * 容器选择：字段少、无富文本 / 图片墙 / 多区块 → 本组件；否则用 AdminFormDrawer。
 * 与表单解耦：传 `formId` 时底部主按钮以 `htmlType="submit" form={formId}` 触发表单提交
 * （表单侧配合 `formId` / `hideActions` / `onSubmittingChange`）；传 `onOk` 时由调用方自行提交。
 * 固定 `destroyOnHidden`：隐藏即卸载，避免残留校验态；表单初值由调用方在打开时装配。
 * 主体内表单不再手写外边距（弹窗 body 已含 24px 内边距）。
 */
import { Modal } from "antd";
import type { ReactNode } from "react";

/** 弹窗宽度档位：确认 / 单字段 420，常规表单 520，较宽表单 640 */
export const FORM_MODAL_WIDTH = {
  sm: 420,
  base: 520,
  wide: 640,
} as const;

/** 提交方式二选一：formId 触发内部表单提交，或 onOk 交给调用方 */
type SubmitProp = { formId: string; onOk?: never } | { onOk: () => void; formId?: never };

/** 标题来源：按实体名生成，或直接指定（如「重置密码 — admin」） */
type TitleProp = { entityName: string; title?: string } | { entityName?: never; title: string };

type AdminFormModalProps = {
  open: boolean;
  onClose: () => void;
  /** 编辑态记录 id；有值即编辑，无值即新建（标题按「编辑/新建 + 实体名」生成） */
  id?: string | null;
  /** 提交中（控制主按钮 loading） */
  submitting?: boolean;
  width?: (typeof FORM_MODAL_WIDTH)[keyof typeof FORM_MODAL_WIDTH];
  okText?: string;
  children: ReactNode;
} & SubmitProp &
  TitleProp;

export function AdminFormModal(props: AdminFormModalProps) {
  const {
    open,
    onClose,
    title,
    id,
    submitting,
    width = FORM_MODAL_WIDTH.base,
    okText = "保存",
    children,
  } = props;
  const entityName = "entityName" in props ? props.entityName : undefined;
  const formId = "formId" in props ? props.formId : undefined;
  const onOk = "onOk" in props ? props.onOk : undefined;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={title ?? `${id ? "编辑" : "新建"}${entityName ?? ""}`}
      width={width}
      centered
      destroyOnHidden
      confirmLoading={submitting}
      okText={okText}
      okButtonProps={formId ? { htmlType: "submit", form: formId } : undefined}
      onOk={onOk}
    >
      {children}
    </Modal>
  );
}
