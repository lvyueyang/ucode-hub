/**
 * 资源管理器页面：浏览和管理 STORAGE_DIR 下的文件系统
 */
import {
  ArrowRightOutlined,
  CloudUploadOutlined,
  FolderAddOutlined,
  FolderOpenOutlined,
  InboxOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { createFileRoute } from "@tanstack/react-router";
import { message } from "@ucode/hub-ui-spa/antd-static";
import { ProTable } from "@ucode/hub-ui-spa/table";
import type { UploadProps } from "antd";
import { Button, Input, Space, Tag, Tooltip, Upload } from "antd";
import { useCallback, useState } from "react";
import { AdminFilters, AdminListPage } from "#/components/admin";
import {
  createDirectorySFn,
  deleteEntrySFn,
  getTextContentSFn,
  listDirectorySFn,
  renameEntrySFn,
  uploadFileSFn,
} from "#/services/file-explorer/file-explorer.functions";
import type { FsEntry } from "#/services/file-explorer/file-explorer.server";
import { callSfn, sfnUnwrap } from "#/utils/sfn-error";
import { MkdirModal, PreviewModal, RenameModal } from "./-mods/FileModals";
import {
  type DirData,
  entryPath,
  formatDisplayPath,
  normalizePath,
} from "./-mods/file-explorer.utils";
import { fileExplorerColumns } from "./-mods/fileExplorerColumns";

export const Route = createFileRoute("/admin/_admin/file-explorer/")({
  component: FileExplorerPage,
  loader: async () => {
    return listDirectorySFn({ data: { subPath: "" } });
  },
});

function FileExplorerPage() {
  const initialData = Route.useLoaderData();
  const [data, setData] = useState<DirData>(initialData);
  const [currentPath, setCurrentPath] = useState("");
  const [pathDraft, setPathDraft] = useState(() => formatDisplayPath(initialData.currentPath));
  const [loading, setLoading] = useState(false);

  // Modal 状态
  const [mkdirOpen, setMkdirOpen] = useState(false);
  const [mkdirName, setMkdirName] = useState("");
  const [mkdirLoading, setMkdirLoading] = useState(false);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<FsEntry | null>(null);
  const [renameNewName, setRenameNewName] = useState("");
  const [renameLoading, setRenameLoading] = useState(false);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTitle, setPreviewTitle] = useState("");
  const [previewContent, setPreviewContent] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);

  const [uploading, setUploading] = useState(false);

  /** 刷新当前目录 */
  const refreshDir = useCallback(
    async (subPath?: string) => {
      const path = subPath ?? currentPath;
      setLoading(true);
      try {
        const result = await callSfn(listDirectorySFn({ data: { subPath: path } }));
        setData(result);
        setCurrentPath(path);
        setPathDraft(formatDisplayPath(path));
      } catch {
        // callSfn 已提示
      } finally {
        setLoading(false);
      }
    },
    [currentPath],
  );

  /** 导航到指定目录 */
  const navigateTo = useCallback(
    (subPath: string) => {
      refreshDir(subPath);
    },
    [refreshDir],
  );

  /** 从路径输入框跳转 */
  const handlePathSubmit = useCallback(() => {
    if (loading) return;
    refreshDir(normalizePath(pathDraft));
  }, [pathDraft, refreshDir, loading]);

  /** 创建目录 */
  const handleMkdir = useCallback(async () => {
    if (!mkdirName.trim()) return;
    setMkdirLoading(true);
    try {
      await callSfn(
        createDirectorySFn({
          data: { subPath: currentPath, name: mkdirName.trim() },
        }),
        { error: "创建目录失败" },
      );
      message.success("目录创建成功");
      setMkdirOpen(false);
      setMkdirName("");
      await refreshDir();
    } catch {
      // callSfn 已提示
    } finally {
      setMkdirLoading(false);
    }
  }, [mkdirName, currentPath, refreshDir]);

  /** 删除条目 */
  const handleDelete = useCallback(
    async (entry: FsEntry) => {
      const targetPath = entryPath(currentPath, entry.name);
      try {
        await callSfn(deleteEntrySFn({ data: { subPath: targetPath } }), {
          error: "删除失败",
        });
        message.success(`已删除：${entry.name}`);
        await refreshDir();
      } catch {
        // callSfn 已提示
      }
    },
    [currentPath, refreshDir],
  );

  /** 重命名条目 */
  const handleRename = useCallback(async () => {
    if (!renameNewName.trim() || !renameTarget) return;
    setRenameLoading(true);
    try {
      const targetPath = entryPath(currentPath, renameTarget.name);
      await callSfn(
        renameEntrySFn({
          data: { subPath: targetPath, newName: renameNewName.trim() },
        }),
        { error: "重命名失败" },
      );
      message.success(`已重命名为：${renameNewName.trim()}`);
      setRenameOpen(false);
      setRenameTarget(null);
      setRenameNewName("");
      await refreshDir();
    } catch {
      // callSfn 已提示
    } finally {
      setRenameLoading(false);
    }
  }, [renameNewName, renameTarget, currentPath, refreshDir]);

  /** 预览文本文件 */
  const handlePreview = useCallback(
    async (entry: FsEntry) => {
      setPreviewLoading(true);
      setPreviewOpen(true);
      setPreviewTitle(entry.name);
      setPreviewContent("");
      try {
        const targetPath = entryPath(currentPath, entry.name);
        const content = await callSfn(getTextContentSFn({ data: { subPath: targetPath } }), {
          error: "读取文件内容失败",
        });
        setPreviewContent(content);
      } catch {
        setPreviewOpen(false);
      } finally {
        setPreviewLoading(false);
      }
    },
    [currentPath],
  );

  /** 文件上传 */
  const customUploadRequest: UploadProps["customRequest"] = useCallback(
    async (options) => {
      const { file, onSuccess, onError } = options;
      setUploading(true);
      try {
        const fd = new FormData();
        fd.append("file", file as File);
        fd.append("subPath", currentPath);
        const [, err] = await sfnUnwrap(uploadFileSFn({ data: fd }), {
          error: "上传失败",
        });
        if (err) {
          onError?.(err as Error);
          return;
        }
        message.success(`上传成功：${(file as File).name}`);
        onSuccess?.("ok");
        await refreshDir();
      } finally {
        setUploading(false);
      }
    },
    [currentPath, refreshDir],
  );

  const columns = fileExplorerColumns({
    currentPath,
    writeProtected: data.writeProtected,
    onNavigate: navigateTo,
    onPreview: handlePreview,
    onRename: (record) => {
      setRenameTarget(record);
      setRenameNewName(record.name);
      setRenameOpen(true);
    },
    onDelete: handleDelete,
  });

  /** 目录统计与写保护状态（工具条右侧信息） */
  const dirCount = data.entries.filter((e) => e.type === "directory").length;
  const fileCount = data.entries.filter((e) => e.type === "file").length;

  /** 主操作：上传 / 新建目录 / 刷新 */
  const actions = (
    <Space size={12}>
      <Upload
        customRequest={customUploadRequest}
        showUploadList={false}
        disabled={uploading || data.writeProtected}
      >
        <Tooltip title={data.writeProtected ? "当前目录写保护，禁止上传" : undefined}>
          <Button type="primary" icon={<CloudUploadOutlined />} disabled={data.writeProtected}>
            上传文件
          </Button>
        </Tooltip>
      </Upload>
      <Button
        icon={<FolderAddOutlined />}
        disabled={data.writeProtected}
        onClick={() => {
          setMkdirName("");
          setMkdirOpen(true);
        }}
      >
        新建目录
      </Button>
      <Button icon={<ReloadOutlined />} loading={loading} onClick={() => refreshDir()}>
        刷新
      </Button>
    </Space>
  );

  return (
    <AdminListPage
      title="资源管理器"
      description="浏览与管理服务器本地存储目录"
      extra={actions}
      filters={
        <AdminFilters>
          <Input
            value={pathDraft}
            onChange={(e) => setPathDraft(e.target.value)}
            onPressEnter={handlePathSubmit}
            allowClear
            prefix={<FolderOpenOutlined className="text-foreground-tertiary" />}
            placeholder="输入路径后回车跳转"
            style={{ flex: 1, minWidth: 200 }}
          />
          <Button icon={<ArrowRightOutlined />} disabled={loading} onClick={handlePathSubmit}>
            前往
          </Button>
          {data.writeProtected && <Tag color="warning">写保护</Tag>}
          {/* 当前目录的内容概览：与路径输入同段，属于该目录的上下文而非页面操作 */}
          <span className="shrink-0 text-xs text-foreground-tertiary">
            {dirCount > 0 && `${dirCount} 个目录`}
            {dirCount > 0 && fileCount > 0 && "，"}
            {fileCount > 0 && `${fileCount} 个文件`}
          </span>
        </AdminFilters>
      }
    >
      <ProTable
        dataSource={data.entries}
        columns={columns}
        rowKey="name"
        loading={loading}
        locale={{
          emptyText: (
            <div style={{ padding: "32px 0" }}>
              <InboxOutlined
                style={{
                  fontSize: 32,
                  color: "var(--ant-color-text-quaternary)",
                  marginBottom: 8,
                }}
              />
              <p style={{ color: "var(--ant-color-text-tertiary)" }}>目录为空</p>
            </div>
          ),
        }}
        pagination={false}
        bordered
      />

      <MkdirModal
        open={mkdirOpen}
        value={mkdirName}
        loading={mkdirLoading}
        onChange={setMkdirName}
        onOk={handleMkdir}
        onCancel={() => {
          setMkdirOpen(false);
          setMkdirName("");
        }}
      />

      <RenameModal
        open={renameOpen}
        value={renameNewName}
        loading={renameLoading}
        onChange={setRenameNewName}
        onOk={handleRename}
        onCancel={() => {
          setRenameOpen(false);
          setRenameTarget(null);
          setRenameNewName("");
        }}
      />

      <PreviewModal
        open={previewOpen}
        title={previewTitle}
        content={previewContent}
        loading={previewLoading}
        onCancel={() => {
          setPreviewOpen(false);
          setPreviewContent("");
        }}
      />
    </AdminListPage>
  );
}
