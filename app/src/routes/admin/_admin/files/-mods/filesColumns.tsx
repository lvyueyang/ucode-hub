/**
 * 文件管理表格列定义
 * 列表只保留高频列，文件名为主要读取列（取长文本可读下限 340，弹性列让给操作列）；
 * 文件 ID / MIME / 存储路径 / SHA256 / 过期时间 / 更新时间等详情信息收进行展开面板；
 * 操作列不折叠「更多」，下载 / 标签 / 预览 / 编辑图片 / 删除 全部平铺，
 * 为此裁掉「文件 ID」列（ID 移入行展开面板）把宽度让给操作项；
 * 标签列内容长度不可控，单元格内单行横向滚动而非换行
 */
import {
  DownloadOutlined,
  EditOutlined,
  EyeOutlined,
  SwapOutlined,
  TagsOutlined,
} from "@ant-design/icons";
import { isProcessableMimeType } from "@easyx/image-toolkit";
import { formatBytes } from "@ucode/hub-lib/format-bytes";
import {
  actionsWidth,
  COLUMN_WIDTH,
  DetailGrid,
  formatDateTimeValue,
  StatusTag,
  type StatusTagOption,
  TableOperate,
} from "@ucode/hub-ui-spa/table";
import { Button, Popover, Space, Tag, Tooltip } from "antd";
import { useEffect, useRef, useState } from "react";
import type { FileRecord } from "#/services/file/file.server";

/** 文件状态展示：值与语义色集中在此，避免各列自选颜色 */
const FILE_STATUS_OPTIONS: Record<string, StatusTagOption> = {
  permanent: { label: "永久", tone: "success" },
  temp: { label: "临时", tone: "warning" },
};

/** 图片尺寸 Tag 的颜色：系统推导的元信息，与用户标签的默认灰色区分 */
const IMAGE_SIZE_TAG_COLOR = "cyan";

/** 列渲染所需的外部动作 */
export interface FilesColumnsHandlers {
  /** 打开图片预览 */
  onPreview: (record: FileRecord) => void;
  /** 打开图片编辑器 */
  onEdit: (record: FileRecord) => void;
  /** 打开标签编辑弹窗 */
  onEditTags: (record: FileRecord) => void;
  /** 临时文件转永久 */
  onMakePermanent: (record: FileRecord) => Promise<void>;
  /** 删除文件 */
  onDelete: (record: FileRecord) => Promise<void>;
}

