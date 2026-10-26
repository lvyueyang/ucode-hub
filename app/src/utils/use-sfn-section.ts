/**
 * 分区块异步加载：挂载后拉取数据，提供 loading / failed
 *
 * 适用场景：一个页面由多个相互独立的区块组成，任一块失败不应影响其余区块
 * （如仪表盘、总览页）。失败的区块降级展示，不阻塞页面。
 *
 * 约定：fetcher 必须为稳定引用（用 useCallback 包裹），否则会重复请求。
 */
import { useCallback, useEffect, useRef, useState } from "react";

/** 区块异步数据状态 */
export interface SfnSectionState<T> {
  data: T | null;
  loading: boolean;
  /** 请求失败（含无权限），区块降级展示 */
  failed: boolean;
}

export function useSfnSection<T>(fetcher: () => Promise<T>): SfnSectionState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  /** 请求序号：fetcher 变更或卸载后作废在途响应，避免用旧结果覆盖新区块状态 */
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      const result = await fetcher();
      if (requestId !== requestIdRef.current) return;
      setData(result);
      setFailed(false);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      // 区块级降级：提示由 API 层统一出口负责，这里只保留诊断信息
      console.warn("[section]", (err as Error).message);
      setFailed(true);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [fetcher]);

  useEffect(() => {
    void load();
    return () => {
      // 卸载或 fetcher 变更时作废在途响应
      requestIdRef.current++;
    };
  }, [load]);

  return { data, loading, failed };
}
