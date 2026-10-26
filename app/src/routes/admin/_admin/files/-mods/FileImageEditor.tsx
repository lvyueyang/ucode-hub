/**
 * 文件图片编辑器宿主：包内只提供编辑内容区，弹窗容器、主题与「覆盖原图 / 另存为新文件」落库由宿主负责
 */
import { SaveOutlined, SwapOutlined } from "@ant-design/icons";
import { formatToExtension, type ImageProcessResult, mimeTypeToFormat } from "@easyx/image-toolkit";
import { configureImageEngine, ImageEditor, type ImageEditorResult } from "@easyx/image-toolkit/ui";
import { formatBytes } from "@ucode/hub-lib/format-bytes";
import { message } from "@ucode/hub-ui-spa/antd-static";
import { Button, Checkbox, Modal, Space, Tooltip, Typography } from "antd";
import { useEffect, useState } from "react";
import { useAdminConfigStore } from "#/components/admin/stores";
import { replaceFileContentSFn, uploadFileSFn } from "#/services/file/file.functions";
import type { FileRecord } from "#/services/file/file.server";
import { callSfn } from "#/utils/sfn-error";

/** 把处理结果包装成可上传的文件对象（slice 复制出独立 ArrayBuffer 以满足 BlobPart 类型） */
function toFile(result: ImageProcessResult, name: string): File {
  return new File([result.data.slice()], name, { type: result.mimeType });
}

/** 另存为文件名：保留原名主干，后缀跟随处理结果格式（如 照片.png → 照片-edited.webp） */
function buildSaveAsName(fileName: string, mimeType: string): string {
  const base = fileName.replace(/\.[^./\\]+$/, "");
  const format = mimeTypeToFormat(mimeType);
  return `${base}-edited${format ? formatToExtension(format) : ""}`;
}

export interface FileImageEditorProps {
  /** 待编辑的文件；null 表示关闭 */
  file: FileRecord | null;
  onClose: () => void;
  /** 保存成功后的刷新回调 */
  onSaved: () => void;
}

export function FileImageEditor({ file, onClose, onSaved }: FileImageEditorProps) {
  // 客户端可见配置中的 wasm 地址；未配置时引擎回退到本地打包资源
  const wasmUrl = useAdminConfigStore((state) => state.config.image_engine_wasm_url);
  /** 编辑内容区状态：result 为 null 表示当前设置无实际变更、尚不可保存 */
  const [preview, setPreview] = useState<ImageEditorResult | null>(null);
  const [saving, setSaving] = useState(false);
  /** 覆盖前是否把原图另存为备份文件 */
  const [backupOriginal, setBackupOriginal] = useState(false);

  useEffect(() => {
    configureImageEngine({ wasmUrl });
  }, [wasmUrl]);

  // 切换目标文件时清空上一次的处理结果与选项。
  // 保留组件实例（不靠父级 key 重建），关闭时才有出场动画；关闭态（file=null）无需重置。
  useEffect(() => {
    if (!file) return;
    setPreview(null);
    setBackupOriginal(false);
  }, [file]);

  const result = preview?.result ?? null;
  const canSave = !!file && !!result && !preview?.pending && !saving;

  /** 覆盖原图：服务端以魔数嗅探为准重新判定类型与尺寸，可选先把原图另存为备份 */
  const handleReplace = async () => {
    if (!file || !result) return;
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("id", file.id);
      formData.append("file", toFile(result, file.originalName));
      formData.append("width", String(result.meta.width));
      formData.append("height", String(result.meta.height));
      formData.append("backup", backupOriginal ? "true" : "false");
      const res = await callSfn(replaceFileContentSFn({ data: formData }));
      message.success(
        res.data.backup
          ? `已覆盖原图，原图已备份为「${res.data.backup.originalName}」`
          : "已覆盖原图",
      );
      onSaved();
    } catch {
      // callSfn 已统一提示
    } finally {
      setSaving(false);
    }
  };

  /** 另存为新文件：复用上传链路，保留原文件 */
  const handleSaveAsNew = async () => {
    if (!file || !result) return;
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("file", toFile(result, buildSaveAsName(file.originalName, result.mimeType)));
      formData.append("permanent", "true");
      await callSfn(uploadFileSFn({ data: formData }));
      message.success("已另存为新文件");
      onSaved();
    } catch {
      // callSfn 已统一提示
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={file !== null}
      title={file ? `编辑图片 · ${file.originalName}` : "编辑图片"}
      width="min(1280px, 92vw)"
      centered
      destroyOnHidden
      onCancel={onClose}
      // 内容区与底部动作栏的默认间距（8px）过近，显式拉开
      styles={{ footer: { marginTop: 20 } }}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <Space size={16} align="center">
            <Checkbox
              checked={backupOriginal}
              onChange={(event) => setBackupOriginal(event.target.checked)}
            >
              覆盖前备份原图
            </Checkbox>
            {result && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                处理后 {formatBytes(result.sizeAfter)}（原 {formatBytes(result.sizeBefore)}）
              </Typography.Text>
            )}
          </Space>
          <Space size={8}>
            <Button onClick={onClose}>取消</Button>
            {/* 覆盖为不可逆操作，风险提示与包内旧版一致 */}
            <Tooltip
              title={
                backupOriginal
                  ? "覆盖后原图不可恢复；已勾选备份，会先把原图另存为新文件"
                  : "覆盖后原图不可恢复，已引用该图的位置会同步变化；可勾选「覆盖前备份原图」留底"
              }
            >
              <Button
                icon={<SwapOutlined />}
                disabled={!canSave}
                loading={saving}
                onClick={() => void handleReplace()}
              >
                覆盖原图
              </Button>
            </Tooltip>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              disabled={!canSave}
              loading={saving}
              onClick={() => void handleSaveAsNew()}
            >
              另存为新文件
            </Button>
          </Space>
        </div>
      }
    >
      {file && <ImageEditor src={`/file/r/${file.id}`} onResultChange={setPreview} />}
    </Modal>
  );
}
