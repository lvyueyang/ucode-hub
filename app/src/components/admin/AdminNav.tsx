/**
 * 管理端侧边栏导航：分组折叠（localStorage 持久化）+ 激活项高亮
 * 折叠动画基于 CSS grid-template-rows 过渡，无需测量内容高度
 */
import { RightOutlined } from "@ant-design/icons";
import { Link, useLocation } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { NAV_GROUPS } from "./nav-config";

/** 折叠分组持久化 key（与 admin-theme storageKey 命名风格一致） */
const COLLAPSE_STORAGE_KEY = "admin-nav-collapsed-groups";

/** 判断当前路径是否匹配菜单项 */
function isActive(itemKey: string, currentPath: string): boolean {
  if (itemKey === "/admin") return currentPath === "/admin";
  return currentPath === itemKey || currentPath.startsWith(`${itemKey}/`);
}

/** 首次访问（未写入折叠偏好）时默认折叠的分组索引集合 */
function defaultCollapsedGroups(): Set<number> {
  return new Set(
    NAV_GROUPS.map((group, index) => (group.defaultCollapsed ? index : -1)).filter((i) => i >= 0),
  );
}

/** 从 localStorage 读取折叠分组索引集合 */
function readCollapsedGroups(): Set<number> {
  const fallback = defaultCollapsedGroups();
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(COLLAPSE_STORAGE_KEY);
    if (!raw) return fallback;
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return fallback;
    return new Set(list.filter((n): n is number => typeof n === "number"));
  } catch {
    return fallback;
  }
}

/** 将折叠分组索引集合写入 localStorage */
function writeCollapsedGroups(groups: Set<number>) {
  try {
    window.localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify([...groups]));
  } catch {
    // 存储不可用时忽略，不影响菜单使用
  }
}

/**
 * 分组折叠状态 hook
 * 折叠状态以 Set<number> 存分组索引，变更时同步持久化
 */
function useNavCollapse(groupCount: number) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(readCollapsedGroups);

  // 分组数量变化时清理越界索引
  useEffect(() => {
    setCollapsedGroups((prev) => {
      const valid = [...prev].filter((i) => i >= 0 && i < groupCount);
      if (valid.length === prev.size) return prev;
      const next = new Set(valid);
      writeCollapsedGroups(next);
      return next;
    });
  }, [groupCount]);

  /** 切换指定分组的折叠状态 */
  const toggleGroup = useCallback((index: number) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      writeCollapsedGroups(next);
      return next;
    });
  }, []);

  /** 展开指定分组（路由切换到激活项时调用） */
  const expandGroup = useCallback((index: number) => {
    setCollapsedGroups((prev) => {
      if (!prev.has(index)) return prev;
      const next = new Set(prev);
      next.delete(index);
      writeCollapsedGroups(next);
      return next;
    });
  }, []);

  return { collapsedGroups, toggleGroup, expandGroup };
}

export function AdminNav({ collapsed }: { collapsed: boolean }) {
  const { pathname } = useLocation();
  const { collapsedGroups, toggleGroup, expandGroup } = useNavCollapse(NAV_GROUPS.length);

  // 路由变化时自动展开包含当前激活项的分组
  // 初始挂载跳过：用户手动折叠「当前所在分组」并刷新后，持久化偏好不应被覆盖
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    NAV_GROUPS.forEach((group, index) => {
      if (group.items.some((item) => isActive(item.key, pathname))) {
        expandGroup(index);
      }
    });
  }, [pathname, expandGroup]);

  return (
    <nav className="scrollbar-thin flex-1 overflow-y-auto overflow-x-hidden pt-2 pb-80">
      {NAV_GROUPS.map((group, index) => {
        // 侧边栏图标模式下忽略折叠状态，保证所有图标可见
        const open = collapsed ? true : !collapsedGroups.has(index);
        return (
          <div key={group.label} className="mb-1">
            {!collapsed && (
              <button
                type="button"
                onClick={() => toggleGroup(index)}
                aria-expanded={open}
                className="flex w-full cursor-pointer items-center justify-between px-4 py-2 text-left transition-colors hover:bg-sidebar-accent/60"
              >
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </span>
                <RightOutlined
                  className={`text-[10px] text-muted-foreground transition-transform duration-200 ${
                    open ? "rotate-90" : ""
                  }`}
                />
              </button>
            )}
            {/* 展开/收起动画：grid 行高 0fr ↔ 1fr */}
            <div
              className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              }`}
            >
              <div className="min-h-0 overflow-hidden">
                {group.items.map((item) => {
                  const active = isActive(item.key, pathname);
                  return (
                    <Link
                      key={item.key}
                      to={item.key}
                      title={collapsed ? item.label : undefined}
                      className={`mx-2 my-0.5 flex items-center gap-3 border-l-[3px] px-3 py-2 text-sm transition-colors ${
                        collapsed ? "justify-center border-l-0 px-0" : ""
                      } ${
                        active
                          ? "border-l-sidebar-primary bg-sidebar-accent font-medium text-sidebar-primary"
                          : "border-l-transparent text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                      }`}
                    >
                      <span className="flex shrink-0 items-center justify-center text-base">
                        <item.icon />
                      </span>
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </nav>
  );
}
