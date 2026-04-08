"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import type { Ticket, Sprint, POStatus } from "@/types/ticket";
import { JIRA_STATUS_COLORS } from "@/types/ticket";
import { IssueTypeIcon } from "../shared/IssueTypeIcon";
import { Avatar } from "../shared/Avatar";
import { SidePanel } from "./SidePanel";
import { CalendarRange, RefreshCw, X, Columns2, GripVertical, ChevronDown, Search } from "lucide-react";
import { useTickets } from "@/hooks/useSprintBoard";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";

// --- Draggable ticket row ---

function DraggableTicketRow({
  ticket,
  columnId,
  isChecked,
  isSelected,
  onToggleCheck,
  onSelect,
}: {
  ticket: Ticket;
  columnId: "left" | "right";
  isChecked: boolean;
  isSelected: boolean;
  onToggleCheck: (key: string) => void;
  onSelect: (key: string | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: ticket.key,
    data: { columnId, ticket },
  });

  const statusColor = JIRA_STATUS_COLORS[ticket.jiraStatus] ?? JIRA_STATUS_COLORS["TO DO"];

  return (
    <tr
      ref={setNodeRef}
      className={`group border-b border-white/[0.04] ${
        isDragging
          ? "opacity-40"
          : isSelected
          ? "bg-[var(--color-brand-500)]/[0.06]"
          : isChecked
          ? "bg-[var(--color-brand-500)]/[0.03]"
          : "hover:bg-white/[0.02]"
      }`}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
    >
      <td className="w-6 py-2 pl-2 pr-0">
        <div
          {...listeners}
          {...attributes}
          className="flex cursor-grab items-center justify-center text-white/0 group-hover:text-white/20 hover:!text-white/40 active:cursor-grabbing"
          style={{ transition: "color 0.15s ease" }}
        >
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
          className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium"
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
  searchQuery,
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
}: {
  columnId: "left" | "right";
  sprintId: string;
  tickets: Ticket[];
  searchQuery: string;
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
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId });

  const tickets = useMemo(() => {
    if (!searchQuery.trim()) return allTickets;
    const q = searchQuery.toLowerCase();
    return allTickets.filter(
      (t) => t.key.toLowerCase().includes(q) || t.title.toLowerCase().includes(q),
    );
  }, [allTickets, searchQuery]);

  const todoCount = allTickets.filter((t) => t.jiraStatus === "TO DO").length;
  const inProgressCount = allTickets.filter((t) => t.jiraStatus === "IN PROGRESS").length;
  const testCount = allTickets.filter((t) => t.jiraStatus === "TEST").length;
  const doneCount = allTickets.filter((t) => t.jiraStatus === "DONE").length;
  const totalPoints = allTickets.reduce((s, t) => s + (t.storyPoints ?? 0), 0);
  const checkedInColumn = allTickets.filter((t) => checkedKeys.has(t.key));
  const selectedPoints = checkedInColumn.reduce((s, t) => s + (t.storyPoints ?? 0), 0);

  return (
    <div
      ref={setNodeRef}
      className={`flex min-w-0 flex-1 flex-col overflow-hidden ${
        isOver ? "ring-1 ring-inset ring-[var(--color-brand-500)]/25 bg-[var(--color-brand-500)]/[0.015]" : ""
      }`}
      style={{ transition: "background-color 0.15s ease" }}
    >
      {/* Column header */}
      <div className="relative flex items-center gap-3 overflow-hidden border-b border-white/[0.06] bg-[var(--color-surface-elevated)]/40 px-4 py-3">
        <div className="pointer-events-none absolute left-0 top-0 h-full w-48 bg-[radial-gradient(ellipse_at_left,rgba(46,145,73,0.06)_0%,transparent_70%)]" />

        <div className="relative flex items-center gap-2 shrink-0">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--color-brand-500)]/15 ring-1 ring-[var(--color-brand-500)]/20">
            <CalendarRange size={12} strokeWidth={1.5} className="text-[var(--color-brand-400)]" />
          </div>
          <div className="relative flex items-center gap-0.5">
            <select
              value={sprintId}
              onChange={(e) => onChangeSprint(e.target.value)}
              className="cursor-pointer appearance-none border-0 bg-transparent py-0.5 pr-5 text-sm font-semibold tracking-tight text-white/85 focus:outline-none hover:text-white"
            >
              {sprints.map((s) => (
                <option key={s.id} value={s.id} className="bg-[var(--color-surface-base)] text-white/80">
                  {s.name}
                </option>
              ))}
            </select>
            <ChevronDown size={12} strokeWidth={2} className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-white/35" />
          </div>
        </div>

        <div className="relative flex flex-1 items-center gap-2 min-w-0">
          <div className="h-4 w-px shrink-0 bg-white/[0.08]" />
          <span className="shrink-0 text-xs text-white/30">
            {searchQuery && tickets.length !== allTickets.length
              ? `${tickets.length} / ${allTickets.length}`
              : allTickets.length} items
          </span>
          {totalPoints > 0 && (
            <span className="shrink-0 text-xs">
              {checkedInColumn.length > 0 ? (
                <>
                  <span className="tabular-nums text-[var(--color-brand-400)]">{selectedPoints}</span>
                  <span className="text-white/20"> / {totalPoints} pts</span>
                </>
              ) : (
                <span className="text-white/20">{totalPoints} pts</span>
              )}
            </span>
          )}
          <div className="flex shrink-0 items-center gap-1 text-xs">
            <span className="status-count-badge status-count-todo">{todoCount}</span>
            <span className="status-count-badge status-count-progress">{inProgressCount}</span>
            {testCount > 0 && (
              <span className="status-count-badge status-count-test">{testCount}</span>
            )}
            <span className="status-count-badge status-count-done">{doneCount}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={syncing}
          className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/30 cursor-pointer hover:bg-white/[0.05] hover:text-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
          style={{ transition: "background-color 0.15s ease, color 0.15s ease, transform 0.1s ease" }}
          title="Refresh from Jira"
        >
          <RefreshCw size={13} strokeWidth={1.5} className={syncing ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full table-fixed border-collapse">
          <thead className="sticky top-0 z-10 bg-[var(--color-surface-base)]">
            <tr className="border-b border-white/[0.05] text-left">
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
          <tbody>
            {tickets.map((ticket) => (
              <DraggableTicketRow
                key={ticket.key}
                ticket={ticket}
                columnId={columnId}
                isChecked={checkedKeys.has(ticket.key)}
                isSelected={selectedKey === ticket.key}
                onToggleCheck={onToggleCheck}
                onSelect={onSelect}
              />
            ))}
            {tickets.length === 0 && (
              <tr>
                <td colSpan={8} className="py-16 text-center text-xs text-white/20">
                  {isOver ? "Drop here to move" : "No tickets"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
}: {
  initialLeft: string;
  initialRight: string;
  sprints: Sprint[];
  onClose: () => void;
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

  const [searchQuery, setSearchQuery] = useState("");
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [leftSyncing, setLeftSyncing] = useState(false);
  const [rightSyncing, setRightSyncing] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
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
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveDragId(null);
      if (!over) return;

      const sourceColumnId = active.data.current?.columnId as "left" | "right";
      const targetColumnId =
        over.id === "left" ? "left" : over.id === "right" ? "right" : null;

      if (!targetColumnId || targetColumnId === sourceColumnId) return;

      const sourceTickets = sourceColumnId === "left" ? leftTickets : rightTickets;
      const targetTickets = sourceColumnId === "left" ? rightTickets : leftTickets;
      const draggedKey = active.id as string;

      const keysToMove = checkedKeys.has(draggedKey)
        ? [...checkedKeys].filter((k) => sourceTickets.some((t) => t.key === k))
        : [draggedKey];

      const ticketsToMove = keysToMove
        .map((k) => sourceTickets.find((t) => t.key === k))
        .filter((t): t is Ticket => t !== undefined);

      const newSource = sourceTickets.filter((t) => !keysToMove.includes(t.key));
      const newTarget = [...targetTickets, ...ticketsToMove];

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

      const targetName =
        targetColumnId === "left"
          ? (sprints.find((s) => s.id === leftSprint)?.name ?? "left sprint")
          : (sprints.find((s) => s.id === rightSprint)?.name ?? "right sprint");

      showToast(`Moved ${keysToMove.length} ticket${keysToMove.length === 1 ? "" : "s"} to ${targetName}`);
    },
    [checkedKeys, leftTickets, rightTickets, leftSprint, rightSprint, sprints, showToast],
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
      await fetch(`/api/jira/sync-tickets?sprintId=${encodeURIComponent(leftSprint)}`, { method: "POST" });
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
      await fetch(`/api/jira/sync-tickets?sprintId=${encodeURIComponent(rightSprint)}`, { method: "POST" });
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
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="relative flex h-full flex-col">
        {/* Header — matches SprintBoard unified context header */}
        <div className="relative flex items-center justify-between overflow-hidden border-b border-white/[0.06] bg-[var(--color-surface-elevated)]/60 px-5 py-3.5">
          <div className="pointer-events-none absolute left-0 top-0 h-full w-64 bg-[radial-gradient(ellipse_at_left_center,rgba(46,145,73,0.08)_0%,transparent_70%)]" />

          <div className="relative flex items-center gap-4 min-w-0">
            <div className="flex items-center gap-3 shrink-0">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-brand-500)]/20 shadow-[0_2px_12px_rgba(46,145,73,0.20),inset_0_1px_0_rgba(255,255,255,0.08)] ring-1 ring-[var(--color-brand-500)]/25">
                <Columns2 size={16} strokeWidth={1.5} className="text-[var(--color-brand-400)]" />
              </div>
              <span className="font-[var(--font-display)] text-[15px] font-semibold tracking-tight text-white/90">
                Compare Sprints
              </span>
            </div>

            <div className="h-6 w-px shrink-0 bg-gradient-to-b from-transparent via-white/[0.12] to-transparent" />

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
          </div>

          <div className="relative flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-white/25" strokeWidth={1.5} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tickets..."
                className="h-7 w-44 rounded-md border border-white/[0.06] bg-white/[0.03] py-1 pl-7 pr-3 text-xs text-white/80 placeholder:text-white/20 focus:border-[var(--color-brand-500)]/40 focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-white/25 cursor-pointer hover:text-white/50"
                >
                  <X className="h-3 w-3" strokeWidth={1.5} />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-md text-white/30 cursor-pointer hover:bg-white/[0.04] hover:text-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-95"
              style={{ transition: "background-color 0.15s ease, color 0.15s ease, transform 0.1s ease" }}
              title="Close compare view"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          <div className="flex min-w-0 flex-1 overflow-hidden">
            <DroppableSprintColumn
              columnId="left"
              sprintId={leftSprint}
              tickets={leftTickets}
              searchQuery={searchQuery}
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
              }}
            />
            <div className="w-px shrink-0 bg-white/[0.06]" />
            <DroppableSprintColumn
              columnId="right"
              sprintId={rightSprint}
              tickets={rightTickets}
              searchQuery={searchQuery}
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
              }}
            />
          </div>

          {selectedTicket && (
            <div className="sticky top-0 min-h-full shrink-0 self-stretch overflow-y-auto border-l border-white/[0.06]">
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
            className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/[0.08] bg-[var(--color-surface-elevated)] px-4 py-2 text-sm text-white/70 shadow-[0_4px_24px_rgba(0,0,0,0.3)]"
            style={{ zIndex: 50 }}
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
                    <span className="ml-1 rounded-full bg-[var(--color-brand-500)]/20 px-1.5 py-0.5 text-[10px] text-[var(--color-brand-400)]">
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
