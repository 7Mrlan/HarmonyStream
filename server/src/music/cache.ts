/*
 * 音乐解析内存缓存
 * ----------------
 * Phase D.5 第一版只做轻量 TTL + LRU：
 *   - 命中 provider 搜索结果，避免 /api/chat 反复打外部源
 *   - 命中下一首预解析结果，让 /api/next 走快路径
 * 这里刻意不依赖第三方包；entries 上限和 TTL 都从 env 读，过期立即淘汰。
 */

interface CacheEntry<T> {
  /* 缓存值。 */
  value: T;
  /* 过期时间戳（毫秒）。 */
  expiresAt: number;
}

export interface MusicCacheOptions {
  /* 最大条目数，达到上限后按 LRU 淘汰。 */
  maxEntries: number;
  /* 默认 TTL（毫秒），单条 set 时可覆盖。 */
  defaultTtlMs: number;
  /* 时钟函数，测试时可注入；默认 Date.now。 */
  now?: () => number;
  /* 条目被删除、过期或 LRU 淘汰时触发，用于释放外部资源。 */
  onEvict?: (key: string, value: unknown) => void;
}

export interface MusicCache<T> {
  /* 读取缓存；命中且未过期返回值，否则返回 undefined。 */
  get: (key: string) => T | undefined;
  /* 写入缓存；ttlMs 缺省时使用 defaultTtlMs。 */
  set: (key: string, value: T, ttlMs?: number) => void;
  /* 删除指定 key。 */
  delete: (key: string) => void;
  /* 清空缓存。 */
  clear: () => void;
  /* 当前条目数，用于指标统计。 */
  size: () => number;
}

/*
 * 创建 TTL + LRU 内存缓存。
 * Map 在 JS 中按插入顺序遍历，重新 set 已存在 key 不会更新顺序；
 * 因此每次访问都先 delete 再 set，让最近使用项落到 Map 末尾。
 */
export function createMusicCache<T>(options: MusicCacheOptions): MusicCache<T> {
  const now = options.now ?? Date.now;
  const maxEntries = Math.max(1, Math.floor(options.maxEntries));
  const defaultTtlMs = Math.max(1, Math.floor(options.defaultTtlMs));
  const store = new Map<string, CacheEntry<T>>();

  /* 删除条目并通知调用方释放关联资源。 */
  function evict(key: string): void {
    const entry = store.get(key);
    if (!entry) return;
    store.delete(key);
    options.onEvict?.(key, entry.value);
  }

  /* 命中后把条目重新插入，使其成为最新使用项。 */
  function touch(key: string, entry: CacheEntry<T>): void {
    store.delete(key);
    store.set(key, entry);
  }

  /* 超过容量时淘汰最早插入项。 */
  function evictIfNeeded(): void {
    while (store.size > maxEntries) {
      const oldestKey = store.keys().next().value;
      if (oldestKey === undefined) break;
      evict(oldestKey);
    }
  }

  return {
    get(key) {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= now()) {
        evict(key);
        return undefined;
      }
      touch(key, entry);
      return entry.value;
    },
    set(key, value, ttlMs) {
      const ttl = Math.max(1, Math.floor(ttlMs ?? defaultTtlMs));
      if (store.has(key)) evict(key);
      store.set(key, { value, expiresAt: now() + ttl });
      evictIfNeeded();
    },
    delete(key) {
      evict(key);
    },
    clear() {
      for (const key of store.keys()) {
        evict(key);
      }
      store.clear();
    },
    size() {
      return store.size;
    },
  };
}
