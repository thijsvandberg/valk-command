import { apiFetch } from "@/lib/api-client";

export type GroupSyncKind = "sprint" | "epic";

export interface GroupSyncTarget {
  kind: GroupSyncKind;
  /** Sprint id (numeric string) or epic Jira key. */
  id: string;
  /** Display label for progress and toasts. */
  label: string;
}

export type GroupSyncPhase = "planning" | "syncing" | "reconciling" | "done";

/** Lifecycle of a group sync as surfaced in the UI (header spinner + menu row). */
export type GroupSyncState = "idle" | "running" | "done" | "error";

export interface GroupSyncProgress {
  phase: GroupSyncPhase;
  /** Tickets synced so far (only meaningful during/after "syncing"). */
  done: number;
  /** Total tickets in the plan. */
  total: number;
}

export interface GroupSyncResult {
  synced: number;
  removed: number;
}

// Jira's bulk ticket endpoint accepts up to 100 keys; 25 keeps each request short
// so progress updates stay smooth and a large sprint/epic never hits a wall-clock
// timeout in one shot.
export const TRANCHE_SIZE = 25;

export interface GroupSyncDeps {
  fetchPlan: (target: GroupSyncTarget, signal?: AbortSignal) => Promise<string[]>;
  syncTranche: (keys: string[], signal?: AbortSignal) => Promise<number>;
  reconcile: (target: GroupSyncTarget, currentKeys: string[], signal?: AbortSignal) => Promise<number>;
}

const queryFor = (target: GroupSyncTarget) =>
  target.kind === "epic"
    ? `epicKey=${encodeURIComponent(target.id)}`
    : `sprintId=${encodeURIComponent(target.id)}`;

// Default deps talk to /api/jira/sync-tickets. Injected in tests.
export const defaultGroupSyncDeps: GroupSyncDeps = {
  fetchPlan: async (target, signal) => {
    const res = await apiFetch<{ keys: string[] }>(
      `/api/jira/sync-tickets?mode=plan&${queryFor(target)}`,
      { method: "POST", signal },
    );
    return res?.keys ?? [];
  },
  syncTranche: async (keys, signal) => {
    const res = await apiFetch<{ count?: number }>(
      "/api/jira/sync-tickets",
      { method: "POST", body: { ticketKeys: keys }, signal },
    );
    return res?.count ?? keys.length;
  },
  reconcile: async (target, currentKeys, signal) => {
    const res = await apiFetch<{ removed?: number }>(
      `/api/jira/sync-tickets?mode=reconcile&${queryFor(target)}`,
      { method: "POST", body: { keys: currentKeys }, signal },
    );
    return res?.removed ?? 0;
  },
};

/**
 * Sync every ticket in a sprint or epic in tranches, reporting progress as it goes.
 *
 * Flow: ask Jira for the current membership (plan), sync the keys in batches of
 * TRANCHE_SIZE, then reconcile (restore rank order and detect tickets that left).
 * Each tranche is its own short request, so a large group syncs reliably and the
 * caller can render a live "X of Y" counter.
 */
export async function syncGroupInTranches(
  target: GroupSyncTarget,
  onProgress?: (progress: GroupSyncProgress) => void,
  deps: GroupSyncDeps = defaultGroupSyncDeps,
  signal?: AbortSignal,
): Promise<GroupSyncResult> {
  onProgress?.({ phase: "planning", done: 0, total: 0 });
  const keys = await deps.fetchPlan(target, signal);
  const total = keys.length;

  let synced = 0;
  onProgress?.({ phase: "syncing", done: 0, total });
  for (let i = 0; i < keys.length; i += TRANCHE_SIZE) {
    const batch = keys.slice(i, i + TRANCHE_SIZE);
    const count = await deps.syncTranche(batch, signal);
    synced += count;
    onProgress?.({ phase: "syncing", done: Math.min(synced, total), total });
  }

  onProgress?.({ phase: "reconciling", done: total, total });
  const removed = await deps.reconcile(target, keys, signal);

  onProgress?.({ phase: "done", done: total, total });
  return { synced, removed };
}
