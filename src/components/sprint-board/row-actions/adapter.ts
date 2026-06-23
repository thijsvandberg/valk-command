import { mutate as globalMutate, type KeyedMutator } from "swr";
import type { Ticket } from "@/types/ticket";
import {
  registerPendingEdit,
  confirmPendingEdit,
  clearPendingEdit,
} from "@/components/sprint-board/pendingTicketEdits";
import {
  registerPendingMove,
  confirmPendingMove,
  clearPendingMove,
} from "@/components/sprint-board/pendingSprintMoves";

/**
 * Surface-agnostic data contract for the shared row-actions dispatch (BRDG-374).
 *
 * `useTicketActions` (the board's per-row side-panel handlers) reads tickets and
 * revalidates through this minimal slice; the bulk dispatch in `useRowActions`
 * additionally drives the optimism protocol below.
 */
export interface RowDataAdapter {
  getTicket(key: string): Ticket | undefined;
  getTickets(): Ticket[];
  /** Revalidate the backing list. */
  mutate(): void;
  /** SWR key of the list currently being viewed (board uses it to decide cache surgery). */
  activeListKey: string | null;
  /** Sprint id -> display name, for the placement rule (BRDG-370). */
  sprintNameMap: Record<string, string>;
}

/** Fields a bulk action can edit; the optimistic display protocol is keyed on these. */
export type RowEditField = "jiraStatus" | "readiness" | "epic" | "flagged" | "assignee" | "labels";

/** Value shape carried by `beginEdit` for the `epic` field. */
export interface EpicEditValue {
  epicKey: string | null;
  epicName: string | null;
}

/**
 * Full dispatch contract for the shared bulk handlers (BRDG-374). The dispatch
 * (move/status/epic/flag/...) is identical across the Sprint Board, Epic children
 * and Inbox; only HOW each surface reflects the change optimistically differs, and
 * that lives behind these hooks:
 *
 * - field edits: `beginEdit` before the write, `confirmEdit(okKeys)` /
 *   `revertEdit(failedKeys)` after. The adapter owns its surface's optimistic
 *   display (board overlay + readiness map; epic `onChildOptimistic`; inbox none)
 *   AND any post-write revalidation.
 * - sprint moves: `beginMove` records the destination so the row stays visible,
 *   `confirmMove` commits the destination-cache write (board) or revalidates
 *   (inbox/epic), `revertMove` rolls the optimistic state back on a failed move.
 */
export interface RowActionsAdapter extends RowDataAdapter {
  beginEdit(keys: string[], field: RowEditField, value: unknown): void;
  confirmEdit(keys: string[], field: RowEditField): void;
  revertEdit(keys: string[], field: RowEditField): void;
  beginMove(moved: Ticket[], targetSprintId: string, targetSprintName: string | null): void;
  confirmMove(args: { moved: Ticket[]; keys: string[]; targetSprintId: string; newSprintId: string | undefined }): void;
  revertMove(keys: string[]): void;
}

/**
 * Board data adapter over the `Ticket[]` SWR caches. Used by `useTicketActions`
 * for the per-row side-panel handlers; the bulk dispatch wraps it with
 * `makeBoardDispatchAdapter`.
 */
export function makeBoardAdapter(
  apiTickets: Ticket[] | undefined,
  mutateTickets: KeyedMutator<Ticket[]>,
  activeListKey: string | null,
  sprintNameMap: Record<string, string>,
): RowDataAdapter {
  return {
    getTicket: (key) => apiTickets?.find((t) => t.key === key),
    getTickets: () => apiTickets ?? [],
    mutate: () => { void mutateTickets(); },
    activeListKey,
    sprintNameMap,
  };
}

/** Setter + previous-value store the board needs to drive readiness-map optimism. */
export interface BoardReadinessApi {
  setReadinessMap: (updater: (prev: Record<string, import("@/types/ticket").TicketReadiness | null>) => Record<string, import("@/types/ticket").TicketReadiness | null>) => void;
  /** Ref holding a snapshot of pre-edit readiness values, so a failed write can
   *  restore them. A ref (read only inside event handlers, never in render) keeps
   *  the snapshot stable across renders without tripping the ref-in-render lint. */
  prevRef: { current: Record<string, import("@/types/ticket").TicketReadiness | null> };
}

