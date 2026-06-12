import { mutate as globalMutate } from "swr";

// Every SWR cache that can hold a ticket: the board list, a sprint-scoped list,
// or the per-key detail. Patching all of them keeps any open list, hover card,
// or detail panel in sync without each consumer wiring its own handlers.
function ticketCacheMatcher(ticketKey: string) {
  const detailKey = `/api/tickets/${encodeURIComponent(ticketKey)}`;
  return (k: unknown) =>
    typeof k === "string" &&
    (k === "/api/tickets" || k.startsWith("/api/tickets?") || k === detailKey);
}

// Optimistically merge `patch` into every cached copy of the ticket (list
// element or detail object), without revalidating yet. Server cache invalidation
// is unreliable in dev, so list/panel UI must be patched client-side to update
// immediately rather than waiting on a revalidation that returns stale data.
export function patchTicketCaches(ticketKey: string, patch: Record<string, unknown>) {
  return globalMutate(
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

// Sentinel the move-sprint endpoint uses for "send to backlog".
const BACKLOG_TARGET = "__backlog__";

// Optimistically move a ticket between sprint-scoped list caches so the change is
// visible at once: drop it from every per-sprint/backlog list except the
// destination, ensure it is present in the destination list, and update its
// sprintId in the All view and the detail object. `ticket` is the current row so
// the destination list can render it before revalidation arrives.
// `targetSprintId` is the raw move value ("__backlog__" or a sprint id).
export function moveTicketSprintCaches(ticket: { key: string; sprintId?: string | null }, targetSprintId: string) {
  const newSprintId = targetSprintId === BACKLOG_TARGET ? undefined : targetSprintId;
  const destKey = `/api/tickets?sprintId=${encodeURIComponent(targetSprintId)}`;
  const detailKey = `/api/tickets/${encodeURIComponent(ticket.key)}`;
  const moved = { ...ticket, sprintId: newSprintId };

  // Drop the ticket from any other per-sprint/backlog list it currently sits in.
  void globalMutate(
    (k) => typeof k === "string" && k.startsWith("/api/tickets?sprintId=") && k !== destKey,
    (current: unknown) =>
      Array.isArray(current) ? current.filter((t) => (t as { key?: string }).key !== ticket.key) : current,
    { revalidate: false },
  );

  // Ensure it appears in the destination list (de-duplicated).
  void globalMutate(
    destKey,
    (current: unknown) => {
      const base = Array.isArray(current) ? (current as Array<{ key?: string }>) : [];
      const exists = base.some((t) => t.key === ticket.key);
      return exists
        ? base.map((t) => (t.key === ticket.key ? { ...t, sprintId: newSprintId } : t))
        : [...base, moved];
    },
    { revalidate: false },
  );

  // The All view keeps the row; only its sprintId changes (so grouping follows).
  void globalMutate(
    "/api/tickets",
    (current: unknown) =>
      Array.isArray(current)
        ? current.map((t) => ((t as { key?: string }).key === ticket.key ? { ...t, sprintId: newSprintId } : t))
        : current,
    { revalidate: false },
  );

  // Keep the open detail panel in sync too.
  return globalMutate(
    detailKey,
    (current: unknown) =>
      current && typeof current === "object" && (current as { key?: string }).key === ticket.key
        ? { ...current, sprintId: newSprintId }
        : current,
    { revalidate: false },
  );
}

// Revalidate every ticket-related cache (list, sprint lists, all details) so a
// change to a child also refreshes the parent epic's child list, etc.
export function revalidateTicketCaches() {
  return globalMutate((k) => typeof k === "string" && k.startsWith("/api/tickets"));
}

// Revalidate only the caches that can hold this ticket: the lists plus its own
// detail. Used by the live ticket-events stream so one changed ticket does not
// refetch every open detail panel.
export function revalidateTicketCachesFor(ticketKey: string) {
  return globalMutate(ticketCacheMatcher(ticketKey));
}
