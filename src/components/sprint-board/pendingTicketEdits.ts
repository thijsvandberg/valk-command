import { useSyncExternalStore } from "react";
import type { Ticket } from "@/types/ticket";

// Optimistic-edit overlay (BRDG-357). See docs/architecture/optimistic-updates.md.
//
// A local board edit (status, assignee, epic, scores, ...) is shown immediately,
// but the board refetches its list constantly: a 60s poll, on window focus, when a
// picker portal closes, and after a background Jira sync. Any of those replaces the
// whole SWR list with server data. If the server has not yet caught up - Jira's
// read-after-write lag, or the short server-side response cache serving a pre-write
// snapshot - that stale data overwrites the edit and the row "snaps back" until the
// server catches up (often a minute later).
//
// Patching the SWR cache once (mutate / optimisticData) does NOT survive this: the
// very next revalidation replaces it. This store is the render-time overlay that DOES
// survive, mirroring pendingSprintMoves.ts for the sprint field: every edit is
// re-applied on top of whatever the list currently holds, on every render, until the
// server data confirms the value (self-heal) or a TTL safety net expires. A snap-back
// is then structurally impossible regardless of which refetch fired.
//
// Any new editable board field should register here rather than inventing a new
// optimistic mechanism.

// Fields a user edits on the board that are reconciled from a server read and would
// otherwise snap back. All live on the Ticket list object.
export type EditableField =
  | "jiraStatus"
  | "assignee"
  | "epic"
  | "epicKey"
  | "type"
  | "title"
  | "flagged"
  | "businessValue"
  | "guestimation"
  | "storyPoints"
  | "openSubtaskCount"
  | "totalSubtaskCount"
  | "poStatus"
  | "readiness"
  | "testDocState";

// Safety net so an edit never sticks forever if the server never reflects it (e.g. a
// Jira field that silently rejected the write). Matches pendingSprintMoves' TTL.
const TTL_MS = 30_000;

export interface PendingEdit {
  key: string; // ticket key
  field: EditableField;
  value: unknown; // optimistic value rendered until the server confirms it
  at: number;
  // Set once the write call has resolved OK. Until then the edit is kept no matter
  // what the list says (so an in-flight revalidation can't drop it). The overlay is
  // only cleared once the edit is confirmed AND the server data matches it - clearing
  // earlier would let a stale revalidation win the race (see pendingSprintMoves).
  confirmed: boolean;
}

function editId(key: string, field: EditableField): string {
  return `${key}::${field}`;
}

// Replaced (not mutated) on every change so useSyncExternalStore sees a new reference.
let edits: Map<string, PendingEdit> = new Map();
const listeners = new Set<() => void>();

function commit(next: Map<string, PendingEdit>) {
  edits = next;
  listeners.forEach((l) => l());
}

export function registerPendingEdit(key: string, field: EditableField, value: unknown, now: number) {
  const next = new Map(edits);
  next.set(editId(key, field), { key, field, value, at: now, confirmed: false });
  commit(next);
  // Self-clear so an edit never sticks if the server never reflects it (the board's
  // confirm-on-server effect would then never clear it).
  setTimeout(() => clearPendingEdit(key, field), TTL_MS);
}

// Mark a write as resolved: the server accepted it, so the board may clear the overlay
// as soon as the list data shows the value.
export function confirmPendingEdit(key: string, field: EditableField) {
  const id = editId(key, field);
  const edit = edits.get(id);
  if (!edit || edit.confirmed) return;
  const next = new Map(edits);
  next.set(id, { ...edit, confirmed: true });
  commit(next);
}

export function clearPendingEdit(key: string, field: EditableField) {
  const id = editId(key, field);
  if (!edits.has(id)) return;
  const next = new Map(edits);
  next.delete(id);
  commit(next);
}

// True while an optimistic value for this field should still win over server data.
// Lets a map-rendered field (poStatus/readiness, reconciled outside the list overlay)
// reuse the same store to decide whether a revalidation may overwrite it.
export function hasPendingEdit(key: string, field: EditableField): boolean {
  return edits.has(editId(key, field));
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function usePendingTicketEdits(): Map<string, PendingEdit> {
  return useSyncExternalStore(subscribe, () => edits, () => edits);
}

// Structural equality good enough for the values we store (primitives, the small
// Assignee object). Used to detect when the server has caught up to an edit.
export function valuesMatch(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a === "object" && typeof b === "object") {
    // `assignee` is the only object-valued overlay field. The optimistic value
    // ({name, initials, color}) and the server value (which also carries avatar /
    // accountId) differ in shape, so a full-object stringify — itself key-order
    // fragile — never matched and the overlay lingered to its 30s TTL (BRDG-405).
    // Compare the meaningful identity (the display name) instead.
    const aName = (a as { name?: unknown }).name;
    const bName = (b as { name?: unknown }).name;
    if (typeof aName === "string" || typeof bName === "string") return aName === bName;
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

/**
 * Overlay every live edit on top of the list so optimistic values survive any
 * revalidation. Expired edits (past TTL) are skipped so stale server data can stand.
 * Returns the same array reference when nothing changes.
 */
export function applyPendingEdits(
  list: Ticket[] | undefined,
  pending: Map<string, PendingEdit>,
  now: number,
): Ticket[] | undefined {
  if (!list || pending.size === 0) return list;

  // Group live edits by ticket key so each row is cloned at most once.
  const byKey = new Map<string, PendingEdit[]>();
  for (const edit of pending.values()) {
    if (now - edit.at > TTL_MS) continue;
    const arr = byKey.get(edit.key);
    if (arr) arr.push(edit);
    else byKey.set(edit.key, [edit]);
  }
  if (byKey.size === 0) return list;

  let changed = false;
  const next = list.map((t) => {
    const rowEdits = byKey.get(t.key);
    if (!rowEdits) return t;
    let row = t;
    for (const edit of rowEdits) {
      if (valuesMatch((row as unknown as Record<string, unknown>)[edit.field], edit.value)) continue;
      row = { ...row, [edit.field]: edit.value };
      changed = true;
    }
    return row;
  });
  return changed ? next : list;
}

// Test-only: reset module state between cases.
export function __resetPendingEdits() {
  edits = new Map();
  listeners.clear();
}

// Test-only: read the current edits map directly (non-reactive).
export function __getPendingEdits(): Map<string, PendingEdit> {
  return edits;
}
