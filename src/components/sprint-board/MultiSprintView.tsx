"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import type { Ticket, Sprint, POStatus } from "@/types/ticket";
import { JIRA_STATUS_COLORS } from "@/types/ticket";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { Avatar } from "@/components/shared/Avatar";
import { EmptyState } from "@/components/shared/EmptyState";
import { ViewHeader, ViewHeaderTitle, ViewHeaderDivider } from "@/components/shared/ViewHeader";
import { SidePanel } from "./SidePanel";
import { GroupStatBar } from "./GroupStatBar";
import type { StatCriterion } from "./GroupStatBar";
import { SprintSelector } from "./SprintSelector";
import { CalendarRange, RefreshCw, X, Columns2, GripVertical, ChevronDown, Search, Sheet } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useTickets } from "@/hooks/useSprintBoard";
import { jira } from "@/lib/api-client";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
  type CollisionDetection,
  useDroppable,
  pointerWithin,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// Column containers only activate via pointer-within; tickets use closestCenter.
// This mirrors the sprint board's boardCollisionDetection to avoid the large column
// droppable rect stealing collisions from individual ticket sortable items.
const compareCollisionDetection: CollisionDetection = (args) => {
  const columnContainers = args.droppableContainers.filter(
    (c) => c.id === "left" || c.id === "right",
  );
  if (columnContainers.length > 0) {
    const pointerHits = pointerWithin({ ...args, droppableContainers: columnContainers });
    if (pointerHits.length > 0) return pointerHits;
  }
  const ticketContainers = args.droppableContainers.filter(
    (c) => c.id !== "left" && c.id !== "right",
  );
  return closestCenter({ ...args, droppableContainers: ticketContainers });
};

// --- Sortable ticket row ---

