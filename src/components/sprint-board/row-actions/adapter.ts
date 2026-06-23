import { mutate as globalMutate, type KeyedMutator } from "swr";
import type { Ticket } from "@/types/ticket";

/**
 * Surface-agnostic data contract for the shared row-actions dispatch (BRDG-374).
 *
 * The dispatch (move/status/epic/flag/...) is identical across the Sprint Board, Epic
 * children and Inbox; only HOW each surface reflects the change optimistically differs.
 * The adapter hides that: the hook reads tickets through `getTicket`/`getTickets`,
 * revalidates through `mutate`, and hands the destination-cache write of a bulk move to
 * `commitBulkMove` (board: inject into the per-sprint SWR cache; inbox/epic: a local
 * overlay). The board's `pendingTicketEdits` / `pendingSprintMoves` overlay is a global,
 * key-addressed store the board's row builder applies, so it stays as-is.
 */
export interface RowActionsAdapter {
  getTicket(key: string): Ticket | undefined;
  getTickets(): Ticket[];
  /** Revalidate the backing list. */
  mutate(): void;
  /**
   * Reflect a completed bulk sprint move in the surface's caches. Called after the Jira
   * move resolves, so the failure path leaves no stale optimistic state.
   */
  commitBulkMove(args: { moved: Ticket[]; keys: string[]; targetSprintId: string; newSprintId: string | undefined }): void;
  /** SWR key of the list currently being viewed (board uses it to decide cache surgery). */
  activeListKey: string | null;
  /** Sprint id -> display name, for the placement rule (BRDG-370). */
  sprintNameMap: Record<string, string>;
}

/**
 * Board adapter over the `Ticket[]` SWR caches. `commitBulkMove` is the BRDG-271 client-side
 * cache patch: in next dev the move route and the tickets route hold separate cache
 * instances, so a bare revalidation returns stale data; we patch the current list and inject
 * the moved rows at the top of the destination list instead.
 */
export function makeBoardAdapter(
  apiTickets: Ticket[] | undefined,
  mutateTickets: KeyedMutator<Ticket[]>,
  activeListKey: string | null,
  sprintNameMap: Record<string, string>,
): RowActionsAdapter {
  return {
    getTicket: (key) => apiTickets?.find((t) => t.key === key),
    getTickets: () => apiTickets ?? [],
    mutate: () => { void mutateTickets(); },
    commitBulkMove: ({ moved, keys, targetSprintId, newSprintId }) => {
      const checked = new Set(keys);
      const destKey = `/api/tickets?sprintId=${encodeURIComponent(targetSprintId)}`;
      // Update the current list: in the All view the moved rows stay but take the new
      // sprintId (grouping follows them); in a per-sprint or backlog source view they leave.
      // Skip when the active list IS the destination (a no-op move within the same view).
      if (activeListKey === "/api/tickets") {
        void mutateTickets((data) => data?.map((t) => (checked.has(t.key) ? { ...t, sprintId: newSprintId } : t)), { revalidate: false });
      } else if (activeListKey !== destKey) {
        void mutateTickets((data) => data?.filter((t) => !checked.has(t.key)), { revalidate: false });
      }
      // Inject the moved tickets at the TOP of the destination cache (de-duplicated); the
      // list sorts by jiraRank ascending, so they get a rank below the current minimum.
      if (destKey !== activeListKey) {
        void globalMutate<Ticket[]>(
          destKey,
          (current) => {
            const base = current ?? [];
            const existing = new Set(base.map((t) => t.key));
            const topRank = Math.min(0, ...base.map((t) => t.jiraRank ?? 0)) - 1;
            const fresh = moved.filter((t) => !existing.has(t.key)).map((t) => ({ ...t, jiraRank: topRank }));
            return [...fresh, ...base];
          },
          { revalidate: false },
        );
      }
    },
    activeListKey,
    sprintNameMap,
  };
}
