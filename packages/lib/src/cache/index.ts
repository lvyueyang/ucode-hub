/**
 * 内存缓存核心：基于 Map 的带过期时间缓存类
 * 具体缓存实例按模块拆分在 lib/cache/*.cache.ts
 * CacheAdapter 接口预留：当前仅 MemoryCache 实现，未来可替换为 Redis 等分布式缓存适配器
 */

/**
 * 缓存适配器接口：缓存实例的统一契约
 * 预留此接缝以便单实例升级为多实例时，用分布式缓存适配器替换内存实现而不改动业务层
 */
export interface CacheAdapter<T = unknown> {
  /** 获取缓存值（未命中或已过期返回 undefined） */
  get(key: string): T | undefined;
  /** 设置缓存值，ttl 为过期时间（毫秒），不传使用默认 TTL */
  set(key: string, value: T, ttl?: number): void;
  /** 删除缓存 */
  delete(key: string): boolean;
  /** 判断键是否存在且未过期 */
  has(key: string): boolean;
  /** 清空所有缓存 */
  clear(): void;
  /** 获取所有键 */
  keys(): string[];
  /** 缓存条目数量 */
  readonly size: number;
}

/** 缓存选项 */
export interface CacheOptions {
  /** 默认过期时间（毫秒），0 表示永不过期 */
  defaultTTL?: number;
}

/** 缓存条目 */
interface CacheEntry<T> {
  value: T;
  expiresAt: number; // 0 表示永不过期
}

/**
 * 创建带过期时间的内存缓存
 */
export class MemoryCache<T = unknown> implements CacheAdapter<T> {
  private store = new Map<string, CacheEntry<T>>();
  private defaultTTL: number;

  constructor(options: CacheOptions = {}) {
    this.defaultTTL = options.defaultTTL ?? 0;
  }

  /** 获取缓存值 */
  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt > 0 && entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  /** 设置缓存值 */
  set(key: string, value: T, ttl?: number): void {
    const effectiveTTL = ttl ?? this.defaultTTL;
    this.store.set(key, {
      value,
      expiresAt: effectiveTTL > 0 ? Date.now() + effectiveTTL : 0,
    });
  }

  /** 删除缓存 */
  delete(key: string): boolean {
    return this.store.delete(key);
  }

  /** 判断键是否存在且未过期 */
  has(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (entry.expiresAt > 0 && entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  /** 清空所有缓存 */
  clear(): void {
    this.store.clear();
  }

  /** 获取所有键 */
  keys(): string[] {
    return Array.from(this.store.keys());
  }

  /** 缓存条目数量 */
  get size(): number {
    return this.store.size;
  }

  /** 清理过期条目 */
  cleanup(): number {
    const now = Date.now();
    let count = 0;
    for (const [key, entry] of this.store) {
      if (entry.expiresAt > 0 && entry.expiresAt < now) {
        this.store.delete(key);
        count++;
      }
    }
    return count;
  }
}
