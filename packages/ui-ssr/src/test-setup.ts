/**
 * Vitest 测试环境初始化
 * Vitest 的 jsdom 环境在 Node 22+ 下未向 window 暴露 localStorage/sessionStorage，
 * 而 Node 22+ 的全局 bare localStorage 在未启用 --localstorage-file 时为 undefined，
 * 导致主题等 DOM 测试读取到未定义的存储对象。（参见 Vitest + Node WebStorage 兼容性问题）
 *
 * 这里提供一份内存版 Storage，同时挂到 globalThis 与 window：
 * - bare `localStorage`（use-theme-mode.ts 使用）解析到 globalThis
 * - `window.localStorage` 路径同样可用
 * 两处共享同一实例，保证读写一致；任务结束后由 vitest 环境自重建，无需手工清理。
 */

type KvStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "clear" | "key" | "length">;

/** 创建内存版 Storage，满足 DOM Storage 接口的读写行为 */
function createMemoryStorage(): KvStorage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => {
      store.clear();
    },
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) =>
      index >= 0 && index < store.size ? Array.from(store.keys())[index] : null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
  };
}

const localStorageMock = createMemoryStorage();
const sessionStorageMock = createMemoryStorage();

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: localStorageMock,
});
Object.defineProperty(globalThis, "sessionStorage", {
  configurable: true,
  value: sessionStorageMock,
});

if (typeof window !== "undefined") {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: localStorageMock,
  });
  Object.defineProperty(window, "sessionStorage", {
    configurable: true,
    value: sessionStorageMock,
  });

  // jsdom 默认未实现 matchMedia，用例会按需 mock；此处提供兜底避免未 mock 时崩溃
  if (typeof window.matchMedia !== "function") {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }
}
