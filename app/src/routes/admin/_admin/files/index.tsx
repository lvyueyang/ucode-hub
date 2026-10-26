/**
 * 文件管理页面：上传、列表、标签、下载、删除、秒传
 */
import { ClockCircleOutlined, CloudUploadOutlined, EditOutlined } from "@ant-design/icons";
import { isImageMimeType, isProcessableMimeType } from "@easyx/image-toolkit";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { message } from "@ucode/hub-ui-spa/antd-static";
import { ProTable } from "@ucode/hub-ui-spa/table";
import type { UploadProps } from "antd";
import { Button, Col, Input, Modal, Row, Upload } from "antd";
import { useCallback, useRef, useState } from "react";
import { AdminFilterItem, AdminFilters, AdminListPage } from "#/components/admin";
import { getFileListSFn, uploadFileSFn } from "#/services/file/file.functions";
import type { FileRecord } from "#/services/file/file.server";
import { callSfn, sfnUnwrap } from "#/utils/sfn-error";
import { useListQuery } from "#/utils/use-list-query";
import { FileImageEditor } from "./-mods/FileImageEditor";
import { FileTagsModal } from "./-mods/FileTagsModal";
import { deleteFileSFn, makePermanentSFn } from "./-mods/files.functions";
import { createFilesColumns, renderFileDetailPanel } from "./-mods/filesColumns";

/** 列表筛选条件 */
interface FileFilters {
  status: "" | "temp" | "permanent";
  keyword: string;
  /** 标签关键词（独立于 keyword，避免文件名搜索与标签搜索相互干扰） */
  tag: string;
}

export const Route = createFileRoute("/admin/_admin/files/")({
  component: FilesPage,
  loader: async () => await getFileListSFn({ data: {} }),
});

