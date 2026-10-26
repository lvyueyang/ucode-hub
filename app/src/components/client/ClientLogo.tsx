/**
 * 前台 Logo：内联 SVG 六边形 F，颜色随主题前景色（text-foreground）
 * 亮暗主题下自动取前景色，避免深灰图标在暗色下不可见
 */
interface ClientLogoProps {
  /** 图标边长（宽高相等） */
  height?: number;
}

export function ClientLogo({ height = 36 }: ClientLogoProps) {
  return (
    <svg
      viewBox="0 0 40 40"
      role="img"
      aria-label="HUB"
      className="text-foreground"
      style={{ width: height, height }}
    >
      <polygon
        points="20,4 33.86,12 33.86,28 20,36 6.14,28 6.14,12"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
      />
      <text
        x="20"
        y="26"
        fontFamily="system-ui,-apple-system,sans-serif"
        fontSize="18"
        fontWeight="800"
        fill="currentColor"
        textAnchor="middle"
      >
        F
      </text>
    </svg>
  );
}
