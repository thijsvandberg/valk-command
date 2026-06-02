// Module-level registry of PO-assigned epic base colors (BRDG-250). It lets the
// pure, synchronous getEpicColor() in @/types/ticket resolve a stored color
// without threading a color map through the ~10 call sites that use it. A
// provider loads the map from /api/epics/progress and pushes it here; the
// reactive useEpicColor hook subscribes so the named surfaces re-render when a
// color changes. Colors are indexed by both epicKey and upper-cased name, since
// some surfaces (stakeholder filter chips) only have the epic name.

let byKey = new Map<string, string>();
let byName = new Map<string, string>();
let version = 0;
const listeners = new Set<() => void>();

function emit(): void {
  version += 1;
  for (const listener of listeners) listener();
}

export function subscribeEpicColors(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

export function getEpicColorVersion(): number {
  return version;
}

export interface EpicColorEntry {
  key: string;
  name: string;
  color: string | null;
}

// Replaces the whole registry from the authoritative progress payload.
export function setEpicColorMap(entries: EpicColorEntry[]): void {
  const nextByKey = new Map<string, string>();
  const nextByName = new Map<string, string>();
  for (const entry of entries) {
    if (!entry.color) continue;
    nextByKey.set(entry.key, entry.color);
    if (entry.name) nextByName.set(entry.name.toUpperCase(), entry.color);
  }
  byKey = nextByKey;
  byName = nextByName;
  emit();
}

// Optimistic single-epic patch so the UI updates instantly on a PO edit, before
// the SWR revalidation settles. Passing null clears the override (reset).
export function setEpicColorOverride(
  key: string,
  name: string | null,
  color: string | null,
): void {
  const nextByKey = new Map(byKey);
  const nextByName = new Map(byName);
  if (color) {
    nextByKey.set(key, color);
    if (name) nextByName.set(name.toUpperCase(), color);
  } else {
    nextByKey.delete(key);
    if (name) nextByName.delete(name.toUpperCase());
  }
  byKey = nextByKey;
  byName = nextByName;
  emit();
}

// Resolves a stored base color by epicKey first, then by name. Returns null when
// the epic has no PO-assigned color (caller falls back to the derived default).
export function getStoredEpicBase(keyOrName: string): string | null {
  return byKey.get(keyOrName) ?? byName.get(keyOrName.toUpperCase()) ?? null;
}