/**
 * Wraps the board data adapter with the board's optimism: the global
 * `pendingTicketEdits` / `pendingSprintMoves` overlay (BRDG-357/271) plus the
 * board's readiness map (which the row renders from directly, not off the list).
 *
 * `confirmMove` is the BRDG-271 client-side cache patch: in next dev the move route
 * and the tickets route hold separate cache instances, so a bare revalidation
 * returns stale data; we patch the current list and inject the moved rows at the
 * top of the destination list instead.
 */
export function makeBoardDispatchAdapter(base: RowDataAdapter, readiness: BoardReadinessApi): RowActionsAdapter {
  const { activeListKey } = base;
  return {
    ...base,
    beginEdit: (keys, field, value) => {
      const now = Date.now();
      if (field === "jiraStatus") keys.forEach((k) => registerPendingEdit(k, "jiraStatus", value, now));
      else if (field === "flagged") keys.forEach((k) => registerPendingEdit(k, "flagged", value, now));
      else if (field === "readiness") {
        const v = value as import("@/types/ticket").TicketReadiness | null;
        keys.forEach((k) => registerPendingEdit(k, "readiness", v, now));
        readiness.setReadinessMap((prev) => {
          const next = { ...prev };
          keys.forEach((k) => { readiness.prevRef.current[k] = prev[k]; next[k] = v; });
          return next;
        });
      } else if (field === "epic") {
        const { epicKey, epicName } = value as EpicEditValue;
        keys.forEach((k) => {
          registerPendingEdit(k, "epic", epicName, now);
          registerPendingEdit(k, "epicKey", epicKey, now);
        });
      }
      // assignee/labels have no board-row optimistic display (revalidation only).
    },
    confirmEdit: (keys, field) => {
      if (field === "jiraStatus") keys.forEach((k) => confirmPendingEdit(k, "jiraStatus"));
      else if (field === "flagged") keys.forEach((k) => confirmPendingEdit(k, "flagged"));
      else if (field === "readiness") keys.forEach((k) => confirmPendingEdit(k, "readiness"));
      else if (field === "epic") keys.forEach((k) => { confirmPendingEdit(k, "epic"); confirmPendingEdit(k, "epicKey"); base.mutate(); });
      else base.mutate(); // assignee/labels: revalidate so the new value lands
    },
    revertEdit: (keys, field) => {
      if (field === "jiraStatus") keys.forEach((k) => clearPendingEdit(k, "jiraStatus"));
      else if (field === "flagged") keys.forEach((k) => clearPendingEdit(k, "flagged"));
      else if (field === "readiness") {
        keys.forEach((k) => clearPendingEdit(k, "readiness"));
        readiness.setReadinessMap((prev) => {
          const next = { ...prev };
          keys.forEach((k) => { next[k] = readiness.prevRef.current[k] ?? null; });
          return next;
        });
      } else if (field === "epic") keys.forEach((k) => { clearPendingEdit(k, "epic"); clearPendingEdit(k, "epicKey"); });
      // assignee/labels: nothing optimistic to roll back.
    },
    beginMove: (moved, targetSprintId) => {
      const now = Date.now();
      moved.forEach((t) => registerPendingMove(t, targetSprintId, now));
    },
    confirmMove: ({ moved, keys, targetSprintId, newSprintId }) => {
      keys.forEach((k) => confirmPendingMove(k));
      const checked = new Set(keys);
      const destKey = `/api/tickets?sprintId=${encodeURIComponent(targetSprintId)}`;
      // Update the current list: in the All view the moved rows stay but take the new
      // sprintId (grouping follows them); in a per-sprint or backlog source view they leave.
      // Skip when the active list IS the destination (a no-op move within the same view).
      if (activeListKey === "/api/tickets") {
        void globalMutate<Ticket[]>(activeListKey, (data) => data?.map((t) => (checked.has(t.key) ? { ...t, sprintId: newSprintId } : t)), { revalidate: false });
      } else if (activeListKey !== destKey) {
        void globalMutate<Ticket[]>(activeListKey, (data) => data?.filter((t) => !checked.has(t.key)), { revalidate: false });
      }
      // Inject the moved tickets at the TOP of the destination cache (de-duplicated); the
      // list sorts by jiraRank ascending, so they get a rank below the current minimum.
      if (destKey !== activeListKey) {
        void globalMutate<Ticket[]>(
          destKey,
          (current) => {
            const cur = current ?? [];
            const existing = new Set(cur.map((t) => t.key));
            const topRank = Math.min(0, ...cur.map((t) => t.jiraRank ?? 0)) - 1;
            const fresh = moved.filter((t) => !existing.has(t.key)).map((t) => ({ ...t, jiraRank: topRank }));
            return [...fresh, ...cur];
          },
          { revalidate: false },
        );
      }
    },
    revertMove: (keys) => keys.forEach((k) => clearPendingMove(k)),
  };
}

