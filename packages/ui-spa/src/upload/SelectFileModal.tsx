/**
 * 文件库选择弹窗（基础组件）：从已上传文件中选取，支持搜索、筛选、预览、单选/多选、分页
 * 文件列表查询经 fetchFiles 回调注入，由宿主决定数据来源；读取地址经 readUrl 回调注入
 */
import { EyeOutlined } from "@ant-design/icons";
import { formatBytes } from "@ucode/hub-lib/format-bytes";
import { Button, Image, Input, Modal, Space, Tag } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import { message } from "../antd-static";
import { COLUMN_WIDTH, type ProColumnType, ProTable, TableOperate } from "../table";

/** 可选择的文件条目（宿主查询结果的扁平结构，与业务 db 类型解耦） */
export interface SelectableFile {
  id: string;
  originalName: string;
  size: number;
  mimeType: string;
  status: string;
  createdAt: string | Date | null;
}

/** 文件列表查询参数 */
export interface FetchFilesParams {
  keyword?: string;
  mimePrefix?: string;
  page: number;
  pageSize: number;
}

/** 文件列表查询回调，返回分页结果 */
export type FetchFiles = (
  params: FetchFilesParams,
) => Promise<{ records: SelectableFile[]; total: number }>;

interface SelectFileModalProps {
  /** 弹窗是否可见 */
  open: boolean;
  /** 关闭弹窗回调 */
  onCancel: () => void;
  /** 确认选择回调，返回选中的文件 ID 数组 */
  onSelect: (fileIds: string[]) => void;
  /** 是否多选 */
  multiple?: boolean;
  /** 文件类型过滤，如 "image/*" 仅显示图片；不传显示全部 */
  accept?: string;
  /** 最大选择数量，多选模式下生效 */
  maxCount?: number;
  /** 文件列表查询回调（宿主注入，如对接 getFileListSFn） */
  fetchFiles: FetchFiles;
  /** 根据文件 ID 生成读取地址（宿主注入，用于内联预览/打开） */
  readUrl: (id: string) => string;
}

/** 将 accept 值转为 mimeType 前缀（如 "image/*" → "image/"） */
export function acceptToMimePrefix(accept?: string): string | undefined {
  if (!accept) return undefined;
  if (accept === "image/*") return "image/";
  if (accept.endsWith("/*")) return accept.replace("/*", "/");
  return accept;
}

/**
 * 文件大小格式化
 * @deprecated 实现已统一到 `@ucode/hub-lib/format-bytes` 的 `formatBytes`，新代码请直接引用该函数；
 *   此处仅为兼容既有引用保留
 */
export const formatSize = formatBytes;

