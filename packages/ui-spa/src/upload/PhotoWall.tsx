/**
 * 照片墙网格 + 上传/文件库选择卡片
 */
import { DeleteOutlined, FolderOpenOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Image, Spin } from "antd";

/** 图片条目：照片墙与上传组件共享 */
export interface ImageItem {
  uid: string;
  name: string;
  url: string;
  status: "done" | "uploading" | "error";
}

interface PhotoWallProps {
  fileList: ImageItem[];
  canAdd: boolean;
  canSort: boolean;
  disabled: boolean;
  dragIndex: number | null;
  hoverIndex: number | null;
  hoveredCard: number | null;
  dragOver: boolean;
  sortKey: number;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onHoverCard: (index: number | null) => void;
  onDragStart: (index: number) => void;
  onDragEnd: () => void;
  onDragEnter: (index: number) => void;
  onDragLeave: () => void;
  onDragSort: (from: number, to: number) => void;
  onRemove: (index: number) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragOverToggle: (v: boolean) => void;
  onLibraryClick: () => void;
}

export function PhotoWall({
  fileList,
  canAdd,
  canSort,
  disabled,
  dragIndex,
  hoverIndex,
  hoveredCard,
  dragOver,
  sortKey,
  inputRef,
  onHoverCard,
  onDragStart,
  onDragEnd,
  onDragEnter,
  onDragLeave,
  onDragSort,
  onRemove,
  onDrop,
  onDragOverToggle,
  onLibraryClick,
}: PhotoWallProps) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "flex-start",
      }}
    >
      <Image.PreviewGroup key={sortKey}>
        {fileList.map((item, index) => (
          // biome-ignore lint/a11y/noStaticElementInteractions: 拖拽排序是 HTML5 拖放（无键盘等价操作）；悬停只为切换删除按钮显隐，不承载动作
          <div
            key={item.uid}
            onMouseEnter={() => onHoverCard(index)}
            onMouseLeave={() => onHoverCard(null)}
            draggable={canSort}
            onDragStart={
              canSort
                ? (e) => {
                    onDragStart(index);
                    e.dataTransfer.setData("text/plain", String(index));
                    e.dataTransfer.effectAllowed = "move";
                  }
                : undefined
            }
            onDragEnd={() => onDragEnd()}
            onDragEnter={canSort ? () => onDragEnter(index) : undefined}
            onDragLeave={canSort ? () => onDragLeave() : undefined}
            onDragOver={
              canSort
                ? (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }
                : undefined
            }
            onDrop={
              canSort
                ? (e) => {
                    e.preventDefault();
                    const from = Number(e.dataTransfer.getData("text/plain"));
                    if (from !== index && !Number.isNaN(from)) {
                      onDragSort(from, index);
                    }
                  }
                : undefined
            }
            style={{
              width: 104,
              height: 104,
              border: "1px solid var(--s-border)",
              borderRadius: 0,
              overflow: "hidden",
              position: "relative",
              cursor: canSort ? "move" : "default",
              opacity: dragIndex === index ? 0.4 : 1,
              borderColor: canSort && hoverIndex === index ? "var(--s-primary)" : "var(--s-border)",
              borderWidth: canSort && hoverIndex === index ? 2 : 1,
              transition: "opacity 0.15s, border-color 0.15s",
            }}
          >
            <Image
              src={item.url}
              width={104}
              height={104}
              style={{ objectFit: "cover" }}
              preview={{
                mask: (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      height: "100%",
                      fontSize: 12,
                      color: "#fff",
                    }}
                  >
                    预览
                  </div>
                ),
              }}
            />
            {item.status === "uploading" && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "color-mix(in srgb, var(--s-surface) 70%, transparent)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Spin size="small" />
              </div>
            )}
            <div
              className="image-upload-item-actions"
              style={{
                position: "absolute",
                top: 2,
                right: 2,
                opacity: hoveredCard === index ? 1 : 0,
                transition: "opacity 0.15s",
              }}
            >
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                style={{
                  color: "var(--s-text-inverse)",
                  background: "color-mix(in srgb, var(--s-danger) 70%, transparent)",
                  borderRadius: 0,
                }}
                onClick={(e: React.MouseEvent<HTMLElement>) => {
                  e.stopPropagation();
                  onRemove(index);
                }}
              />
            </div>
          </div>
        ))}
      </Image.PreviewGroup>

      {canAdd && !disabled && (
        // biome-ignore lint/a11y/noStaticElementInteractions: 拖放落点只响应文件拖入（HTML5 拖放无键盘等价操作），框内已有「上传图片 / 从文件库选择」按钮承担键盘路径
        <div
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            onDragOverToggle(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            onDragOverToggle(false);
          }}
          onDrop={onDrop}
          style={{
            width: 104,
            height: 104,
            border: "1px dashed var(--s-border)",
            borderRadius: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            borderColor: dragOver ? "var(--s-primary)" : "var(--s-border)",
            background: dragOver ? "var(--s-primary-bg)" : "var(--s-surface-secondary)",
            transition: "border-color 0.15s, background 0.15s",
          }}
        >
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "var(--s-text-tertiary)",
              // 按钮元素重置默认外观，保持与卡片一致的直角风格
              border: "none",
              background: "transparent",
              padding: 0,
              font: "inherit",
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLElement;
              el.style.color = "var(--s-primary)";
              const parent = el.parentElement;
              if (parent) parent.style.borderColor = "var(--s-primary)";
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLElement;
              el.style.color = "var(--s-text-tertiary)";
              const parent = el.parentElement;
              if (parent) parent.style.borderColor = "var(--s-border)";
            }}
          >
            <PlusOutlined style={{ fontSize: 20 }} />
            <div style={{ fontSize: 12, marginTop: 4 }}>上传图片</div>
          </button>
          <button
            type="button"
            onClick={onLibraryClick}
            style={{
              height: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              fontSize: 12,
              color: "var(--s-text-tertiary)",
              background: "var(--s-surface-tertiary)",
              // 重置按钮默认边框后再补上分隔用的虚线顶边
              border: "none",
              borderTop: "1px dashed var(--s-border)",
              padding: 0,
              width: "100%",
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLElement;
              el.style.color = "var(--s-primary-fg)";
              el.style.background = "var(--s-primary)";
              el.style.borderTopColor = "var(--s-primary)";
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLElement;
              el.style.color = "var(--s-text-tertiary)";
              el.style.background = "var(--s-surface-tertiary)";
              el.style.borderTopColor = "var(--s-border)";
            }}
          >
            <FolderOpenOutlined style={{ fontSize: 12, marginRight: 4 }} />
            从文件库选择
          </button>
        </div>
      )}
    </div>
  );
}
