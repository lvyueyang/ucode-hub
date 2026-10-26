/**
 * 资源管理器表格列定义
 */
import { FileOutlined, FolderOutlined } from "@ant-design/icons";
import { formatBytes } from "@ucode/hub-lib/format-bytes";
import { actionsWidth, COLUMN_WIDTH, TableOperate } from "@ucode/hub-ui-spa/table";
import { Button, Typography } from "antd";
import type { CSSProperties } from "react";
import type { FsEntry } from "#/services/file-explorer/file-explorer.server";
import { entryPath, isTextFile } from "./file-explorer.utils";

interface FileExplorerColumnsOptions {
  currentPath: string;
  writeProtected: boolean;
  onNavigate: (path: string) => void;
  onPreview: (record: FsEntry) => void;
  onRename: (record: FsEntry) => void;
  onDelete: (record: FsEntry) => void;
}

/** 资源管理器表格列：目录可点击进入，写保护时禁用重命名/删除 */
export function fileExplorerColumns(options: FileExplorerColumnsOptions) {
  return [
    {
      title: "名称",
      dataIndex: "name",
      key: "name",
      // 目录 / 文件名长度差异大：取长文本档位（超长省略 + Tooltip）；余宽归操作列
      width: COLUMN_WIDTH.text,
      render: (_: unknown, record: FsEntry) => {
        const isDirectory = record.type === "directory";
        const cellStyle: CSSProperties = {
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "2px 0",
          cursor: isDirectory ? "pointer" : "default",
        };
        const nameCell = (
          <>
            {isDirectory ? (
              <FolderOutlined
                style={{
                  color: "var(--ant-color-warning)",
                  fontSize: 18,
                  flexShrink: 0,
                }}
              />
            ) : (
              <FileOutlined style={{ color: "var(--s-primary)", fontSize: 16, flexShrink: 0 }} />
            )}
            <Typography.Text
              ellipsis={{ tooltip: record.name }}
              style={{
                color: isDirectory ? "var(--ant-color-text)" : "var(--ant-color-text-secondary)",
                fontWeight: isDirectory ? 500 : 400,
              }}
            >
              {record.name}
            </Typography.Text>
          </>
        );
        // 目录可进入：用 button 承载点击，静态元素挂 onClick 既不支持键盘触发，也不满足 a11y 规则
        return isDirectory ? (
          <button
            type="button"
            style={{
              ...cellStyle,
              width: "100%",
              background: "none",
              border: 0,
              textAlign: "left",
            }}
            onClick={() => options.onNavigate(entryPath(options.currentPath, record.name))}
          >
            {nameCell}
          </button>
        ) : (
          <div style={cellStyle}>{nameCell}</div>
        );
      },
    },
    {
      title: "大小",
      dataIndex: "size",
      key: "size",
      // 按内容实算（`1.2 MB` 一类短文本 + 右对齐）
      width: 110,
      align: "right" as const,
      sorter: (a: FsEntry, b: FsEntry) => a.size - b.size,
      render: (_: unknown, record: FsEntry) => (
        <span style={{ color: "var(--ant-color-text-tertiary)", fontSize: 13 }}>
          {record.type === "directory" ? "-" : formatBytes(record.size)}
        </span>
      ),
    },
    {
      title: "修改时间",
      dataIndex: "mtime",
      key: "mtime",
      width: COLUMN_WIDTH.time,
      sorter: (a: FsEntry, b: FsEntry) => new Date(a.mtime).getTime() - new Date(b.mtime).getTime(),
      valueType: "dateTimeMinute",
    },
    {
      title: "操作",
      key: "actions",
      fixed: "right" as const,
      // 4 项（预览 / 下载 / 重命名 / 删除）
      // 弹性列：余宽归它，宽度为出现横向滚动时的按钮所需宽
      width: actionsWidth("预览", "下载", "重命名", "删除"),
      elastic: true,
      render: (_: unknown, record: FsEntry) => {
        const isWriteLocked = options.writeProtected;

        return (
          <TableOperate>
            {record.type === "file" && isTextFile(record.name) && (
              <TableOperate.Custom>
                <Button type="link" size="small" onClick={() => options.onPreview(record)}>
                  预览
                </Button>
              </TableOperate.Custom>
            )}
            {record.type === "file" && (
              <TableOperate.Custom>
                <Button
                  type="link"
                  size="small"
                  onClick={() => {
                    window.open(
                      `/admin/file-explorer/download/${encodeURIComponent(entryPath(options.currentPath, record.name))}`,
                      "_blank",
                      "noreferrer",
                    );
                  }}
                >
                  下载
                </Button>
              </TableOperate.Custom>
            )}
            {!isWriteLocked && (
              <TableOperate.Custom>
                <Button type="link" size="small" onClick={() => options.onRename(record)}>
                  重命名
                </Button>
              </TableOperate.Custom>
            )}
            {!isWriteLocked && (
              <TableOperate.Delete
                recordName={record.name}
                onConfirm={() => options.onDelete(record)}
              />
            )}
          </TableOperate>
        );
      },
    },
  ];
}
