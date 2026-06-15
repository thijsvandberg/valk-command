"use client";

import { useState, useCallback, useMemo } from "react";
import type { Ticket } from "@/types/ticket";
import type { SortField } from "@/components/sprint-board/FilterBar";
import type { GroupByOption } from "@/components/sprint-board/useGroupBy";
import {
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { jira, ApiError } from "@/lib/api-client";
import { moveTicketSprintCaches, revalidateMovedSprintLists } from "@/lib/ticket-cache";
import { registerPendingMove, clearPendingMove, confirmPendingMove } from "@/components/sprint-board/pendingSprintMoves";
import { sprintMoveToastContent } from "@/components/sprint-board/sprintMoveToast";

interface DragDropDeps {
  activeSprintId: string;
  isAllView: boolean;
  groupBy: GroupByOption;
  checkedTickets: Set<string>;
  setCheckedTickets: React.Dispatch<React.SetStateAction<Set<string>>>;
  tickets: Ticket[];
  apiTickets: Ticket[] | undefined;
  mutateTickets: (data?: Ticket[] | Promise<Ticket[]> | ((current?: Ticket[]) => Ticket[] | undefined), opts?: { revalidate?: boolean }) => void;
  sprintNameMap: Record<string, string>;
  showToast: (message: React.ReactNode, durationMs?: number) => void;
  setPoPriorityOrder: (order: string[] | null) => void;
  // Refreshes the server-computed sprint capacity meter, which reads a separate
  // total from the ticket list and so must be revalidated after a cross-sprint move.
  refreshMeter: () => void;
  sortField: SortField;
  activeViewId: string | null;
  // Navigate to a sprint and dismiss the toast, for the move toast's "View" link.
  onViewSprint: (sprintId: string) => void;
  dismissToast: () => void;
}

export function useSprintBoardDragDrop(deps: DragDropDeps) {
  const {
    activeSprintId, isAllView, groupBy, checkedTickets, setCheckedTickets,
    tickets, apiTickets, mutateTickets, sprintNameMap, showToast,
    setPoPriorityOrder, refreshMeter, sortField, activeViewId,
    onViewSprint, dismissToast,
  } = deps;

  const [boardActiveDragId, setBoardActiveDragId] = useState<string | null>(null);
  const [boardOverId, setBoardOverId] = useState<string | null>(null);
  const [boardDragTargetSprintId, setBoardDragTargetSprintId] = useState<string | null>(null);

  // DnD (rank reorder + cross-sprint drop) is available whenever rank sort is the
  // active order and we are not in a saved view. It no longer depends on list size:
  // large lists stay virtualized (TicketTable owns that, for perf) but their rows
  // are still drag-enabled, so a 200+ backlog can be reordered and dragged out
  // (BRDG-347). The All view only enables it when grouped by sprint.
  const jiraRankDndEnabled = (
    sortField === "rank" &&
    !activeViewId &&
    (!isAllView || groupBy === "sprint")
  );

  const boardSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const handleBoardDragStart = useCallback((event: DragStartEvent) => {
    setBoardActiveDragId(event.active.id as string);
    setBoardDragTargetSprintId(null);
  }, []);

  const handleBoardDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    const overId = over ? String(over.id) : null;
    setBoardOverId(
      overId && !overId.startsWith("sprint-slot:") && !overId.startsWith("group-zone:")
        ? overId
        : null
    );
    const activeSprintIdData = active.data.current?.sprintId as string | undefined;
    let targetSprintId: string | null = null;
    if (over && activeSprintIdData !== undefined) {
      const overSprintId = over.data.current?.sprintId as string | undefined;
      if (overSprintId !== undefined && overSprintId !== activeSprintIdData) {
        targetSprintId = overSprintId;
      }
    }
    setBoardDragTargetSprintId(targetSprintId);
  }, []);

  // Shared move-success toast (identical to the right-click/bulk move toast).
  const showMoveToast = useCallback((targetSprintId: string, targetName: string, count: number) => {
    showToast(
      sprintMoveToastContent({
        count,
        destName: targetName,
        isBacklog: targetSprintId === "__backlog__",
        onView: () => { onViewSprint(targetSprintId); dismissToast(); },
      }),
      0,
    );
  }, [showToast, onViewSprint, dismissToast]);

  const handleBoardDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    setBoardActiveDragId(null);
    setBoardOverId(null);
    setBoardDragTargetSprintId(null);
    if (!over) return;

    const overId = String(over.id);
    const activeKey = String(active.id);

    // Sprint-slot droppable (SprintDropZoneBar tiles)
    if (overId.startsWith("sprint-slot:")) {
      const targetSprintId = overId.replace("sprint-slot:", "");
      if (targetSprintId === activeSprintId) return;

      const keysToMove = checkedTickets.has(activeKey)
        ? [...checkedTickets].filter((k) => tickets.some((t) => t.key === k))
        : [activeKey];

      const targetName = sprintNameMap[targetSprintId] ?? targetSprintId;
      // Snapshot the moved rows so we can roll them back to their origin sprint.
      const movedTickets = keysToMove
        .map((k) => apiTickets?.find((t) => t.key === k))
        .filter((t): t is Ticket => Boolean(t));
      // Move each row across the sprint caches at once: it leaves the source
      // list, lands in the destination list, and the open detail panel/sidebar
      // follow. The optimistic patch lands immediately; the move route's server
      // cache invalidation is reconciled by a targeted revalidation AFTER the
      // move resolves (below). Mirrors the bulk-move path.
      movedTickets.forEach((t) => moveTicketSprintCaches(t, targetSprintId, true));
      // Keep each moved row visible in the destination across revalidations until
      // the slow Jira move resolves and the server list reflects it.
      const now = Date.now();
      movedTickets.forEach((t) => registerPendingMove(t, targetSprintId, now));
      setCheckedTickets((prev) => {
        const next = new Set(prev);
        keysToMove.forEach((k) => next.delete(k));
        return next;
      });

      try {
        // position: "top" lands the dropped row at the top of the target sprint.
        await jira.moveSprint({ issueKeys: keysToMove, targetSprintId, position: "top" });
        // The move landed in Jira and the DB; the overlay may now release the rows
        // once a refreshed list shows them.
        keysToMove.forEach((k) => confirmPendingMove(k));
        refreshMeter();
        // The server cache is now invalidated, so refresh the destination and
        // origin lists: if the target view was opened mid-move and revalidated
        // against stale data, this brings the moved row back promptly instead of
        // waiting for the next focus/interval revalidation.
        revalidateMovedSprintLists([targetSprintId, ...movedTickets.map((t) => t.sprintId)]);
        showMoveToast(targetSprintId, targetName, keysToMove.length);
      } catch {
        movedTickets.forEach((t) => moveTicketSprintCaches(t, t.sprintId ?? "__backlog__"));
        movedTickets.forEach((t) => clearPendingMove(t.key));
        showToast("Failed to move to sprint. Changes reverted.");
      }
      return;
    }

    // Group-zone droppable (empty sprint group in grouped All view)
    if (overId.startsWith("group-zone:")) {
      const targetSprintId = over.data.current?.sprintId as string | undefined;
      if (!targetSprintId || targetSprintId === (active.data.current?.sprintId as string | undefined)) return;

      const keysToMove = checkedTickets.has(activeKey)
        ? [...checkedTickets].filter((k) => tickets.some((t) => t.key === k))
        : [activeKey];

      const targetName = sprintNameMap[targetSprintId] ?? targetSprintId;
      const prevData = apiTickets;
      mutateTickets(
        (current) => current?.map((t) =>
          keysToMove.includes(t.key) ? { ...t, sprintId: targetSprintId } : t
        ) ?? [],
        { revalidate: false },
      );
      setCheckedTickets((prev) => {
        const next = new Set(prev);
        keysToMove.forEach((k) => next.delete(k));
        return next;
      });

      try {
        // Dropping on an (empty) sprint group lands the row at the top of it.
        await jira.moveSprint({ issueKeys: keysToMove, targetSprintId, position: "top" });
        showMoveToast(targetSprintId, targetName, keysToMove.length);
        mutateTickets();
        refreshMeter();
      } catch {
        mutateTickets(prevData, { revalidate: true });
        showToast("Failed to move to sprint. Changes reverted.");
      }
      return;
    }

    if (activeKey === overId) return;

    const activeTicketSprintId = active.data.current?.sprintId as string | undefined;
    const overTicketSprintId = over.data.current?.sprintId as string | undefined;

    // Cross-group drop: ticket dropped onto a ticket in a different sprint group
    if (isAllView && groupBy === "sprint" &&
        activeTicketSprintId !== undefined && overTicketSprintId !== undefined &&
        activeTicketSprintId !== overTicketSprintId) {

      const targetSprintId = overTicketSprintId;
      const keysToMove = checkedTickets.has(activeKey)
        ? [...checkedTickets].filter((k) => tickets.some((t) => t.key === k))
        : [activeKey];

      const targetName = sprintNameMap[targetSprintId] ?? targetSprintId;
      const prevData = apiTickets;
      mutateTickets(
        (current) => current?.map((t) =>
          keysToMove.includes(t.key) ? { ...t, sprintId: targetSprintId } : t
        ) ?? [],
        { revalidate: false },
      );
      setCheckedTickets((prev) => {
        const next = new Set(prev);
        keysToMove.forEach((k) => next.delete(k));
        return next;
      });

      try {
        await jira.moveSprint({ issueKeys: keysToMove, targetSprintId });
        await jira.rank({
          issueKeys: keysToMove,
          rankBeforeKey: overId,
          sprintId: targetSprintId,
        });
        setPoPriorityOrder(null);
        showMoveToast(targetSprintId, targetName, keysToMove.length);
        mutateTickets();
        refreshMeter();
      } catch {
        mutateTickets(prevData, { revalidate: true });
        showToast("Failed to move to sprint. Changes reverted.");
      }
      return;
    }

    // Intra-group / same-sprint rank reorder
    const currentTickets = tickets;
    const oldIndex = currentTickets.findIndex((t) => t.key === activeKey);
    const overIndex = currentTickets.findIndex((t) => t.key === overId);

    if (oldIndex === -1 || overIndex === -1) return;

    const keysToMove = checkedTickets.has(activeKey)
      ? [...checkedTickets].filter((k) => currentTickets.some((t) => t.key === k))
      : [activeKey];

    const movedSet = new Set(keysToMove);
    // Direction comes from the visible order (and matches rankBeforeKey/rankAfterKey
    // below). The optimistic reorder runs against the FULL list, not the filtered
    // `currentTickets`, so a row hidden by an active filter is never dropped from
    // the cache; the moved rows land next to the visible `over` neighbour (BRDG-347).
    const placeAbove = oldIndex > overIndex;

    mutateTickets(
      (current) => {
        if (!current) return current;
        const withoutFull = current.filter((t) => !movedSet.has(t.key));
        const anchorIdx = withoutFull.findIndex((t) => t.key === overId);
        if (anchorIdx === -1) return current;
        const insertAt = placeAbove ? anchorIdx : anchorIdx + 1;
        const movedRows = keysToMove.map((k) => current.find((t) => t.key === k)!).filter(Boolean);
        const reordered = [...withoutFull.slice(0, insertAt), ...movedRows, ...withoutFull.slice(insertAt)];
        return reordered.map((t, i) => ({ ...t, jiraRank: i }));
      },
      { revalidate: false },
    );

    const rankBeforeKey = oldIndex > overIndex ? overId : undefined;
    const rankAfterKey = oldIndex <= overIndex ? overId : undefined;

    try {
      await jira.rank({
        issueKeys: keysToMove,
        rankBeforeKey,
        rankAfterKey,
        sprintId: activeSprintId,
      });
      setPoPriorityOrder(null);
      const label = keysToMove.length === 1 ? keysToMove[0] : `${keysToMove.length} tickets`;
      showToast(`Rank updated for ${label}`);
    } catch (err) {
      mutateTickets();
      const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Failed to update rank in Jira";
      showToast(`${msg}. Reverted.`);
    }
  }, [activeSprintId, isAllView, groupBy, checkedTickets, tickets, apiTickets, mutateTickets, sprintNameMap, showToast, setCheckedTickets, setPoPriorityOrder, refreshMeter, showMoveToast]);

  const boardActiveDragTicket = boardActiveDragId ? tickets.find((t) => t.key === boardActiveDragId) : null;
  const boardDraggedKeys = useMemo(() => {
    if (!boardActiveDragId) return [] as string[];
    if (checkedTickets.has(boardActiveDragId)) {
      return [...checkedTickets].filter((k) => tickets.some((t) => t.key === k));
    }
    return [boardActiveDragId];
  }, [boardActiveDragId, checkedTickets, tickets]);

  return {
    jiraRankDndEnabled,
    boardSensors,
    boardActiveDragId,
    boardOverId,
    boardDragTargetSprintId,
    boardActiveDragTicket,
    boardDraggedKeys,
    handleBoardDragStart,
    handleBoardDragOver,
    handleBoardDragEnd,
  };
}