export function SelectFileModal({
  open,
  onCancel,
  onSelect,
  multiple = false,
  accept,
  maxCount,
  fetchFiles,
  readUrl,
}: SelectFileModalProps) {
  const pageSize = 50;
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<SelectableFile[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [previewFile, setPreviewFile] = useState<SelectableFile | null>(null);
  const keywordRef = useRef(keyword);
  keywordRef.current = keyword;

  const mimePrefix = acceptToMimePrefix(accept);

  /** 加载文件列表（服务端分页） */
  const loadFiles = useCallback(
    async (params?: { page?: number; keyword?: string }) => {
      setLoading(true);
      try {
        const kw = params?.keyword ?? keywordRef.current;
        const pg = params?.page ?? 1;
        const result = await fetchFiles({
          keyword: kw || undefined,
          mimePrefix,
          page: pg,
          pageSize,
        });
        setRecords(result.records ?? []);
        setTotal(result.total);
      } catch (err) {
        console.error("[SelectFileModal] 加载文件列表失败", err);
        message.error("加载文件列表失败");
      } finally {
        setLoading(false);
      }
    },
    [mimePrefix, fetchFiles],
  );

  /** 最新加载函数镜像：打开弹窗时调用，避免把宿主回调的不稳定引用作为 effect 依赖 */
  const loadFilesRef = useRef(loadFiles);
  loadFilesRef.current = loadFiles;

  useEffect(() => {
    if (!open) return;
    setPage(1);
    setKeyword("");
    setSelectedRowKeys([]);
    void loadFilesRef.current({ page: 1, keyword: "" });
  }, [open]);

  const columns: ProColumnType<SelectableFile>[] = [
    {
      title: "文件名",
      dataIndex: "originalName",
      key: "originalName",
      // 弹性列：文件名长度不可控，宽度为出现横向滚动时的最小可读宽
      width: COLUMN_WIDTH.text,
      elastic: true,
      ellipsis: true,
    },
    {
      title: "大小",
      dataIndex: "size",
      key: "size",
      width: 100,
      render: (_: unknown, r: SelectableFile) => formatBytes(r.size),
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 80,
      render: (_: unknown, r: SelectableFile) =>
        r.status === "permanent" ? <Tag color="green">永久</Tag> : <Tag color="gold">临时</Tag>,
    },
    {
      title: "上传时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: COLUMN_WIDTH.timeSecond,
      valueType: "dateTime",
      emptyText: "-",
    },
    {
      title: "操作",
      key: "actions",
      width: 100,
      render: (_: unknown, r: SelectableFile) =>
        r.mimeType.startsWith("image/") ? (
          <TableOperate>
            <TableOperate.Custom>
              <Button
                type="link"
                size="small"
                icon={<EyeOutlined />}
                onClick={() => setPreviewFile(r)}
              >
                预览
              </Button>
            </TableOperate.Custom>
          </TableOperate>
        ) : null,
    },
  ];

  const handleSearch = (value: string) => {
    setKeyword(value);
    setPage(1);
    loadFiles({ keyword: value, page: 1 });
  };

  const handlePageChange = (p: number) => {
    setPage(p);
    loadFiles({ page: p });
  };

  const handleConfirm = () => {
    onSelect(selectedRowKeys);
    onCancel();
  };

  return (
    <Modal
      title="从文件库选择"
      open={open}
      onCancel={onCancel}
      width={780}
      centered
      footer={
        <Space>
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" onClick={handleConfirm}>
            确定选择
          </Button>
        </Space>
      }
      destroyOnHidden
    >
      <div style={{ marginBottom: 16 }}>
        <Input.Search
          placeholder="搜索文件名..."
          allowClear
          onSearch={handleSearch}
          style={{ width: 300 }}
        />
      </div>
      <ProTable<SelectableFile>
        rowKey="id"
        onRow={(record) => ({
          onClick: () => {
            if (multiple) {
              setSelectedRowKeys((prev) => {
                if (prev.includes(record.id)) {
                  return prev.filter((k) => k !== record.id);
                }
                if (maxCount && prev.length >= maxCount) {
                  message.warning(`最多选择 ${maxCount} 个文件`);
                  return prev;
                }
                return [...prev, record.id];
              });
            } else {
              setSelectedRowKeys([record.id]);
            }
          },
          onDoubleClick: () => {
            if (!multiple) {
              onSelect([record.id]);
              onCancel();
            }
          },
        })}
        columns={columns}
        dataSource={records}
        loading={loading}
        size="small"
        rowSelection={
          multiple
            ? {
                type: "checkbox",
                selectedRowKeys,
                onChange: (keys) => {
                  const k = keys as string[];
                  if (maxCount && k.length > maxCount) {
                    message.warning(`最多选择 ${maxCount} 个文件`);
                    return;
                  }
                  setSelectedRowKeys(k);
                },
              }
            : {
                type: "radio",
                selectedRowKeys,
                onChange: (keys) => setSelectedRowKeys(keys as string[]),
              }
        }
        pagination={{
          total,
          pageSize,
          current: page,
          onChange: handlePageChange,
          size: "small",
          showTotal: (t) => `共 ${t} 条`,
        }}
      />
      {previewFile && (
        <Modal
          open={!!previewFile}
          title={previewFile.originalName}
          footer={null}
          onCancel={() => setPreviewFile(null)}
          width="auto"
          centered
        >
          <Image
            preview={false}
            src={readUrl(previewFile.id)}
            alt={previewFile.originalName}
            style={{ maxWidth: "70vw", maxHeight: "70vh" }}
          />
        </Modal>
      )}
    </Modal>
  );
}
