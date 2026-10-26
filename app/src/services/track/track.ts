/**
 * 客户端埋点追踪 SDK：自动采集页面信息，通过 Server Function 上报事件到服务端
 */
import { trackEventSFn } from "#/services/track/track.functions";

interface TrackConfig {
  /** 是否自动采集 PageView 事件 */
  autoPageView?: boolean;
}

interface TrackState {
  sessionId: string;
  userId: string | undefined;
  config: TrackConfig;
}

const SESSION_KEY = "_track_session_id";

function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${random}`;
}

function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "";
  const stored = sessionStorage.getItem(SESSION_KEY);
  if (stored) return stored;
  const newId = generateSessionId();
  sessionStorage.setItem(SESSION_KEY, newId);
  return newId;
}

const state: TrackState = {
  sessionId: "",
  userId: undefined,
  config: { autoPageView: true },
};

/** 初始化追踪 SDK，自动采集 PageView */
export function init(config?: TrackConfig): void {
  if (typeof window === "undefined") return;

  state.config = { ...state.config, ...config };
  state.sessionId = getOrCreateSessionId();

  if (state.config.autoPageView) {
    track("PageView", {});
  }
}

/** 设置当前用户 ID（登录后调用） */
export function setUserId(userId: string | undefined): void {
  state.userId = userId;
}

export function getSessionId(): string {
  return state.sessionId;
}

/**
 * 解析 User Agent 获取浏览器名称+版本
 * 不依赖第三方库，纯字符串匹配
 */
function parseBrowser(ua: string): string {
  if (/Edg\//.test(ua)) {
    const m = ua.match(/Edg\/(\d+)/);
    return m ? `Edge ${m[1]}` : "Edge";
  }
  if (/Chrome\//.test(ua) && !/OPR\//.test(ua)) {
    const m = ua.match(/Chrome\/(\d+)/);
    return m ? `Chrome ${m[1]}` : "Chrome";
  }
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) {
    const m = ua.match(/Version\/(\d+)/);
    return m ? `Safari ${m[1]}` : "Safari";
  }
  if (/Firefox\//.test(ua)) {
    const m = ua.match(/Firefox\/(\d+)/);
    return m ? `Firefox ${m[1]}` : "Firefox";
  }
  if (/OPR\//.test(ua)) {
    const m = ua.match(/OPR\/(\d+)/);
    return m ? `Opera ${m[1]}` : "Opera";
  }
  return "Unknown";
}

/** 解析 User Agent 获取操作系统名称 */
function parseOS(ua: string): string {
  if (/Windows NT 10/.test(ua)) return "Windows 10/11";
  if (/Windows NT 6\.3/.test(ua)) return "Windows 8.1";
  if (/Windows NT 6\.1/.test(ua)) return "Windows 7";
  if (/Windows/.test(ua)) return "Windows";
  if (/iPhone|iPad|iPod/.test(ua)) {
    const m = ua.match(/OS (\d+_\d+)/);
    return m ? `iOS ${m[1].replace("_", ".")}` : "iOS";
  }
  if (/Android/.test(ua)) {
    const m = ua.match(/Android (\d+[._]\d*)/);
    return m ? `Android ${m[1]}` : "Android";
  }
  if (/Mac OS X/.test(ua)) {
    const m = ua.match(/Mac OS X (\d+[._]\d+)/);
    return m ? `macOS ${m[1].replace("_", ".")}` : "macOS";
  }
  if (/Linux/.test(ua)) return "Linux";
  return "Unknown";
}

/** 解析 User Agent 获取设备类型 */
function parseDeviceType(ua: string): string {
  if (/iPad|Tablet|PlayBook/.test(ua) || (/Android/.test(ua) && !/Mobi/.test(ua))) {
    return "Tablet";
  }
  if (/Mobi|Android|iPhone|iPod/.test(ua)) {
    return "Mobile";
  }
  return "Desktop";
}

/** 获取浏览器端系统属性（UA 解析 + 屏幕信息） */
function collectSystemProps(): Record<string, unknown> {
  const ua = navigator.userAgent;
  return {
    $user_agent: ua,
    $browser: parseBrowser(ua),
    $os: parseOS(ua),
    $device_type: parseDeviceType(ua),
    $screen_size: `${window.screen.width}x${window.screen.height}`,
    $language: navigator.language,
  };
}

/** 手动上报事件 */
export async function track(eventName: string, properties: Record<string, unknown>): Promise<void> {
  if (typeof window === "undefined") return;

  const autoProps: Record<string, unknown> = {
    url: window.location.href,
    referer: document.referrer || undefined,
    page_name: document.title,
    ...collectSystemProps(),
  };

  const payload = {
    time: Date.now(),
    userId: state.userId || undefined,
    sessionId: state.sessionId || getOrCreateSessionId(),
    name: eventName,
    properties: { ...autoProps, ...properties },
  };

  // 异步上报，不阻塞页面
  trackEventSFn({ data: payload }).catch((err) => {
    // 埋点失败不影响业务流程
    console.error("[track]", (err as Error).message);
  });
}

let routeTrackingCleanup: (() => void) | null = null;

/** 启动 SPA 路由追踪：仅 pushState / popstate 触发 PageView，replaceState 不触发（非导航） */
export function startRouteTracking(): void {
  if (typeof window === "undefined") return;

  // 避免重复注册（HMR / StrictMode 双重挂载）
  if (routeTrackingCleanup) return;

  const originalPushState = history.pushState;

  history.pushState = function (...args) {
    originalPushState.apply(this, args);
    track("PageView", {});
  };

  const popstateHandler = () => {
    track("PageView", {});
  };

  window.addEventListener("popstate", popstateHandler);

  routeTrackingCleanup = () => {
    history.pushState = originalPushState;
    window.removeEventListener("popstate", popstateHandler);
    routeTrackingCleanup = null;
  };
}

/** 停止路由追踪，恢复浏览器原生 API（useEffect 清理时调用） */
export function stopRouteTracking(): void {
  if (routeTrackingCleanup) {
    routeTrackingCleanup();
  }
}