function FilesPage() {
  const router = useRouter();
  const initialData = Route.useLoaderData();
  const uploadingCountRef = useRef(0);
  const [uploading, setUploading] = useState(false);
  /** 搜索框的本地输入值（点搜索才应用到查询条件） */
  const [keywordInput, setKeywordInput] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [previewFile, setPreviewFile] = useState<FileRecord | null>(null);
  /** 待编辑图片（非 null 时打开图片编辑器） */
  const [editingFile, setEditingFile] = useState<FileRecord | null>(null);
  /** 待编辑标签的文件（非 null 时打开标签弹窗） */
  const [taggingFile, setTaggingFile] = useState<FileRecord | null>(null);

  const list = useListQuery<FileRecord, FileFilters>({
    initial: initialData,
    initialFilters: { status: "", keyword: "", tag: "" },
    errorMessage: "加载文件列表失败",
    // 状态列头漏斗 → 业务条件（值未变化时 hook 视为无筛选变更，不会重置页码）
    mapColumnFilters: (columnFilters) => ({
      status: (columnFilters.status?.[0] as FileFilters["status"]) ?? "",
    }),
    fetcher: useCallback(
      ({ page, pageSize, sortField, sortOrder, filters }) =>
        getFileListSFn({
          data: {
            status: filters.status || undefined,
            keyword: filters.keyword || undefined,
            tag: filters.tag || undefined,
            sortField,
            sortOrder,
            page,
            pageSize,
          },
        }),
      [],
    ),
  });

  /** 上传核心逻辑（支持多文件并行上传） */
  const doUpload = async (
    file: File,
    permanent: boolean,
    onSuccess?: (body: unknown) => void,
    onError?: (err: Error) => void,
  ) => {
    uploadingCountRef.current++;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("permanent", permanent ? "true" : "false");
      const result = await callSfn(uploadFileSFn({ data: fd }));
      if (result.success) {
        onSuccess?.(result.data);
      } else {
        onError?.(new Error("上传失败"));
      }
    } catch (err) {
      // callSfn 已统一提示；保留排查日志，并通知 antd Upload 标记失败项
      console.error("[文件上传失败]", err);
      onError?.(err as Error);
    } finally {
      uploadingCountRef.current--;
      if (uploadingCountRef.current === 0) {
        setUploading(false);
        message.success("上传完成");
        await list.reload();
        await router.invalidate();
      }
    }
  };

  /** 临时文件上传 */
  const tempRequest: UploadProps["customRequest"] = async (options) => {
    const { file, onSuccess, onError } = options;
    await doUpload(file as File, false, onSuccess, onError);
  };

  /** 永久文件上传 */
  const permanentRequest: UploadProps["customRequest"] = async (options) => {
    const { file, onSuccess, onError } = options;
    await doUpload(file as File, true, onSuccess, onError);
  };

  /** 临时文件转永久（失败由统一出口提示） */
  const handleMakePermanent = async (record: FileRecord) => {
    const [, err] = await sfnUnwrap(makePermanentSFn({ data: { id: record.id } }), {
      error: "转为永久失败",
    });
    if (err) return;
    message.success("已转为永久");
    await list.reload();
  };

  /** 删除文件（失败由统一出口提示） */
  const handleDelete = async (record: FileRecord) => {
    const [, err] = await sfnUnwrap(deleteFileSFn({ data: { id: record.id } }), {
      error: "删除失败",
    });
    if (err) return;
    message.success("已删除");
    await list.reload();
  };

  /** 重置全部筛选条件 */
  const handleReset = () => {
    setKeywordInput("");
    setTagInput("");
    list.applyFilters({ status: "", keyword: "", tag: "" });
  };

  const columns = createFilesColumns(
    {
      onPreview: setPreviewFile,
      onEdit: setEditingFile,
      onEditTags: setTaggingFile,
      onMakePermanent: handleMakePermanent,
      onDelete: handleDelete,
    },
    { statusFilter: list.filters.status },
  );

  return (
    <AdminListPage
      title="文件管理"
      description="支持文件名 / 文件 ID 与标签检索；临时文件 7 天后自动清理"
      stats={
        // 双路上传区：永久 / 临时
        <Row gutter={16}>
          <Col span={12}>
            <Upload.Dragger
              customRequest={permanentRequest}
              showUploadList={true}
              multiple
              disabled={uploading}
              className="compact-dragger"
            >
              <p className="ant-upload-text">
                <CloudUploadOutlined style={{ marginRight: 6 }} />
                永久文件上传
              </p>
            </Upload.Dragger>
          </Col>
          <Col span={12}>
            <Upload.Dragger
              customRequest={tempRequest}
              showUploadList={true}
              multiple
              disabled={uploading}
              className="compact-dragger"
            >
              <p className="ant-upload-text">
                <ClockCircleOutlined style={{ marginRight: 6 }} />
                临时文件上传（7 天后过期）
              </p>
            </Upload.Dragger>
          </Col>
        </Row>
      }
      filters={
        <AdminFilters
          onReset={handleReset}
          moreCount={tagInput ? 1 : 0}
          more={
            <AdminFilterItem label="按标签搜索">
              <Input.Search
                className="w-full"
                placeholder="标签名（支持片段匹配）"
                allowClear
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onSearch={(value) => list.applyFilters({ tag: value })}
              />
            </AdminFilterItem>
          }
        >
          <Input.Search
            placeholder="搜索文件名 / 文件 ID"
            allowClear
            value={keywordInput}
            onChange={(event) => setKeywordInput(event.target.value)}
            onSearch={(value) => list.applyFilters({ keyword: value })}
            style={{ width: 240 }}
          />
        </AdminFilters>
      }
    >
      <ProTable
        dataSource={list.data.records}
        columns={columns}
        rowKey="id"
        loading={list.loading}
        locale={{ emptyText: "暂无文件" }}
        onChange={list.onTableChange}
        pagination={list.pagination}
        // 列表放不下的内容元信息（MIME / 路径 / 哈希 / 过期与更新时间）收进展开面板
        expandable={{
          columnWidth: 50,
          expandedRowRender: renderFileDetailPanel,
        }}
      />

      {/* 标签编辑弹窗（单字段快速修改） */}
      <FileTagsModal
        file={taggingFile}
        onClose={() => setTaggingFile(null)}
        onSaved={() => void list.reload()}
      />

      {/* 图片预览 Modal */}
      <Modal
        open={!!previewFile}
        title={previewFile?.originalName}
        onCancel={() => setPreviewFile(null)}
        width="auto"
        centered
        footer={
          previewFile && isProcessableMimeType(previewFile.mimeType) ? (
            <Button
              type="primary"
              icon={<EditOutlined />}
              onClick={() => {
                setEditingFile(previewFile);
                setPreviewFile(null);
              }}
            >
              编辑图片
            </Button>
          ) : null
        }
      >
        {previewFile && isImageMimeType(previewFile.mimeType) && (
          <img
            src={`/file/r/${previewFile.id}`}
            alt={previewFile.originalName}
            style={{ maxWidth: "80vw", maxHeight: "80vh" }}
          />
        )}
      </Modal>

      {/* 图片编辑器：裁切与压缩在浏览器完成，保存时写回服务端 */}
      <FileImageEditor
        file={editingFile}
        onClose={() => setEditingFile(null)}
        onSaved={() => {
          void list.reload();
        }}
      />
    </AdminListPage>
  );
}
