/**
 * 管理端 Logo：内联 SVG 六边形 F，颜色用品牌语义变量
 * fill 取 `--s-primary`、F 取 `--s-primary-fg`，亮暗主题下自动切换品牌色
 */
interface AdminLogoProps {
  /** 图标边长（宽高相等） */
  height?: number;
}

export function AdminLogo({ height = 36 }: AdminLogoProps) {
  return (
    <svg viewBox="0 0 40 40" role="img" aria-label="HUB" style={{ width: height, height }}>
      <polygon points="20,4 33.86,12 33.86,28 20,36 6.14,28 6.14,12" fill="var(--s-primary)" />
      <text
        x="20"
        y="26"
        fontFamily="system-ui,-apple-system,sans-serif"
        fontSize="18"
        fontWeight="800"
        fill="var(--s-primary-fg)"
        textAnchor="middle"
      >
        F
      </text>
    </svg>
  );
}
