import { useSyncExternalStore } from "react";
import type { Ticket } from "@/types/ticket";

// A sprint move is a slow Jira round-trip (seconds), during which any server read
// returns the list WITHOUT the moved row, so a revalidation that fires while the
// move is in flight clobbers the optimistic update and the row vanishes until the
// move finishes and the list refetches. This store keeps a snapshot of each
// in-flight move so the board can re-inject the row into the destination list (and
// keep it out of the origin) across revalidations, until the server catches up or
// a TTL expires. It is the board-level overlay that survives SWR's replace-on-
// revalidate, which a cache patch alone cannot.

const BACKLOG_TARGET = "__backlog__";
// Safety net so an entry never sticks if its target view is never opened (and so
// the server confirmation effect never runs for it).
const TTL_MS = 30_000;

export interface PendingMove {
  ticket: Ticket; // snapshot rendered until the server list includes the row
  targetSprintId: string; // raw move value: "__backlog__" or a sprint id
  at: number;
  // Set once the server move call has resolved. Until then the row is kept in the
  // overlay no matter what the cache says, so an in-flight revalidation can't drop
  // it. The board only clears a move after it is confirmed AND visible in the data.
  confirmed: boolean;
}

// Replaced (not mutated) on every change so useSyncExternalStore sees a new
// reference and re-renders subscribers.
let moves: Map<string, PendingMove> = new Map();
const listeners = new Set<() => void>();

function commit(next: Map<string, PendingMove>) {
  moves = next;
  listeners.forEach((l) => l());
}

export function registerPendingMove(ticket: Ticket, targetSprintId: string, now: number) {
  const next = new Map(moves);
  next.set(ticket.key, { ticket, targetSprintId, at: now, confirmed: false });
  commit(next);
  // Self-clear so an entry never sticks if its destination view is never opened
  // (the board's confirm-on-server effect only runs while that list is mounted).
  setTimeout(() => clearPendingMove(ticket.key), TTL_MS);
}

// Mark a move as server-confirmed: its move call has resolved, so the DB now holds
// the new sprint/rank and the board may clear it as soon as the data shows it.
export function confirmPendingMove(key: string) {
  const move = moves.get(key);
  if (!move || move.confirmed) return;
  const next = new Map(moves);
  next.set(key, { ...move, confirmed: true });
  commit(next);
}

export function clearPendingMove(key: string) {
  if (!moves.has(key)) return;
  const next = new Map(moves);
  next.delete(key);
  commit(next);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function usePendingSprintMoves(): Map<string, PendingMove> {
  return useSyncExternalStore(subscribe, () => moves, () => moves);
}

/**
 * Merge in-flight moves into a per-sprint list so the moved rows show where they
 * land regardless of revalidation timing. Only acts on concrete per-sprint /
 * backlog views (not the All view, which keeps every row anyway). `now` drives the
 * TTL drop. Returns the same array reference when nothing changes.
 */
export function applyPendingMoves(
  list: Ticket[] | undefined,
  activeSprintId: string,
  pending: Map<string, PendingMove>,
  now: number,
): Ticket[] | undefined {
  if (!list || pending.size === 0 || activeSprintId === "__all__") return list;

  const present = new Set(list.map((t) => t.key));
  // Rows that moved AWAY from this view but a stale revalidation re-listed here.
  const removeKeys = new Set<string>();
  // Snapshots to inject at the top because the server list does not have them yet.
  const inject: Ticket[] = [];

  for (const [key, move] of pending) {
    if (now - move.at > TTL_MS) continue; // expired: let the server data stand
    const targetIsActive = move.targetSprintId === activeSprintId;
    if (targetIsActive) {
      if (!present.has(key)) {
        const newSprintId = move.targetSprintId === BACKLOG_TARGET ? undefined : move.targetSprintId;
        inject.push({ ...move.ticket, sprintId: newSprintId });
      }
    } else if (present.has(key)) {
      removeKeys.add(key);
    }
  }

  if (inject.length === 0 && removeKeys.size === 0) return list;

  const kept = removeKeys.size > 0 ? list.filter((t) => !removeKeys.has(t.key)) : list;
  if (inject.length === 0) return kept;

  // List sorts by jiraRank ascending; rank the injected rows below the current
  // minimum so they sit at the top, matching the server's rankToTopOfSprint.
  const topRank = Math.min(0, ...kept.map((t) => t.jiraRank ?? 0)) - 1;
  const placed = inject.map((t) => ({ ...t, jiraRank: topRank }));
  return [...placed, ...kept];
}
