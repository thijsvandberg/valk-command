// Per-tab identity for self-echo suppression in live ticket updates. Every
// mutating apiFetch carries it as the X-Bridge-Client header; write routes
// echo it back as the ticket event's origin so the originating tab can skip
// its own highlight while other tabs light up.

export const CLIENT_ID_HEADER = "x-bridge-client";

const STORAGE_KEY = "bridge-client-id";

let memoryId: string | null = null;

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `tab-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/**
 * Stable id for this browser tab. sessionStorage scopes it per tab and keeps
 * it across reloads; falls back to an in-memory id when storage is blocked.
 * Returns null on the server.
 */
export function getClientId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    let id = window.sessionStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = generateId();
      window.sessionStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    if (!memoryId) memoryId = generateId();
    return memoryId;
  }
}
