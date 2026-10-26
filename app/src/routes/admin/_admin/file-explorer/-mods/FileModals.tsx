/**
 * 资源管理器弹窗：新建目录、重命名、文本预览
 */
import { Input, Modal } from "antd";
import type { ChangeEvent } from "react";
import { FORM_MODAL_WIDTH } from "#/components/admin";

interface MkdirModalProps {
  open: boolean;
  value: string;
  loading: boolean;
  onChange: (value: string) => void;
  onOk: () => void;
  onCancel: () => void;
}

export function MkdirModal({ open, value, loading, onChange, onOk, onCancel }: MkdirModalProps) {
  return (
    <Modal
      open={open}
      title="新建目录"
      width={FORM_MODAL_WIDTH.base}
      okText="创建"
      cancelText="取消"
      confirmLoading={loading}
      onOk={onOk}
      onCancel={onCancel}
      destroyOnHidden
      styles={{ body: { paddingBottom: 8 } }}
    >
      <Input
        placeholder="请输入目录名称"
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        onPressEnter={onOk}
      />
    </Modal>
  );
}

interface RenameModalProps {
  open: boolean;
  value: string;
  loading: boolean;
  onChange: (value: string) => void;
  onOk: () => void;
  onCancel: () => void;
}

export function RenameModal({ open, value, loading, onChange, onOk, onCancel }: RenameModalProps) {
  return (
    <Modal
      open={open}
      title="重命名"
      width={FORM_MODAL_WIDTH.base}
      okText="确认"
      cancelText="取消"
      confirmLoading={loading}
      onOk={onOk}
      onCancel={onCancel}
      destroyOnHidden
      styles={{ body: { paddingBottom: 8 } }}
    >
      <Input
        placeholder="请输入新名称"
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        onPressEnter={onOk}
      />
    </Modal>
  );
}

interface PreviewModalProps {
  open: boolean;
  title: string;
  content: string;
  loading: boolean;
  onCancel: () => void;
}

/** 文本文件内容预览弹窗 */
export function PreviewModal({ open, title, content, loading, onCancel }: PreviewModalProps) {
  return (
    <Modal
      open={open}
      title={title}
      footer={null}
      width="75%"
      onCancel={onCancel}
      destroyOnHidden
      styles={{ body: { padding: 0 } }}
    >
      {loading ? (
        <div
          style={{
            textAlign: "center",
            padding: 60,
            color: "var(--ant-color-text-tertiary)",
          }}
        >
          加载中...
        </div>
      ) : (
        <pre
          style={{
            maxHeight: "72vh",
            overflow: "auto",
            background: "var(--s-surface-tertiary)",
            color: "var(--s-text)",
            padding: 20,
            fontSize: 13,
            lineHeight: 1.7,
            margin: 0,
            borderRadius: 0,
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            fontFamily: "'SF Mono', 'Cascadia Code', 'Consolas', monospace",
          }}
        >
          {content}
        </pre>
      )}
    </Modal>
  );
}
