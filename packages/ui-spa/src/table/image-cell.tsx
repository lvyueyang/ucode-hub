/**
 * 表格图片 / 封面单元格：固定正方形 + 等比缩放（contain）
 *
 * 列规范：图片 / 封面 / 缩略图列放表格**最前**（序号、ID、展开、选择列除外），
 * 统一用本组件渲染，避免各页各写尺寸与 objectFit 导致行高参差、图片被裁切。
 */
import { Image } from "antd";
import type { ReactNode } from "react";

/** 正方形边长默认值：单行不撑高、又足够辨识 */
export const IMAGE_CELL_SIZE = 48;

export interface ImageCellProps {
  /** 图片地址；空值渲染占位符 */
  src?: string | null;
  /** 正方形边长（px），默认 48 */
  size?: number;
  /** 空值占位内容，默认「—」 */
  placeholder?: ReactNode;
  /** 无障碍替代文本，缺省取图片地址（无地址时为空） */
  alt?: string;
}

export function ImageCell({ src, size = IMAGE_CELL_SIZE, placeholder = "—", alt }: ImageCellProps) {
  if (!src) {
    return <span className="text-foreground-tertiary">{placeholder}</span>;
  }
  return (
    <Image
      src={src}
      alt={alt ?? src}
      width={size}
      height={size}
      className="bg-background-tertiary"
      style={{
        // 强制正方形 + 等比缩放（contain）：非方图留出背景色，不裁切、不变形
        objectFit: "contain",
        borderRadius: 0,
      }}
    />
  );
}