/** Local-move overlay setters the inbox/epic surfaces drive for sprint moves. */
export interface LocalMoveApi {
  setLocalMoves: (updater: (prev: Record<string, string | null>) => Record<string, string | null>) => void;
}

/** Optimistic child-row patcher the epic surface uses for status/readiness edits. */
export type ChildOptimistic = (childKey: string, patch: { jiraStatus?: import("@/types/ticket").JiraStatus; readiness?: import("@/types/ticket").TicketReadiness | null }) => void;

/**
 * Inbox dispatch adapter. The inbox row carries no flag/readiness state, so field
 * edits are write-through (no optimistic display); only sprint moves overlay a
 * local destination name (the row stays in the inbox, its chip updates).
 */
export function makeInboxDispatchAdapter(base: RowDataAdapter, local: LocalMoveApi): RowActionsAdapter {
  return {
    ...base,
    beginEdit: () => {},
    confirmEdit: () => { base.mutate(); },
    revertEdit: () => { base.mutate(); },
    beginMove: (moved, _targetSprintId, targetSprintName) => {
      local.setLocalMoves((prev) => { const next = { ...prev }; moved.forEach((t) => { next[t.key] = targetSprintName; }); return next; });
    },
    confirmMove: () => { base.mutate(); },
    revertMove: (keys) => {
      local.setLocalMoves((prev) => { const next = { ...prev }; keys.forEach((k) => delete next[k]); return next; });
    },
  };
}

/**
 * Epic dispatch adapter. Status/readiness reflect immediately through the epic's
 * `onChildOptimistic` callback; a closing revalidation confirms or rolls them back.
 * Sprint moves overlay a local destination name on the by-sprint grouping.
 */
export function makeEpicDispatchAdapter(base: RowDataAdapter, local: LocalMoveApi, onChildOptimistic?: ChildOptimistic): RowActionsAdapter {
  return {
    ...base,
    beginEdit: (keys, field, value) => {
      if (field === "jiraStatus") keys.forEach((k) => onChildOptimistic?.(k, { jiraStatus: value as import("@/types/ticket").JiraStatus }));
      else if (field === "readiness") keys.forEach((k) => onChildOptimistic?.(k, { readiness: value as import("@/types/ticket").TicketReadiness | null }));
    },
    confirmEdit: () => { base.mutate(); },
    revertEdit: () => { base.mutate(); },
    beginMove: (moved, _targetSprintId, targetSprintName) => {
      local.setLocalMoves((prev) => { const next = { ...prev }; moved.forEach((t) => { next[t.key] = targetSprintName; }); return next; });
    },
    confirmMove: () => { base.mutate(); },
    revertMove: (keys) => {
      local.setLocalMoves((prev) => { const next = { ...prev }; keys.forEach((k) => delete next[k]); return next; });
    },
  };
}