function SortableTicketRow({
  ticket,
  columnId,
  isChecked,
  isSelected,
  onToggleCheck,
  onSelect,
  insertLine,
}: {
  ticket: Ticket;
  columnId: "left" | "right";
  isChecked: boolean;
  isSelected: boolean;
  onToggleCheck: (key: string) => void;
  onSelect: (key: string | null) => void;
  insertLine?: "above" | "below";
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ticket.key,
    data: { columnId },
  });

  const statusColor = JIRA_STATUS_COLORS[ticket.jiraStatus] ?? JIRA_STATUS_COLORS["TO DO"];

  const insertLineShadow =
    insertLine === "above"
      ? "inset 0 2px 0 var(--color-brand-500)"
      : insertLine === "below"
      ? "inset 0 -2px 0 var(--color-brand-500)"
      : undefined;

  return (
    <tr
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`group cursor-grab active:cursor-grabbing border-b border-border-subtle ${
        isDragging
          ? "opacity-40"
          : isSelected
          ? "bg-[var(--color-brand-500)]/[0.06]"
          : isChecked
          ? "bg-[var(--color-brand-500)]/[0.03]"
          : "hover:bg-white/[0.02]"
      }`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        ...(insertLineShadow ? { boxShadow: insertLineShadow } : {}),
      }}
    >
      <td className="w-6 py-2 pl-2 pr-0">
        {/* Visual grip indicator only — drag is activated by the whole row */}
        <div className="flex items-center justify-center text-white/0 group-hover:text-white/20">
          <GripVertical size={14} strokeWidth={1.5} />
        </div>
      </td>

      <td className="w-7 py-2 pr-1">
        <label className="flex cursor-pointer items-center justify-center">
          <input
            type="checkbox"
            checked={isChecked}
            onChange={() => onToggleCheck(ticket.key)}
            className="sr-only"
          />
          <span
            className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border ${
              isChecked
                ? "border-[var(--color-brand-500)]/50 bg-[var(--color-brand-500)]/20"
                : "border-white/[0.12] bg-white/[0.03] opacity-0 group-hover:opacity-100"
            }`}
            style={{ transition: "opacity 0.15s ease, background-color 0.15s ease" }}
          >
            {isChecked && (
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                <path d="M1.5 4L3 5.5L6.5 2" stroke="var(--color-brand-400)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
        </label>
      </td>

      <td className="w-6 py-2 pr-1">
        <IssueTypeIcon type={ticket.type} size={14} />
      </td>

      <td className="w-24 py-2 pr-2">
        <span className="font-mono text-xs text-white/40">{ticket.key}</span>
      </td>

      <td className="overflow-hidden py-2 pr-3">
        <button
          type="button"
          onClick={() => onSelect(isSelected ? null : ticket.key)}
          className="block w-full cursor-pointer truncate text-left text-sm text-white/70 hover:text-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
          style={{ transition: "color 0.15s ease" }}
        >
          {ticket.title}
        </button>
      </td>

      <td className="w-28 py-2 pr-2">
        <span
          className="inline-flex items-center rounded px-1.5 py-0.5 text-caption font-medium"
          style={{ backgroundColor: statusColor.bg, color: statusColor.text }}
        >
          {ticket.jiraStatus}
        </span>
      </td>

      <td className="w-8 py-2 pr-2 text-center text-xs tabular-nums text-white/30">
        {ticket.storyPoints ?? "-"}
      </td>

      <td className="w-8 py-2 pr-3">
        <Avatar assignee={ticket.assignee} size={18} />
      </td>
    </tr>
  );
}

// --- Droppable sprint column ---

function DroppableSprintColumn({
  columnId,
  sprintId,
  tickets: allTickets,
  checkedKeys,
  selectedKey,
  syncing,
  onRefresh,
  onToggleCheck,
  onSelect,
  onToggleAll,
  allChecked,
  someChecked,
  sprints,
  onChangeSprint,
  activeDragId,
  dragOverId,
}: {
  columnId: "left" | "right";
  sprintId: string;
  tickets: Ticket[];
  checkedKeys: Set<string>;
  selectedKey: string | null;
  syncing: boolean;
  onRefresh: () => void;
  onToggleCheck: (key: string) => void;
  onSelect: (key: string | null) => void;
  onToggleAll: () => void;
  allChecked: boolean;
  someChecked: boolean;
  sprints: Sprint[];
  onChangeSprint: (id: string) => void;
  activeDragId: string | null;
  dragOverId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId });
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCriterion, setActiveCriterion] = useState<StatCriterion | null>(null);

  const currentSprint = sprints.find((s) => s.id === sprintId);

  const filteredTickets = useMemo(() => {
    let result = allTickets;

    if (activeCriterion) {
      result = result.filter((t) => {
        if (activeCriterion === "todo") return t.jiraStatus === "TO DO";
        if (activeCriterion === "in-progress") return t.jiraStatus === "IN PROGRESS";
        if (activeCriterion === "test") return t.jiraStatus === "TEST";
        if (activeCriterion === "done") return t.jiraStatus === "DONE";
        if (activeCriterion === "unpointed") return !t.storyPoints;
        return true;
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.key.toLowerCase().includes(q) ||
          t.title.toLowerCase().includes(q) ||
          (t.assignee?.name?.toLowerCase().includes(q) ?? false),
      );
    }

    return result;
  }, [allTickets, activeCriterion, searchQuery]);

  const checkedInColumn = allTickets.filter((t) => checkedKeys.has(t.key));
  const totalPoints = allTickets.reduce((s, t) => s + (t.storyPoints ?? 0), 0);
  const selectedPoints = checkedInColumn.reduce((s, t) => s + (t.storyPoints ?? 0), 0);

  const isFiltered = activeCriterion !== null || searchQuery.trim() !== "";

  // Insertion line indices (based on allTickets for stable cross-filter positioning)
  const activeInsertIdx = activeDragId ? allTickets.findIndex((t) => t.key === activeDragId) : -1;
  const overInsertIdx = dragOverId ? allTickets.findIndex((t) => t.key === dragOverId) : -1;

  return (
    <div
      ref={setNodeRef}
      className={`flex min-w-0 flex-1 flex-col overflow-hidden ${
        isOver ? "ring-1 ring-inset ring-[var(--color-brand-500)]/25 bg-[var(--color-brand-500)]/[0.015]" : ""
      }`}
      style={{ transition: "background-color 0.15s ease" }}
    >
      {/* Column header - z-20 beats the sticky thead's z-10, keeping dropdown on top */}
      <div className="relative z-20 flex items-center gap-2 border-b border-border-default bg-[var(--color-surface-elevated)] px-3 py-2">
        <div className="pointer-events-none absolute left-0 top-0 h-full w-48 bg-[radial-gradient(ellipse_at_left,rgba(46,145,73,0.06)_0%,transparent_70%)]" />

        {/* Sprint selector trigger */}
        <div className="relative flex shrink-0 items-center gap-1.5">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-[var(--color-brand-500)]/15 ring-1 ring-[var(--color-brand-500)]/20">
            <CalendarRange size={11} strokeWidth={1.5} className="text-[var(--color-brand-400)]" />
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setSelectorOpen((o) => !o)}
              className="flex items-center gap-1 cursor-pointer py-0.5 text-sm font-semibold tracking-tight text-white/85 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            >
              <span className="max-w-36 truncate">{currentSprint?.name ?? sprintId}</span>
              <ChevronDown size={11} strokeWidth={2} className="shrink-0 text-white/35" />
            </button>
            {selectorOpen && (
              <SprintSelector
                sprints={sprints}
                onSelect={(id) => {
                  onChangeSprint(id);
                  setSelectorOpen(false);
                }}
                onClose={() => setSelectorOpen(false)}
              />
            )}
          </div>
        </div>

        <div className="h-3 w-px shrink-0 bg-white/[0.08]" />

        {/* Stat bar — dot-only status pills to stay compact */}
        <div className="min-w-0 flex-1 overflow-hidden">
          <GroupStatBar
            tickets={allTickets}
            activeCriterion={activeCriterion}
            onFilterChange={setActiveCriterion}
            showDot
          />
        </div>

        {/* Search */}
        <div className="relative shrink-0">
          <Search className="absolute left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-white/25" strokeWidth={1.5} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="h-6 w-28 rounded border border-border-default bg-white/[0.03] py-0.5 pl-5 pr-2 text-xs text-white/70 placeholder:text-white/20 focus:border-[var(--color-brand-500)]/40 focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-white/25 cursor-pointer hover:text-white/50"
            >
              <X className="h-2.5 w-2.5" strokeWidth={1.5} />
            </button>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          iconOnly
          icon={<RefreshCw size={12} strokeWidth={1.5} className={syncing ? "animate-spin" : ""} />}
          onClick={onRefresh}
          disabled={syncing}
          title="Refresh from Jira"
          aria-label="Refresh from Jira"
          className="shrink-0"
        />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {allTickets.length === 0 ? (
          <EmptyState
            icon={<Sheet className="h-5 w-5 text-white/15" strokeWidth={1} />}
            title="No tickets in this sprint"
            description="Select a different sprint or add tickets in Jira"
            className="py-16"
          />
        ) : (
          <table className="w-full table-fixed border-collapse">
            <thead className="sticky top-0 z-10 bg-[var(--color-surface-base)]">
              <tr className="border-b border-border-subtle text-left">
                <th className="w-6 py-2 pl-2 pr-0" />
                <th className="w-7 py-2 pr-1">
                  <label className="flex cursor-pointer items-center justify-center">
                    <input type="checkbox" checked={allChecked} onChange={onToggleAll} className="sr-only" />
                    <span
                      className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border ${
                        allChecked
                          ? "border-[var(--color-brand-500)]/50 bg-[var(--color-brand-500)]/20"
                          : someChecked
                          ? "border-[var(--color-brand-500)]/30 bg-[var(--color-brand-500)]/10"
                          : "border-white/[0.12] bg-white/[0.02]"
                      }`}
                    >
                      {allChecked && (
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                          <path d="M1.5 4L3 5.5L6.5 2" stroke="var(--color-brand-400)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                      {someChecked && !allChecked && (
                        <div className="h-1.5 w-1.5 rounded-sm bg-[var(--color-brand-400)]" />
                      )}
                    </span>
                  </label>
                </th>
                <th className="w-6 py-2 pr-1" />
                <th className="w-24 py-2 pr-2 text-xs font-medium text-white/25">Key</th>
                <th className="py-2 pr-3 text-xs font-medium text-white/25">Title</th>
                <th className="w-28 py-2 pr-2 text-xs font-medium text-white/25">Status</th>
                <th className="w-8 py-2 pr-2 text-center text-xs font-medium text-white/25">Pts</th>
                <th className="w-8 py-2 pr-3" />
              </tr>
            </thead>
            <SortableContext items={filteredTickets.map((t) => t.key)} strategy={() => null}>
            <tbody>
              {filteredTickets.map((ticket) => {
                let insertLine: "above" | "below" | undefined;
                if (dragOverId && ticket.key === dragOverId && activeInsertIdx !== -1 && overInsertIdx !== -1) {
                  insertLine = activeInsertIdx > overInsertIdx ? "above" : "below";
                }
                return (
                  <SortableTicketRow
                    key={ticket.key}
                    ticket={ticket}
                    columnId={columnId}
                    isChecked={checkedKeys.has(ticket.key)}
                    isSelected={selectedKey === ticket.key}
                    onToggleCheck={onToggleCheck}
                    onSelect={onSelect}
                    insertLine={insertLine}
                  />
                );
              })}
              {filteredTickets.length === 0 && isFiltered && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-xs text-white/20">
                    No matching tickets
                  </td>
                </tr>
              )}
              {/* Drop-here hint when dragging over an empty filtered list */}
              {isOver && filteredTickets.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-xs text-[var(--color-brand-400)]/50">
                    Drop here to move
                  </td>
                </tr>
              )}
            </tbody>
            </SortableContext>
          </table>
        )}
      </div>
    </div>
  );
}

