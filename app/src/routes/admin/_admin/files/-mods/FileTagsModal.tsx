/**
 * 文件标签编辑弹窗：单字段快速修改（不必开抽屉）
 * 输入为 antd Select 的 tags 模式，粘贴「逗号 / 分号」分隔的文本会自动拆成多个标签；
 * 弹窗内展示目标文件名，避免在列表中误开错行（长文件名省略并以 Tooltip 显示全名）
 */
import { Form, Modal, Select, Typography } from "antd";
import { useEffect, useState } from "react";
import { FORM_MODAL_WIDTH } from "#/components/admin";
import { FILE_TAG_MAX_COUNT, FILE_TAG_MAX_LENGTH } from "#/services/file/file.schemas";
import type { FileRecord } from "#/services/file/file.server";
import { callSfn } from "#/utils/sfn-error";
import { updateFileTagsSFn } from "./files.functions";

interface FileTagsModalProps {
  /** 待编辑文件；null 表示关闭 */
  file: FileRecord | null;
  onClose: () => void;
  /** 保存成功后回调（刷新列表） */
  onSaved: () => void;
}

/** 把分隔符拼接的输入拆成标签数组（供 Select tags 模式的 tokenSeparators 使用） */
const TOKEN_SEPARATORS = [",", "，", ";", "；"];

export function FileTagsModal({ file, onClose, onSaved }: FileTagsModalProps) {
  const [tags, setTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // 打开时以服务端值为准回填
  useEffect(() => {
    setTags(file?.tags ?? []);
  }, [file]);

  const handleOk = async () => {
    if (!file) return;
    setSubmitting(true);
    try {
      await callSfn(updateFileTagsSFn({ data: { id: file.id, tags } }));
      onSaved();
      onClose();
    } catch {
      // callSfn 已提示
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={file !== null}
      title="编辑标签"
      width={FORM_MODAL_WIDTH.base}
      okText="保存"
      confirmLoading={submitting}
      onOk={() => void handleOk()}
      onCancel={onClose}
      destroyOnHidden
    >
      {/* 目标文件：与下方表单同为「标签在上、值在下」的纵向排布 */}
      {file && (
        <div className="mb-4">
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            文件名
          </Typography.Text>
          <Typography.Text ellipsis={{ tooltip: file.originalName }} style={{ display: "block" }}>
            {file.originalName}
          </Typography.Text>
        </div>
      )}
      <Form layout="vertical">
        <Form.Item
          label="标签"
          extra={`最多 ${FILE_TAG_MAX_COUNT} 个，单个不超过 ${FILE_TAG_MAX_LENGTH} 字符；可直接粘贴逗号分隔的文本`}
        >
          <Select
            mode="tags"
            value={tags}
            onChange={(next) => setTags(next as string[])}
            tokenSeparators={TOKEN_SEPARATORS}
            placeholder="输入后回车添加标签"
            open={false}
            suffixIcon={null}
            style={{ width: "100%" }}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
