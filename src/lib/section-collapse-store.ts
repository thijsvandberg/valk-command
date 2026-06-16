// Global, cross-surface collapse state for ticket section headings.
//
// Collapse is a per-heading preference (keyed by a stable section id, NOT by
// ticket), shared instantly across every surface that can co-exist in one
// document (full ticket page, refinement session, sprint-board side panel).
// useLocalStorage only syncs across tabs, so a module-level external store with
// useSyncExternalStore is needed for same-document sharing. Mirrors the pattern
// in epic-color-registry.ts: getSnapshot returns a version number (a fresh
// object each call would make useSyncExternalStore loop).

const STORAGE_KEY = "bridge:section-collapsed";

// Stable section ids. Two surfaces share a section by importing the same key,
// so the refinement "Comments" toggle and the full-view "Jira Comments" toggle
// must reference SECTION_KEYS.jiraComments to stay linked.
export const SECTION_KEYS = {
  attachments: "attachments",
  subtasks: "subtasks",
  linkedIssues: "linked-issues",
  poComments: "po-comments",
  jiraComments: "jira-comments",
  confluence: "confluence",
} as const;

const collapsed = new Map<string, boolean>();
const listeners = new Set<() => void>();
let version = 0;
let hydrated = false;

function hydrate(): void {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    if (parsed && typeof parsed === "object") {
      // Both true and false are stored so an explicit "keep expanded" choice can override a
      // section whose default is collapsed (e.g. empty Linked Issues).
      for (const [key, value] of Object.entries(parsed)) {
        collapsed.set(key, Boolean(value));
      }
    }
  } catch {
    // Corrupt or unavailable storage: start expanded.
  }
}

function persist(): void {
  if (typeof window === "undefined") return;
  try {
    const obj: Record<string, boolean> = {};
    for (const [key, value] of collapsed) {
      obj[key] = value;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // Storage full or unavailable: keep the in-memory state.
  }
}

function emit(): void {
  version += 1;
  for (const listener of listeners) listener();
}

// Cross-tab sync: re-read storage when another tab writes the same key.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e: StorageEvent) => {
    if (e.key !== null && e.key !== STORAGE_KEY) return;
    collapsed.clear();
    hydrated = false;
    hydrate();
    emit();
  });
}

export function subscribeSectionCollapse(listener: () => void): () => void {
  hydrate();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Snapshot is the version number so useSyncExternalStore sees a stable value
// until something actually changes.
export function getSectionCollapseVersion(): number {
  hydrate();
  return version;
}

// Constant across server renders to avoid hydration mismatch (default expanded).
export function getServerSectionCollapseVersion(): number {
  return 0;
}

// `fallback` is the collapse state to assume when the user has never toggled this section, so a
// section can default to collapsed (e.g. empty Linked Issues) without losing an explicit choice.
export function isSectionCollapsed(key: string, fallback = false): boolean {
  hydrate();
  const stored = collapsed.get(key);
  return stored === undefined ? fallback : stored;
}

export function setSectionCollapsed(key: string, value: boolean): void {
  hydrate();
  if (collapsed.get(key) === value) return;
  collapsed.set(key, value);
  persist();
  emit();
}

export function toggleSectionCollapsed(key: string, fallback = false): void {
  setSectionCollapsed(key, !isSectionCollapsed(key, fallback));
}

// Test-only: clear in-memory + persisted state so the module-level store does
// not leak between test cases.
export function __resetSectionCollapseStore(): void {
  collapsed.clear();
  version = 0;
  hydrated = false;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}
