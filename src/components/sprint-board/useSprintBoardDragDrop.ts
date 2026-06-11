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
import { moveTicketSprintCaches } from "@/lib/ticket-cache";

const VIRTUALIZE_THRESHOLD = 40;

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
}

export function useSprintBoardDragDrop(deps: DragDropDeps) {
  const {
    activeSprintId, isAllView, groupBy, checkedTickets, setCheckedTickets,
    tickets, apiTickets, mutateTickets, sprintNameMap, showToast,
    setPoPriorityOrder, refreshMeter, sortField, activeViewId,
  } = deps;

  const [boardActiveDragId, setBoardActiveDragId] = useState<string | null>(null);
  const [boardOverId, setBoardOverId] = useState<string | null>(null);
  const [boardDragTargetSprintId, setBoardDragTargetSprintId] = useState<string | null>(null);

  const jiraRankDndEnabled = (
    sortField === "rank" &&
    !activeViewId &&
    (
      (!isAllView && tickets.length <= VIRTUALIZE_THRESHOLD) ||
      (isAllView && groupBy === "sprint")
    )
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
      // follow. No revalidation follows on purpose: the move route and the
      // tickets GET hold separate 30s caches in next dev, so a bare revalidate
      // re-reads the stale list and the rows pop back. Mirrors the bulk-move path.
      movedTickets.forEach((t) => moveTicketSprintCaches(t, targetSprintId));
      setCheckedTickets((prev) => {
        const next = new Set(prev);
        keysToMove.forEach((k) => next.delete(k));
        return next;
      });

      try {
        await jira.moveSprint({ issueKeys: keysToMove, targetSprintId });
        refreshMeter();
        const label = keysToMove.length === 1 ? keysToMove[0] : `${keysToMove.length} tickets`;
        showToast(`Moved ${label} to ${targetName}`);
      } catch {
        movedTickets.forEach((t) => moveTicketSprintCaches(t, t.sprintId ?? "__backlog__"));
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
        await jira.moveSprint({ issueKeys: keysToMove, targetSprintId });
        const label = keysToMove.length === 1 ? keysToMove[0] : `${keysToMove.length} tickets`;
        showToast(`Moved ${label} to ${targetName}`);
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
        const label = keysToMove.length === 1 ? keysToMove[0] : `${keysToMove.length} tickets`;
        showToast(`Moved ${label} to ${targetName}`);
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
    const without = currentTickets.filter((t) => !movedSet.has(t.key));
    const anchorWithout = without.findIndex((t) => t.key === overId);
    const insertAt = oldIndex > overIndex ? anchorWithout : anchorWithout + 1;
    const movedTickets = keysToMove.map((k) => currentTickets.find((t) => t.key === k)!).filter(Boolean);
    const reordered = [...without.slice(0, insertAt), ...movedTickets, ...without.slice(insertAt)];

    mutateTickets(
      (current) => {
        if (!current) return current;
        const map = new Map(current.map((t) => [t.key, t]));
        return reordered.map((t, i) => ({ ...map.get(t.key)!, jiraRank: i }));
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
  }, [activeSprintId, isAllView, groupBy, checkedTickets, tickets, apiTickets, mutateTickets, sprintNameMap, showToast, setCheckedTickets, setPoPriorityOrder, refreshMeter]);

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
