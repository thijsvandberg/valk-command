const MAX_ENTRIES = 200;

interface CacheEntry<T = unknown> {
  value: T;
  expiresAt: number;
  lastAccessed: number;
}

let hits = 0;
let misses = 0;

const store = new Map<string, CacheEntry>();

function evictIfNeeded() {
  if (store.size <= MAX_ENTRIES) return;

  // LRU eviction: remove the least recently accessed entry
  let oldestKey: string | null = null;
  let oldestAccess = Infinity;
  for (const [key, entry] of store) {
    if (entry.lastAccessed < oldestAccess) {
      oldestAccess = entry.lastAccessed;
      oldestKey = key;
    }
  }
  if (oldestKey) store.delete(oldestKey);
}

export const cache = {
  get<T = unknown>(key: string): T | undefined {
    const entry = store.get(key);
    if (!entry) {
      misses++;
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      store.delete(key);
      misses++;
      return undefined;
    }
    hits++;
    entry.lastAccessed = Date.now();
    return entry.value as T;
  },

  set<T = unknown>(key: string, value: T, ttlMs: number): void {
    store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
      lastAccessed: Date.now(),
    });
    evictIfNeeded();
  },

  /** Invalidate entries whose keys match a prefix or regex pattern */
  invalidate(pattern: string | RegExp): number {
    const regex = typeof pattern === "string" ? new RegExp(`^${escapeRegex(pattern)}`) : pattern;
    let count = 0;
    for (const key of store.keys()) {
      if (regex.test(key)) {
        store.delete(key);
        count++;
      }
    }
    return count;
  },

  flush(): void {
    store.clear();
    hits = 0;
    misses = 0;
  },

  stats(): { hits: number; misses: number; entries: number; hitRate: string } {
    const total = hits + misses;
    return {
      hits,
      misses,
      entries: store.size,
      hitRate: total > 0 ? `${((hits / total) * 100).toFixed(1)}%` : "0%",
    };
  },
};

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
