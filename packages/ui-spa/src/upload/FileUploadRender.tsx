/**
 * FileUpload 拖拽列表项渲染器
 */
import { DeleteOutlined } from "@ant-design/icons";
import { Button } from "antd";

export function renderUploadItem(
  originNode: React.ReactNode,
  index: number,
  actions: { remove: () => void },
  canSort: boolean,
  handleDragSort: (from: number, to: number) => void,
) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: HTML5 拖放无键盘等价操作，键盘用户通过删除按钮完成同一目标（移除文件）
    <div
      draggable={canSort}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        cursor: canSort ? "move" : "default",
      }}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", String(index));
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDrop={(e) => {
        e.preventDefault();
        const fromIndex = Number(e.dataTransfer.getData("text/plain"));
        if (fromIndex !== index && !Number.isNaN(fromIndex)) {
          handleDragSort(fromIndex, index);
        }
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>{originNode}</div>
      <Button
        type="text"
        size="small"
        danger
        icon={<DeleteOutlined />}
        onClick={(e: React.MouseEvent<HTMLElement>) => {
          e.stopPropagation();
          actions.remove();
        }}
      />
    </div>
  );
}
