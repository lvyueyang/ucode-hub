/**
 * 表格表体高度：按内容区剩余空间动态计算 + 就近向下注入
 *
 * 管理端内容区是定高滚动容器（`calc(100vh - 顶栏高)`），表格通常位于统计卡 / 工具条之下。
 * 写死高度会随视口与上方内容变化而溢出或留白，故以内容区为参考系实测：
 * 表体高度 = 容器可视高度 − 表格顶部偏移 − 表头高 − 分页器高 − 底部内边距。
 */
import {
  createContext,
  type ReactNode,
  type RefObject,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

/** 内容区滚动容器标记：由页面骨架（AdminPageContent）标注，供本 hook 定位参考系 */
export const ADMIN_SCROLL_CONTAINER_ATTR = "data-admin-scroll-container";

/** 表体之外的固定占位：内容区底部内边距 + 亚像素取整余量 */
const CHROME_EXTRA = 24;

/** 表体最小高度：视口过矮时避免表体被压扁 */
const MIN_BODY_HEIGHT = 240;

/** 首帧兜底高度：未完成实测前的近似值，避免表格先撑开再收缩 */
export const TABLE_BODY_HEIGHT_FALLBACK = 480;

const TableHeightContext = createContext<number | string | undefined>(undefined);

/** 表体高度提供器属性 */
export interface TableHeightProviderProps {
  value: number | string;
  children: ReactNode;
}

/** 向下提供表体高度（由页面骨架包裹表格区域） */
export function TableHeightProvider({ value, children }: TableHeightProviderProps) {
  return <TableHeightContext.Provider value={value}>{children}</TableHeightContext.Provider>;
}

/** 读取最近骨架注入的表体高度；无骨架时返回 undefined（表格按内容自然高度渲染） */
export function useTableHeight(): number | string | undefined {
  return useContext(TableHeightContext);
}

/** 测量结果：挂到表格区域容器上的 ref 与可直接使用的表体高度 */
export interface TableBodyHeight {
  /** 表格区域容器 ref（表头与分页器须在其内部） */
  areaRef: RefObject<HTMLDivElement | null>;
  /** 表体高度：number（px）或首帧的兜底值 */
  height: number | string;
}

/**
 * 表体高度动态计算
 *
 * - 以内容区为参考系测量表格顶部偏移：容器滚动时两个 rect 同步位移，测量值不受滚动影响，
 *   避免滚动反向推高表体形成正反馈
 * - 表头与分页器高度实测（含分页器上下外边距），窄屏分页器换行时同样计入
 * - 观测内容区及其全部块级子元素：窗口缩放、侧边栏折叠、上传列表展开都会重算
 *   （重算结果不变时 setState 自动跳过渲染）
 */
export function useTableBodyHeight(): TableBodyHeight {
  const areaRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | string>(TABLE_BODY_HEIGHT_FALLBACK);

  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const container =
      area.closest<HTMLElement>(`[${ADMIN_SCROLL_CONTAINER_ATTR}]`) ?? area.parentElement;
    if (!container) return;

    const measure = () => {
      const offsetTop = area.getBoundingClientRect().top - container.getBoundingClientRect().top;
      const headerHeight =
        area.querySelector(".ant-table-thead th")?.getBoundingClientRect().height ?? 0;
      const pagination = area.querySelector<HTMLElement>(".ant-pagination");
      const paginationHeight = pagination
        ? pagination.offsetHeight +
          Number.parseFloat(getComputedStyle(pagination).marginTop) +
          Number.parseFloat(getComputedStyle(pagination).marginBottom)
        : 0;

      const available =
        container.clientHeight - offsetTop - headerHeight - paginationHeight - CHROME_EXTRA;
      setHeight(Math.max(MIN_BODY_HEIGHT, Math.floor(available)));
    };

    measure();
    window.addEventListener("resize", measure);
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    for (const child of Array.from(container.children)) {
      observer.observe(child);
    }
    return () => {
      window.removeEventListener("resize", measure);
      observer.disconnect();
    };
  }, []);

  return { areaRef, height };
}
