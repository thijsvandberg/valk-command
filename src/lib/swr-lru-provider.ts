import type { Cache, State } from "swr";

// Bounds the global SWR cache so a long-lived tab cannot grow without limit
// (BRDG-387). SWR's default provider is a plain Map with no eviction, so every
// distinct key a tab ever fetches (each sprint board, ticket detail, refinement
// conversation) stays resident for the life of the tab.
//
// Safe to evict because: (a) per-key subscriber/revalidator bookkeeping lives in
// SWR's WeakMap keyed by the cache object, not as entries here, so dropping a
// data key never orphans subscriber state; (b) the snap-back overlay
// (pendingTicketEdits / pendingSprintMoves) lives outside SWR and re-applies on
// every render, so an evicted-then-refetched list key cannot lose a pending edit;
// (c) every {revalidate:false} cache patch mirrors a server write, so a refetched
// cold key returns correct data. See docs/architecture/client-data-and-memory.md.

export const DEFAULT_MAX_ENTRIES = 300;
export const DEFAULT_FRESHNESS_MS = 60_000;

export interface LruProviderOptions {
  // Soft ceiling on the number of evictable (real data) keys.
  maxEntries?: number;
  // A key touched within this window is never evicted, so a key with an active
  // but momentarily idle subscriber is never pulled out from under its component.
  freshnessMs?: number;
  // Injectable clock for deterministic tests.
  now?: () => number;
}

type CacheValue = State<unknown, unknown>;

// SWR namespaces its own module keys with a "$" prefix (e.g. "$inf$" for
// useSWRInfinite, "$sub$" for useSWRSubscription). None are used today, but the
// LRU must never count or evict them: they are bookkeeping, not cached payloads.
function isProtectedKey(key: string): boolean {
  return key.startsWith("$");
}

/**
 * Creates an SWR `provider` factory backing the cache with an access-order LRU.
 * A native Map preserves insertion order; deleting and re-inserting a key on
 * every read/write moves it to the tail (most-recently-used), so the head is the
 * least-recently-used eviction candidate.
 */
export function createLruProvider(
  options: LruProviderOptions = {},
): (cache?: Readonly<Cache>) => Cache {
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const freshnessMs = options.freshnessMs ?? DEFAULT_FRESHNESS_MS;
  const now = options.now ?? (() => Date.now());

  return (initialCache?: Readonly<Cache>) => {
    const store = new Map<string, CacheValue>();
    const touchedAt = new Map<string, number>();

    // Carry over anything SWR already cached when the provider is installed
    // (defensive: the provider is created at mount, before any fetch).
    if (initialCache && typeof initialCache.keys === "function") {
      for (const key of initialCache.keys()) {
        const value = initialCache.get(key) as CacheValue | undefined;
        if (value !== undefined) {
          store.set(key, value);
          touchedAt.set(key, now());
        }
      }
    }

    const touch = (key: string, value: CacheValue) => {
      // Map.set on an existing key keeps its position, so delete first to move
      // the key to the tail (most-recently-used).
      store.delete(key);
      store.set(key, value);
      touchedAt.set(key, now());
    };

    const evictIfNeeded = () => {
      let evictable = 0;
      for (const key of store.keys()) if (!isProtectedKey(key)) evictable++;
      if (evictable <= maxEntries) return;

      const nowTs = now();
      for (const key of store.keys()) {
        if (evictable <= maxEntries) break;
        if (isProtectedKey(key)) continue;
        if (nowTs - (touchedAt.get(key) ?? 0) < freshnessMs) continue;
        store.delete(key);
        touchedAt.delete(key);
        evictable--;
      }
    };

    const cache: Cache = {
      keys() {
        // Return a snapshot iterator, NOT store.keys() (a live view). `get`
        // reorders the store (delete + re-insert) to maintain access order, so
        // a consumer that iterates keys() while calling get() in the loop (SWR
        // does this on mutate/revalidate broadcasts) would otherwise re-visit
        // the moved key forever — a synchronous infinite loop that freezes the
        // whole app (regression from the access-order LRU in BRDG-387).
        return [...store.keys()][Symbol.iterator]();
      },
      get(key: string) {
        const value = store.get(key);
        if (value !== undefined) touch(key, value);
        return value;
      },
      set(key: string, value: CacheValue) {
        touch(key, value);
        evictIfNeeded();
      },
      delete(key: string) {
        store.delete(key);
        touchedAt.delete(key);
      },
    };

    return cache;
  };
}
