export const RECENTLY_VIEWED_KEY = "bridge:recently-viewed";
export const RECENTLY_VIEWED_EVENT = "bridge:recently-viewed";
export const MAX_RECENTLY_VIEWED = 10;

export interface RecentlyViewedEntry {
  key: string;
  title?: string;
  viewedAt: number;
}

function isEntry(value: unknown): value is RecentlyViewedEntry {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.key === "string" &&
    v.key.length > 0 &&
    typeof v.viewedAt === "number" &&
    (v.title === undefined || typeof v.title === "string")
  );
}

function parseEntries(raw: string | null): RecentlyViewedEntry[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEntry).slice(0, MAX_RECENTLY_VIEWED);
  } catch {
    return [];
  }
}

export function readRecentlyViewed(): RecentlyViewedEntry[] {
  if (typeof window === "undefined") return [];
  return parseEntries(localStorage.getItem(RECENTLY_VIEWED_KEY));
}

/**
 * Records a ticket as the most recently viewed one. Side-effect only, callable
 * from any callback or effect: de-dupes by key (a re-view moves the entry to
 * the top), caps the list at MAX_RECENTLY_VIEWED, and notifies same-tab
 * listeners via a custom event (the browser's `storage` event only fires in
 * other tabs).
 */
export function recordTicketView(key: string, title?: string): void {
  if (typeof window === "undefined" || !key) return;
  const current = readRecentlyViewed();
  const existing = current.find((e) => e.key === key);
  const next: RecentlyViewedEntry[] = [
    // Carry the previous title forward when a call site only knows the key.
    { key, title: title || existing?.title, viewedAt: Date.now() },
    ...current.filter((e) => e.key !== key),
  ].slice(0, MAX_RECENTLY_VIEWED);
  try {
    localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(next));
  } catch {
    return; // Storage full or unavailable; quick access is best-effort.
  }
  window.dispatchEvent(new Event(RECENTLY_VIEWED_EVENT));
}

/** Empties the list (the footer's Clear action) and notifies listeners. */
export function clearRecentlyViewed(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(RECENTLY_VIEWED_KEY);
  } catch {
    return;
  }
  window.dispatchEvent(new Event(RECENTLY_VIEWED_EVENT));
}

// ---------------------------------------------------------------------------
// useSyncExternalStore adapters. The snapshot is cached by the raw string so
// repeated reads return a stable reference (required to avoid render loops).
// ---------------------------------------------------------------------------

const EMPTY: RecentlyViewedEntry[] = [];
let snapshotRaw: string | null = null;
let snapshotValue: RecentlyViewedEntry[] = EMPTY;

export function getRecentlyViewedSnapshot(): RecentlyViewedEntry[] {
  const raw = localStorage.getItem(RECENTLY_VIEWED_KEY);
  if (raw !== snapshotRaw) {
    snapshotRaw = raw;
    snapshotValue = parseEntries(raw);
  }
  return snapshotValue;
}

export function getRecentlyViewedServerSnapshot(): RecentlyViewedEntry[] {
  return EMPTY;
}

export function subscribeRecentlyViewed(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === RECENTLY_VIEWED_KEY) onChange();
  };
  window.addEventListener(RECENTLY_VIEWED_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(RECENTLY_VIEWED_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}
