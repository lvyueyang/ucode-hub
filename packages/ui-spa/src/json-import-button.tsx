/**
 * JSON 导入按钮组件：点击弹出 Modal，支持拖拽上传文件并在 JSON 编辑器中预览编辑
 * 继承 antd Button 全部属性，通过 onImport 回调传出 JSON 字符串
 */
import { UploadOutlined } from "@ant-design/icons";
import type { ButtonProps, UploadProps } from "antd";
import { Button, Modal, Space, Upload } from "antd";
import { useState } from "react";
import { message } from "./antd-static";
import { CodeEditor } from "./editor";

/** beforeUpload 回调的文件参数类型（取自 antd UploadProps，避免深路径导入内部类型） */
type BeforeUploadFile = Parameters<NonNullable<UploadProps["beforeUpload"]>>[0];

export interface JsonImportButtonProps extends ButtonProps {
  /** Modal 标题，默认 "导入 JSON" */
  title?: string;
  /** 确认导入回调，传入 JSON 字符串，支持同步或异步 */
  onImport: (jsonString: string) => void | Promise<void>;
  /** 导入成功提示文案，不传则不自动提示 */
  successMessage?: string;
}

export function JsonImportButton({
  title = "导入 JSON",
  onImport,
  successMessage,
  children,
  onClick,
  ...buttonProps
}: JsonImportButtonProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCancel = () => {
    setModalOpen(false);
    setJsonText("");
  };

  const handleConfirm = async () => {
    // 确认前校验 JSON 合法性
    try {
      JSON.parse(jsonText);
    } catch {
      message.error("JSON 格式无效，请检查后重试");
      return;
    }

    setLoading(true);
    try {
      await onImport(jsonText);
      if (successMessage) {
        message.success(successMessage);
      }
      handleCancel();
    } catch {
      // 导入失败的错误提示由宿主注入的 onImport 统一处理（项目内经 sfn-error helper），
      // 此处不重复提示；保持弹窗打开以便用户修正 JSON
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* 宿主传入的 onClick 必须先派发，避免被内部展开的处理器静默覆盖 */}
      <Button
        {...buttonProps}
        onClick={(event) => {
          onClick?.(event);
          setModalOpen(true);
        }}
      >
        {children}
      </Button>
      <Modal
        title={title}
        open={modalOpen}
        onCancel={handleCancel}
        width={720}
        destroyOnHidden
        footer={
          <Space>
            <Button onClick={handleCancel}>取消</Button>
            <Button type="primary" loading={loading} onClick={handleConfirm}>
              确定
            </Button>
          </Space>
        }
      >
        <Upload.Dragger
          accept=".json"
          showUploadList={false}
          beforeUpload={(file: BeforeUploadFile) => {
            const reader = new FileReader();
            reader.onload = (e) => {
              try {
                const text = e.target?.result as string;
                // 格式化后再展示，确保编辑器内容始终是合法的格式化 JSON
                const formatted = JSON.stringify(JSON.parse(text), null, 2);
                setJsonText(formatted);
              } catch {
                message.error("JSON 解析失败，请检查文件格式");
              }
            };
            reader.readAsText(file);
            return false;
          }}
          className="mb-4"
        >
          <UploadOutlined className="text-2xl" />
          <p className="mt-2">点击或拖拽 JSON 文件到此区域</p>
        </Upload.Dragger>
        <br />
        <CodeEditor language="json" value={jsonText} onChange={setJsonText} className="h-[500px]" />
      </Modal>
    </>
  );
}