/** 判断是否为图片类型（含不可编辑的 svg，仅用于是否展示预览） */
function isImage(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

/**
 * 标签列单元格：尺寸 Tag（系统推导的元信息，用区别于用户标签的青色）在前，其后为用户标签。
 * 标签的数量与文案长度都不可控，单元格内**单行横向滚动**——不折成两行、不折叠为 +N；
 * 内容被列宽裁掉时再挂 Popover（hover / 聚焦）平铺列出全部标签，不拖动也能一眼看全
 */
function FileTagsCell({ record }: { record: FileRecord }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  const tags = record.tags ?? [];
  const hasDimensions = record.width !== null && record.height !== null;

  // 只有内容真被裁掉时才接管 hover：内容本就完整时弹层纯属打扰。
  // 观测滚动容器（列宽变化）与内容行（标签增删）两处，标签编辑后无需重挂即会重判
  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;
    const measure = () => setOverflow(container.scrollWidth > container.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  const isEmpty = tags.length === 0 && !hasDimensions;
  const tagItems = (
    <>
      {hasDimensions && (
        <Tag color={IMAGE_SIZE_TAG_COLOR} className="shrink-0" style={{ marginInlineEnd: 0 }}>
          {record.width} × {record.height}
        </Tag>
      )}
      {tags.map((tag) => (
        <Tag key={tag} className="shrink-0" style={{ marginInlineEnd: 0 }}>
          {tag}
        </Tag>
      ))}
    </>
  );

  return (
    <Popover
      // overflow 时走 antd 非受控 hover 行为，否则直接关闭
      open={overflow ? undefined : false}
      mouseEnterDelay={0.3}
      content={<div className="flex max-w-80 flex-wrap gap-1">{tagItems}</div>}
    >
      {/* 触发元素与测量元素分开：弹层需要克隆触发元素，避免与我们的 ref 相互覆盖 */}
      <span className="block min-w-0">
        {/* 单行横向滚动；`.scrollbar-thin` 为全站统一的细窄滚动条（admin.global.css） */}
        <div ref={containerRef} className="scrollbar-thin overflow-x-auto">
          {/* w-max 让内容行按标签实际宽度铺开，成为滚动的被观测对象 */}
          <div ref={contentRef} className="flex w-max items-center gap-1">
            {isEmpty ? "—" : tagItems}
          </div>
        </div>
      </span>
    </Popover>
  );
}

/**
 * 行展开面板：列表放不下的内容元信息（ID / MIME / 路径 / 哈希 / 时间）
 * 时间值复用 ProTable 的格式化实现，避免此处再手写 dayjs
 */
export function renderFileDetailPanel(record: FileRecord) {
  return (
    <DetailGrid
      items={[
        {
          key: "id",
          label: "文件 ID",
          fieldKey: "id",
          value: record.id,
          copyable: true,
        },
        {
          key: "mimeType",
          label: "MIME 类型",
          fieldKey: "mimeType",
          value: record.mimeType,
        },
        {
          key: "path",
          label: "存储路径",
          fieldKey: "path",
          value: record.path,
        },
        {
          key: "sha256",
          label: "SHA256",
          fieldKey: "sha256",
          value: record.sha256,
        },
        {
          key: "expiredAt",
          label: "过期时间",
          fieldKey: "expiredAt",
          value: formatDateTimeValue(record.expiredAt),
        },
        {
          key: "updatedAt",
          label: "更新时间",
          fieldKey: "updatedAt",
          value: formatDateTimeValue(record.updatedAt),
        },
      ]}
    />
  );
}

/** 列渲染所需的筛选态（受控回填列头漏斗选中项） */
export interface FilesColumnsOptions {
  /** 状态列头筛选值（空串表示全部） */
  statusFilter: "" | "temp" | "permanent";
}

export function createFilesColumns(handlers: FilesColumnsHandlers, options: FilesColumnsOptions) {
  return [
    {
      title: "文件名",
      dataIndex: "originalName",
      key: "originalName",
      // 文件名长度不可控：取长文本档位，超长省略 + Tooltip；余宽归操作列
      width: COLUMN_WIDTH.text,
      ellipsis: true,
    },
    {
      title: "大小",
      dataIndex: "size",
      key: "size",
      width: 100,
      sorter: true,
      render: (_: unknown, record: FileRecord) => formatBytes(record.size),
    },
    {
      title: "标签",
      key: "tags",
      // 档位 150（2~4 字标签）不够：本列还要放尺寸 Tag（约 91px）
      // 取「尺寸 + 一个双字标签 + 间距 4 + 内边距 32」≈ 180，更多标签在单元格内横向滚动
      width: 180,
      render: (_: unknown, record: FileRecord) => <FileTagsCell record={record} />,
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 100,
      // 三态状态筛选收进列头漏斗（单选），不再占用页头一行
      filters: [
        { text: "永久", value: "permanent" },
        { text: "临时", value: "temp" },
      ],
      filterMultiple: false,
      filteredValue: options.statusFilter ? [options.statusFilter] : null,
      render: (_: unknown, record: FileRecord) => (
        <Space size={4}>
          <StatusTag value={record.status} options={FILE_STATUS_OPTIONS} />
          {record.status !== "permanent" && (
            <Tooltip title="转为永久">
              <Button
                type="text"
                size="small"
                icon={<SwapOutlined />}
                style={{ paddingInline: 4 }}
                onClick={() => void handlers.onMakePermanent(record)}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: "上传时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: COLUMN_WIDTH.time,
      sorter: true,
      valueType: "dateTimeMinute",
    },
    {
      title: "操作",
      key: "actions",
      fixed: "right" as const,
      // 5 项平铺（标签常驻，预览 / 编辑图片仅图片类文件出现）
      // 宽度按最大项数实算：列宽必须覆盖图片类文件，否则按钮会溢出到相邻列
      // 弹性列：余宽归它，宽度为出现横向滚动时的按钮所需宽
      width: actionsWidth("下载", "标签", "预览", "编辑图片", "删除"),
      elastic: true,
      render: (_: unknown, record: FileRecord) => (
        <TableOperate>
          <TableOperate.Custom>
            <a href={`/file/r/${record.id}`} target="_blank" rel="noreferrer">
              <Button type="link" size="small" icon={<DownloadOutlined />}>
                下载
              </Button>
            </a>
          </TableOperate.Custom>
          <TableOperate.Custom>
            <Button
              type="link"
              size="small"
              icon={<TagsOutlined />}
              onClick={() => handlers.onEditTags(record)}
            >
              标签
            </Button>
          </TableOperate.Custom>
          {isImage(record.mimeType) && (
            <TableOperate.Custom>
              <Button
                type="link"
                size="small"
                icon={<EyeOutlined />}
                onClick={() => handlers.onPreview(record)}
              >
                预览
              </Button>
            </TableOperate.Custom>
          )}
          {isProcessableMimeType(record.mimeType) && (
            <TableOperate.Custom>
              <Button
                type="link"
                size="small"
                icon={<EditOutlined />}
                onClick={() => handlers.onEdit(record)}
              >
                编辑图片
              </Button>
            </TableOperate.Custom>
          )}
          <TableOperate.Delete onConfirm={() => handlers.onDelete(record)} />
        </TableOperate>
      ),
    },
  ];
}
