// scopedMutate, not the top-level "swr" mutate: the app's custom cache provider
// makes the global mutate a silent no-op for every provider-backed key (BRDG-458).
import { scopedMutate } from "@/lib/swr-scoped-mutate";

// Every SWR cache that can hold a ticket: the board list, a sprint-scoped list,
// the per-key detail, or a bounded by-keys list (useTicketsByKeys, e.g. the
// refinement wrap-up and linked-issue views, BRDG-412). Patching all of them
// keeps any open list, hover card, or detail panel in sync without each consumer
// wiring its own handlers. The board's pending-edits self-heal keys off the
// "/api/tickets" list, not "ticketsByKeys:", so patching the latter is safe.
function ticketCacheMatcher(ticketKey: string) {
  const detailKey = `/api/tickets/${encodeURIComponent(ticketKey)}`;
  return (k: unknown) =>
    typeof k === "string" &&
    (k === "/api/tickets" || k.startsWith("/api/tickets?") || k === detailKey || k.startsWith("ticketsByKeys:"));
}

// Optimistically merge `patch` into every cached copy of the ticket (list
// element or detail object), without revalidating yet. Server cache invalidation
// is unreliable in dev, so list/panel UI must be patched client-side to update
// immediately rather than waiting on a revalidation that returns stale data.
export function patchTicketCaches(ticketKey: string, patch: Record<string, unknown>) {
  return scopedMutate(
    ticketCacheMatcher(ticketKey),
    (current: unknown) => {
      if (Array.isArray(current)) {
        return current.map((t) =>
          t && typeof t === "object" && (t as { key?: string }).key === ticketKey
            ? { ...t, ...patch }
            : t,
        );
      }
      if (current && typeof current === "object" && (current as { key?: string }).key === ticketKey) {
        return { ...current, ...patch };
      }
      return current;
    },
    { revalidate: false },
  );
}

// Patch ONLY the per-key detail cache, leaving the board/list caches untouched.
// The ticket detail sidebar uses this for fields that also live on the board row
// (epic, assignee, status, points, business value): the board list is kept current
// by the pendingTicketEdits overlay (registerPendingEdit), and patching the list
// here too would let the board's self-heal mistake this one-shot client patch for a
// real server read and clear the overlay early, snapping the row back to stale data
// (see docs/architecture/optimistic-updates.md). The sidebar's own pickers re-seed
// from the detail object, so that cache still needs the immediate patch.
export function patchTicketDetailCache(ticketKey: string, patch: Record<string, unknown>) {
  const detailKey = `/api/tickets/${encodeURIComponent(ticketKey)}`;
  return scopedMutate(
    detailKey,
    (current: unknown) =>
      current && typeof current === "object" && (current as { key?: string }).key === ticketKey
        ? { ...current, ...patch }
        : current,
    { revalidate: false },
  );
}

// Sentinel the move-sprint endpoint uses for "send to backlog".
const BACKLOG_TARGET = "__backlog__";

// Optimistically move a ticket between sprint-scoped list caches so the change is
// visible at once: drop it from every per-sprint/backlog list except the
// destination, ensure it is present in the destination list, and update its
// sprintId in the All view and the detail object. `ticket` is the current row so
// the destination list can render it before revalidation arrives.
// `targetSprintId` is the raw move value ("__backlog__" or a sprint id). When
// `toTop` is set the row is placed at the top of the destination list (matching
// the server's rankToTopOfSprint/Backlog), so it shows where it lands instead of
// flashing mid-list until revalidation.
export function moveTicketSprintCaches(
  ticket: { key: string; sprintId?: string | null },
  targetSprintId: string,
  toTop = false,
) {
  const newSprintId = targetSprintId === BACKLOG_TARGET ? undefined : targetSprintId;
  const destKey = `/api/tickets?sprintId=${encodeURIComponent(targetSprintId)}`;
  const detailKey = `/api/tickets/${encodeURIComponent(ticket.key)}`;
  const moved = { ...ticket, sprintId: newSprintId };

  // Drop the ticket from any other per-sprint/backlog list it currently sits in.
  void scopedMutate(
    (k) => typeof k === "string" && k.startsWith("/api/tickets?sprintId=") && k !== destKey,
    (current: unknown) =>
      Array.isArray(current) ? current.filter((t) => (t as { key?: string }).key !== ticket.key) : current,
    { revalidate: false },
  );

  // Ensure it appears in the destination list (de-duplicated). The list is sorted
  // by jiraRank ascending, so a rank below the current minimum sorts it to the top.
  void scopedMutate(
    destKey,
    (current: unknown) => {
      const base = Array.isArray(current) ? (current as Array<{ key?: string; jiraRank?: number | null }>) : [];
      const topRank = Math.min(0, ...base.map((t) => t.jiraRank ?? 0)) - 1;
      const exists = base.some((t) => t.key === ticket.key);
      if (exists) {
        return base.map((t) =>
          t.key === ticket.key ? { ...t, sprintId: newSprintId, ...(toTop ? { jiraRank: topRank } : {}) } : t,
        );
      }
      const placed = toTop ? { ...moved, jiraRank: topRank } : moved;
      return toTop ? [placed, ...base] : [...base, placed];
    },
    { revalidate: false },
  );

  // The All view keeps the row; only its sprintId changes (so grouping follows).
  void scopedMutate(
    "/api/tickets",
    (current: unknown) =>
      Array.isArray(current)
        ? current.map((t) => ((t as { key?: string }).key === ticket.key ? { ...t, sprintId: newSprintId } : t))
        : current,
    { revalidate: false },
  );

  // Keep the open detail panel in sync too.
  return scopedMutate(
    detailKey,
    (current: unknown) =>
      current && typeof current === "object" && (current as { key?: string }).key === ticket.key
        ? { ...current, sprintId: newSprintId }
        : current,
    { revalidate: false },
  );
}

// Revalidate exactly the per-sprint lists touched by a move, plus the All view.
// The optimistic patch already relocated the row, but if the destination list was
// opened while the move was still in flight, SWR's mount revalidation can refetch
// the still-stale server cache and drop the row. Calling this AFTER the move
// resolves (the move route has invalidated the now-process-wide server cache by
// then) refetches fresh data so the row reappears within a refresh instead of
// waiting for the next focus/interval revalidation. `sprintIds` are the raw move
// values (the destination plus each row's origin); undefined maps to the backlog.
export function revalidateMovedSprintLists(sprintIds: Array<string | null | undefined>) {
  const keys = new Set<string>(["/api/tickets"]);
  for (const id of sprintIds) {
    keys.add(`/api/tickets?sprintId=${encodeURIComponent(id ?? BACKLOG_TARGET)}`);
  }
  return Promise.all([...keys].map((k) => scopedMutate(k)));
}

// Revalidate every ticket-related cache (list, sprint lists, all details) so a
// change to a child also refreshes the parent epic's child list, etc.
export function revalidateTicketCaches() {
  return scopedMutate((k) => typeof k === "string" && k.startsWith("/api/tickets"));
}

// Revalidate only the caches that can hold this ticket: the lists plus its own
// detail. Used by the live ticket-events stream so one changed ticket does not
// refetch every open detail panel.
export function revalidateTicketCachesFor(ticketKey: string) {
  return scopedMutate(ticketCacheMatcher(ticketKey));
}