// --- Main MultiSprintView ---

export function MultiSprintView({
  initialLeft,
  initialRight,
  sprints,
  onClose,
  onSprintChange,
}: {
  initialLeft: string;
  initialRight: string;
  sprints: Sprint[];
  onClose: () => void;
  onSprintChange?: (side: "left" | "right", sprintId: string) => void;
}) {
  const [leftSprint, setLeftSprint] = useState(initialLeft);
  const [rightSprint, setRightSprint] = useState(initialRight);

  const { data: leftApiTickets, mutate: mutateLeft } = useTickets(leftSprint);
  const { data: rightApiTickets, mutate: mutateRight } = useTickets(rightSprint);

  // Local overrides keyed by sprintId so they auto-invalidate when the sprint changes
  const [leftOverride, setLeftOverride] = useState<{ sprintId: string; tickets: Ticket[] } | null>(null);
  const [rightOverride, setRightOverride] = useState<{ sprintId: string; tickets: Ticket[] } | null>(null);

  const leftTickets = useMemo(
    () => (leftOverride?.sprintId === leftSprint ? leftOverride.tickets : null) ?? leftApiTickets ?? [],
    [leftOverride, leftSprint, leftApiTickets],
  );
  const rightTickets = useMemo(
    () => (rightOverride?.sprintId === rightSprint ? rightOverride.tickets : null) ?? rightApiTickets ?? [],
    [rightOverride, rightSprint, rightApiTickets],
  );

  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [leftSyncing, setLeftSyncing] = useState(false);
  const [rightSyncing, setRightSyncing] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [poStatuses, setPoStatuses] = useState<Record<string, POStatus>>({});

  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }, []);
  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
    setDragOverId(null);
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const overId = event.over ? String(event.over.id) : null;
    // Only track ticket keys; ignore container droppables ("left"/"right")
    setDragOverId(overId && overId !== "left" && overId !== "right" ? overId : null);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveDragId(null);
      setDragOverId(null);
      if (!over) return;

      const draggedKey = active.id as string;
      const sourceColumnId = active.data.current?.columnId as "left" | "right";
      const overId = String(over.id);

      // Determine target column: container droppable uses "left"/"right" id, ticket uses data.columnId
      const isContainerDrop = overId === "left" || overId === "right";
      const targetColumnId: "left" | "right" = isContainerDrop
        ? (overId as "left" | "right")
        : ((over.data.current?.columnId as "left" | "right") ??
            (leftTickets.some((t) => t.key === overId) ? "left" : "right"));
      const targetOverKey: string | null = isContainerDrop ? null : overId;

      const sourceTickets = sourceColumnId === "left" ? leftTickets : rightTickets;
      const targetTickets = targetColumnId === "left" ? leftTickets : rightTickets;

      if (sourceColumnId === targetColumnId) {
        // Within-column reorder — single ticket only
        if (!targetOverKey || targetOverKey === draggedKey) return;
        const draggedIdx = sourceTickets.findIndex((t) => t.key === draggedKey);
        const targetIdx = sourceTickets.findIndex((t) => t.key === targetOverKey);
        if (draggedIdx === -1 || targetIdx === -1 || draggedIdx === targetIdx) return;

        const reordered = arrayMove(sourceTickets, draggedIdx, targetIdx);

        const prevLeftOverride = leftOverride;
        const prevRightOverride = rightOverride;

        if (sourceColumnId === "left") {
          setLeftOverride({ sprintId: leftSprint, tickets: reordered });
        } else {
          setRightOverride({ sprintId: rightSprint, tickets: reordered });
        }

        const newDraggedIdx = reordered.findIndex((t) => t.key === draggedKey);
        const rankBeforeKey = reordered[newDraggedIdx + 1]?.key;
        const rankAfterKey = !rankBeforeKey ? reordered[newDraggedIdx - 1]?.key : undefined;

        try {
          await jira.rank({ issueKeys: [draggedKey], rankBeforeKey, rankAfterKey });
          if (sourceColumnId === "left") {
            await mutateLeft();
            setLeftOverride(null);
          } else {
            await mutateRight();
            setRightOverride(null);
          }
        } catch {
          setLeftOverride(prevLeftOverride);
          setRightOverride(prevRightOverride);
          showToast("Failed to reorder. Changes reverted.");
        }
        return;
      }

      // Cross-column move
      const keysToMove = checkedKeys.has(draggedKey)
        ? [...checkedKeys].filter((k) => sourceTickets.some((t) => t.key === k))
        : [draggedKey];

      const ticketsToMove = keysToMove
        .map((k) => sourceTickets.find((t) => t.key === k))
        .filter((t): t is Ticket => t !== undefined);

      const newSource = sourceTickets.filter((t) => !keysToMove.includes(t.key));
      // Insert before the target ticket if dragged onto one, otherwise append
      let newTarget: Ticket[];
      if (targetOverKey) {
        const insertIdx = targetTickets.findIndex((t) => t.key === targetOverKey);
        newTarget = [
          ...targetTickets.slice(0, insertIdx),
          ...ticketsToMove,
          ...targetTickets.slice(insertIdx),
        ];
      } else {
        newTarget = [...targetTickets, ...ticketsToMove];
      }

      const prevLeftOverride = leftOverride;
      const prevRightOverride = rightOverride;

      if (sourceColumnId === "left") {
        setLeftOverride({ sprintId: leftSprint, tickets: newSource });
        setRightOverride({ sprintId: rightSprint, tickets: newTarget });
      } else {
        setRightOverride({ sprintId: rightSprint, tickets: newSource });
        setLeftOverride({ sprintId: leftSprint, tickets: newTarget });
      }

      setCheckedKeys((prev) => {
        const next = new Set(prev);
        keysToMove.forEach((k) => next.delete(k));
        return next;
      });

      const targetSprintId = targetColumnId === "left" ? leftSprint : rightSprint;
      const targetName = sprints.find((s) => s.id === targetSprintId)?.name ?? "target sprint";

      try {
        await jira.moveSprint({ issueKeys: keysToMove, targetSprintId });
        if (targetOverKey) {
          await jira.rank({ issueKeys: keysToMove, rankBeforeKey: targetOverKey, sprintId: targetSprintId });
        }
        showToast(`Moved ${keysToMove.length} ticket${keysToMove.length === 1 ? "" : "s"} to ${targetName}`);
        await Promise.all([mutateLeft(), mutateRight()]);
        setLeftOverride(null);
        setRightOverride(null);
      } catch {
        setLeftOverride(prevLeftOverride);
        setRightOverride(prevRightOverride);
        showToast("Failed to move tickets. Changes reverted.");
      }
    },
    [checkedKeys, leftTickets, rightTickets, leftSprint, rightSprint, sprints, showToast, leftOverride, rightOverride, mutateLeft, mutateRight],
  );

  const selectedTicket = useMemo(
    () => (selectedKey ? [...leftTickets, ...rightTickets].find((t) => t.key === selectedKey) ?? null : null),
    [selectedKey, leftTickets, rightTickets],
  );

  const activeDragTicket = useMemo(
    () => (activeDragId ? [...leftTickets, ...rightTickets].find((t) => t.key === activeDragId) ?? null : null),
    [activeDragId, leftTickets, rightTickets],
  );

  const handlePoStatusChange = useCallback(
    (status: POStatus) => {
      if (!selectedKey) return;
      setPoStatuses((prev) => ({ ...prev, [selectedKey]: status }));
    },
    [selectedKey],
  );

  const handleRefreshLeft = useCallback(async () => {
    setLeftSyncing(true);
    try {
      await jira.syncTickets({ sprintId: leftSprint });
      setLeftOverride(null);
      await mutateLeft();
      showToast("Left sprint refreshed");
    } finally {
      setLeftSyncing(false);
    }
  }, [leftSprint, mutateLeft, showToast]);

  const handleRefreshRight = useCallback(async () => {
    setRightSyncing(true);
    try {
      await jira.syncTickets({ sprintId: rightSprint });
      setRightOverride(null);
      await mutateRight();
      showToast("Right sprint refreshed");
    } finally {
      setRightSyncing(false);
    }
  }, [rightSprint, mutateRight, showToast]);

  const toggleCheck = useCallback((key: string) => {
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const leftAllChecked = leftTickets.length > 0 && leftTickets.every((t) => checkedKeys.has(t.key));
  const leftSomeChecked = leftTickets.some((t) => checkedKeys.has(t.key));
  const rightAllChecked = rightTickets.length > 0 && rightTickets.every((t) => checkedKeys.has(t.key));
  const rightSomeChecked = rightTickets.some((t) => checkedKeys.has(t.key));

  const toggleLeftAll = useCallback(() => {
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      if (leftAllChecked) leftTickets.forEach((t) => next.delete(t.key));
      else leftTickets.forEach((t) => next.add(t.key));
      return next;
    });
  }, [leftAllChecked, leftTickets]);

  const toggleRightAll = useCallback(() => {
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      if (rightAllChecked) rightTickets.forEach((t) => next.delete(t.key));
      else rightTickets.forEach((t) => next.add(t.key));
      return next;
    });
  }, [rightAllChecked, rightTickets]);

  const totalItems = leftTickets.length + rightTickets.length;
  const totalChecked = checkedKeys.size;
  const totalSelectedPoints = [...leftTickets, ...rightTickets]
    .filter((t) => checkedKeys.has(t.key))
    .reduce((s, t) => s + (t.storyPoints ?? 0), 0);

  return (
    <DndContext sensors={sensors} collisionDetection={compareCollisionDetection} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
      <div className="relative flex h-full flex-col">
        <ViewHeader
          icon={<Columns2 size={15} strokeWidth={1.5} className="text-white/30" />}
          actions={
            <Button
              variant="ghost"
              size="md"
              iconOnly
              icon={<X className="h-3.5 w-3.5" strokeWidth={1.5} />}
              onClick={onClose}
              title="Close compare view"
            />
          }
        >
          <ViewHeaderTitle>Compare Sprints</ViewHeaderTitle>
          <ViewHeaderDivider />
          <span className="text-sm text-white/35">{totalItems} items total</span>
          {totalChecked > 0 && (
            <>
              <div className="h-4 w-px shrink-0 bg-white/[0.08]" />
              <span className="text-sm text-[var(--color-brand-400)]">
                {totalChecked} selected
                {totalSelectedPoints > 0 && (
                  <span className="ml-1 text-white/35">· {totalSelectedPoints} pts</span>
                )}
              </span>
            </>
          )}
        </ViewHeader>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          <div className="flex min-w-0 flex-1 overflow-hidden">
            <DroppableSprintColumn
              columnId="left"
              sprintId={leftSprint}
              tickets={leftTickets}
              checkedKeys={checkedKeys}
              selectedKey={selectedKey}
              syncing={leftSyncing}
              onRefresh={handleRefreshLeft}
              onToggleCheck={toggleCheck}
              onSelect={setSelectedKey}
              onToggleAll={toggleLeftAll}
              allChecked={leftAllChecked}
              someChecked={leftSomeChecked}
              sprints={sprints}
              onChangeSprint={(id) => {
                setLeftSprint(id);
                setLeftOverride(null);
                setSelectedKey(null);
                onSprintChange?.("left", id);
              }}
              activeDragId={activeDragId}
              dragOverId={dragOverId}
            />
            <div className="w-px shrink-0 bg-white/[0.06]" />
            <DroppableSprintColumn
              columnId="right"
              sprintId={rightSprint}
              tickets={rightTickets}
              checkedKeys={checkedKeys}
              selectedKey={selectedKey}
              syncing={rightSyncing}
              onRefresh={handleRefreshRight}
              onToggleCheck={toggleCheck}
              onSelect={setSelectedKey}
              onToggleAll={toggleRightAll}
              allChecked={rightAllChecked}
              someChecked={rightSomeChecked}
              sprints={sprints}
              onChangeSprint={(id) => {
                setRightSprint(id);
                setRightOverride(null);
                setSelectedKey(null);
                onSprintChange?.("right", id);
              }}
              activeDragId={activeDragId}
              dragOverId={dragOverId}
            />
          </div>

          {selectedTicket && (
            <div className="sticky top-0 min-h-full shrink-0 self-stretch overflow-y-auto border-l border-border-default">
              <SidePanel
                ticket={selectedTicket}
                poStatus={poStatuses[selectedTicket.key] ?? selectedTicket.poStatus}
                onPoStatusChange={handlePoStatusChange}
                onNotesChange={() => {}}
                onClose={() => setSelectedKey(null)}
                onShowToast={showToast}
              />
            </div>
          )}
        </div>

        {toast && (
          <div
            className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border-strong bg-[var(--color-surface-elevated)] px-4 py-2 text-sm text-white/70 shadow-[0_4px_24px_rgba(0,0,0,0.3)]"
            style={{ zIndex: "var(--z-dropdown)" }}
          >
            {toast}
          </div>
        )}
      </div>

      <DragOverlay>
        {activeDragTicket &&
          (() => {
            const isInLeft = leftTickets.some((t) => t.key === activeDragTicket.key);
            const sourceTickets = isInLeft ? leftTickets : rightTickets;
            const sameColumnChecked = checkedKeys.has(activeDragTicket.key)
              ? [...checkedKeys].filter((k) => sourceTickets.some((t) => t.key === k))
              : [];
            const extraCount = sameColumnChecked.length > 1 ? sameColumnChecked.length - 1 : 0;
            return (
              <div
                className="rounded-md border border-[var(--color-brand-500)]/20 bg-[var(--color-surface-elevated)] px-3 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
                style={{ opacity: 0.95 }}
              >
                <div className="flex items-center gap-2">
                  <IssueTypeIcon type={activeDragTicket.type} size={13} />
                  <span className="font-mono text-xs text-white/40">{activeDragTicket.key}</span>
                  <span className="max-w-48 truncate text-xs text-white/70">{activeDragTicket.title}</span>
                  {extraCount > 0 && (
                    <span className="ml-1 rounded-full bg-[var(--color-brand-500)]/20 px-1.5 py-0.5 text-caption text-[var(--color-brand-400)]">
                      +{extraCount} more
                    </span>
                  )}
                </div>
              </div>
            );
          })()}
      </DragOverlay>
    </DndContext>
  );
}
