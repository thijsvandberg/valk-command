import type { SidebarData } from "@/hooks/useSidebarData";

// Last-known-good snapshot of the nav popover counts. The popover mounts its
// data hooks only on open, so without a cache every open (and every reload)
// paints empty until the live sources resolve. Persisting the last fully-loaded
// frame lets the popover render populated immediately while it revalidates.
const SNAPSHOT_KEY = "bridge.sidebar-snapshot.v1";

export function readSidebarSnapshot(): SidebarData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_KEY);
    return raw ? (JSON.parse(raw) as SidebarData) : null;
  } catch {
    return null;
  }
}

export function writeSidebarSnapshot(data: SidebarData): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(data));
  } catch {
    // Best-effort cache: ignore quota or serialization failures.
  }
}
