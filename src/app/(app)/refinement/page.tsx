"use client";

import { Suspense, useState, useCallback, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useJiraSprints, useTickets } from "@/hooks/useSprintBoard";
import { useSprintSlots } from "@/hooks/useSprintBoard";
import { useRefinementSession } from "@/contexts/RefinementSessionContext";
import { Layers, Play, GripVertical, X, Search } from "lucide-react";
import { ViewHeader, ViewHeaderTitle } from "@/components/shared/ViewHeader";
import { Button } from "@/components/ui/Button";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import type { Ticket } from "@/types/ticket";
import { getSpColor, READINESS_CONFIG } from "@/types/ticket";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";

const MIN_TICKETS = 1;
const MAX_TICKETS = 12;

// ---------------------------------------------------------------------------
// Queue item (drag-to-reorder)
// ---------------------------------------------------------------------------

function SortableQueueItem({
  ticket,
  index,
  onRemove,
}: {
  ticket: Ticket;
  index: number;
  onRemove: (key: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ticket.key,
  });

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
    zIndex: isDragging ? 10 : undefined,
    position: "relative" as const,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 ${
        isDragging
          ? "bg-[var(--color-surface-floating)] shadow-[var(--shadow-lg)]"
          : "bg-overlay-subtle hover:bg-overlay-default"
      }`}
    >
      <span
        className="flex cursor-grab items-center text-text-muted active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={14} strokeWidth={1.5} />
      </span>
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-overlay-strong text-caption font-medium tabular-nums text-text-tertiary">
        {index + 1}
      </span>
      <IssueTypeIcon type={ticket.type} size={14} />
      <span className="font-mono text-xs text-[var(--color-brand-400)]">{ticket.key}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-text-secondary">{ticket.title}</span>
      {ticket.storyPoints != null && (
        <span
          className="rounded-md px-1.5 py-0.5 text-caption font-medium tabular-nums"
          style={{
            color: getSpColor(ticket.storyPoints).text,
            backgroundColor: getSpColor(ticket.storyPoints).bg,
          }}
        >
          {ticket.storyPoints === 0 ? "-" : ticket.storyPoints}
        </span>
      )}
      <button
        type="button"
        onClick={() => onRemove(ticket.key)}
        className="cursor-pointer rounded p-0.5 text-text-muted opacity-0 hover:bg-red-500/10 hover:text-red-400 focus-visible:opacity-100 group-hover:opacity-100"
        style={{ transition: "opacity 0.15s ease, color 0.15s ease" }}
        aria-label={`Remove ${ticket.key} from queue`}
      >
        <X size={13} strokeWidth={2} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ticket row
// ---------------------------------------------------------------------------

function TicketRow({
  ticket,
  selected,
  onToggle,
  sprintName,
  index,
}: {
  ticket: Ticket;
  selected: boolean;
  onToggle: (key: string, index: number, shiftKey: boolean) => void;
  sprintName: string | null;
  index: number;
}) {
  const readinessCfg = ticket.readiness ? READINESS_CONFIG[ticket.readiness] : null;

  return (
    <button
      type="button"
      onClick={(e) => onToggle(ticket.key, index, e.shiftKey)}
      className={`flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
        selected
          ? "bg-[var(--color-brand-500)]/[0.08] border border-[var(--color-brand-500)]/20"
          : "hover:bg-overlay-subtle border border-transparent"
      }`}
      style={{ transition: "background-color 0.15s ease, border-color 0.15s ease" }}
    >
      <div
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
          selected
            ? "border-[var(--color-brand-500)] bg-[var(--color-brand-600)]"
            : "border-border-strong bg-overlay-subtle"
        }`}
        style={{ transition: "background-color 0.15s ease, border-color 0.15s ease" }}
      >
        {selected && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <IssueTypeIcon type={ticket.type} size={14} />
      <span className="font-mono text-xs text-[var(--color-brand-400)]">{ticket.key}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-text-secondary">{ticket.title}</span>
      {readinessCfg && (
        <span
          className="shrink-0 rounded-md px-1.5 py-0.5 text-caption font-medium"
          style={{ color: readinessCfg.color, backgroundColor: readinessCfg.bg }}
        >
          {readinessCfg.label}
        </span>
      )}
      {sprintName ? (
        <span className="shrink-0 rounded-md bg-overlay-default px-1.5 py-0.5 text-caption font-medium text-text-muted">
          {sprintName}
        </span>
      ) : (
        <span className="shrink-0 rounded-md bg-overlay-subtle px-1.5 py-0.5 text-caption italic text-text-muted">
          No sprint
        </span>
      )}
      <StatusBadge status={ticket.jiraStatus} />
      {ticket.storyPoints != null && (
        <span
          className="rounded-md px-1.5 py-0.5 text-caption font-medium tabular-nums"
          style={{
            color: getSpColor(ticket.storyPoints).text,
            backgroundColor: getSpColor(ticket.storyPoints).bg,
          }}
        >
          {ticket.storyPoints === 0 ? "-" : ticket.storyPoints}
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Smart sort: ready_to_refine first, then no sprint, then rest
// ---------------------------------------------------------------------------

function smartSort(a: Ticket, b: Ticket): number {
  const aReady = a.readiness === "ready_to_refine" ? 0 : 1;
  const bReady = b.readiness === "ready_to_refine" ? 0 : 1;
  if (aReady !== bReady) return aReady - bReady;

  const aNoSprint = a.sprintId ? 1 : 0;
  const bNoSprint = b.sprintId ? 1 : 0;
  if (aNoSprint !== bNoSprint) return aNoSprint - bNoSprint;

  return 0;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RefinementPage() {
  return (
    <Suspense>
      <RefinementPageInner />
    </Suspense>
  );
}

function RefinementPageInner() {
  const pageTitle = usePageTitle("Refinement");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { startSession } = useRefinementSession();

  // Sprint data
  const { data: sprints } = useJiraSprints();
  const { data: sprintSlots } = useSprintSlots();

  // Map sprint Jira ID -> display name
  const sprintNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    (sprints ?? []).forEach((s) => { map[String(s.id)] = s.name; });
    return map;
  }, [sprints]);

  // Pinned sprint IDs (from sprint slots)
  const pinnedSprintIds = useMemo(() => {
    if (!sprintSlots) return new Set<string>();
    return new Set(sprintSlots.map((s) => s.sprintId));
  }, [sprintSlots]);

  // Sprint filter: which sprints to include (default: pinned)
  const allSprintIds = useMemo(
    () => (sprints ?? []).filter((s) => !s.hidden).map((s) => String(s.id)),
    [sprints],
  );
  const [sprintFilter, setSprintFilter] = useState<Set<string> | null>(null); // null = use pinned default
  const effectiveSprintFilter = sprintFilter ?? pinnedSprintIds;
  const [sprintFilterOpen, setSprintFilterOpen] = useState(false);

  // Fetch all tickets
  const { data: tickets } = useTickets("__all__");

  // Filter: non-DONE, non-epic, non-subtask, matching sprint filter
  const filteredTickets = useMemo(() => {
    return (tickets ?? []).filter((t) => {
      if (t.jiraStatus === "DONE" || t.jiraStatus === "DEPRECATED") return false;
      if (t.type === "epic" || t.type === "subtask") return false;
      // Include if ticket's sprint is in filter OR ticket has no sprint
      if (effectiveSprintFilter.size === 0) return true;
      if (!t.sprintId) return true;
      return effectiveSprintFilter.has(t.sprintId);
    });
  }, [tickets, effectiveSprintFilter]);

  // Smart sort
  const sortedTickets = useMemo(
    () => [...filteredTickets].sort(smartSort),
    [filteredTickets],
  );

  // Inline search
  const [searchQuery, setSearchQuery] = useState("");
  const availableTickets = useMemo(() => {
    if (!searchQuery.trim()) return sortedTickets;
    const q = searchQuery.toLowerCase();
    return sortedTickets.filter(
      (t) => t.key.toLowerCase().includes(q) || t.title.toLowerCase().includes(q),
    );
  }, [sortedTickets, searchQuery]);

  // Selection state
  const keysParam = searchParams.get("keys");
  const [initialKeys] = useState(() =>
    keysParam ? keysParam.split(",").filter(Boolean) : [],
  );
  const [selectedKeys, setSelectedKeys] = useState<string[]>(initialKeys);
  const [queue, setQueue] = useState<string[]>(initialKeys);
  const lastClickedIndexRef = useRef<number | null>(null);

  // Shift-click range selection
  const toggleTicket = useCallback(
    (key: string, index: number, shiftKey: boolean) => {
      if (shiftKey && lastClickedIndexRef.current !== null) {
        const from = Math.min(lastClickedIndexRef.current, index);
        const to = Math.max(lastClickedIndexRef.current, index);
        const rangeKeys = availableTickets.slice(from, to + 1).map((t) => t.key);
        setSelectedKeys((prev) => {
          const set = new Set(prev);
          for (const k of rangeKeys) set.add(k);
          return Array.from(set);
        });
        setQueue((prev) => {
          const set = new Set(prev);
          for (const k of rangeKeys) set.add(k);
          return Array.from(set);
        });
        lastClickedIndexRef.current = index;
        return;
      }

      lastClickedIndexRef.current = index;
      setSelectedKeys((prev) => {
        if (prev.includes(key)) {
          setQueue((q) => q.filter((k) => k !== key));
          return prev.filter((k) => k !== key);
        }
        if (prev.length >= MAX_TICKETS) return prev;
        setQueue((q) => q.includes(key) ? q : [...q, key]);
        return [...prev, key];
      });
    },
    [availableTickets],
  );

  // Select all ready-to-refine tickets
  const handleSelectReadyToRefine = useCallback(() => {
    const readyKeys = availableTickets
      .filter((t) => t.readiness === "ready_to_refine")
      .map((t) => t.key);
    if (readyKeys.length === 0) return;

    setSelectedKeys((prev) => {
      const set = new Set(prev);
      for (const k of readyKeys) set.add(k);
      return Array.from(set);
    });
    setQueue((prev) => {
      const set = new Set(prev);
      for (const k of readyKeys) set.add(k);
      return Array.from(set);
    });
  }, [availableTickets]);

  const removeFromQueue = useCallback((key: string) => {
    setSelectedKeys((prev) => prev.filter((k) => k !== key));
    setQueue((prev) => prev.filter((k) => k !== key));
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = queue.indexOf(active.id as string);
      const newIndex = queue.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return;
      setQueue(arrayMove(queue, oldIndex, newIndex));
    },
    [queue],
  );

  const allTicketMap = useMemo(() => {
    const map = new Map<string, Ticket>();
    for (const t of sortedTickets) map.set(t.key, t);
    return map;
  }, [sortedTickets]);

  const queueTickets = useMemo(
    () => queue.map((key) => allTicketMap.get(key)).filter(Boolean) as Ticket[],
    [queue, allTicketMap],
  );

  const canStart = queue.length >= MIN_TICKETS;

  const handleBeginRefinement = useCallback(() => {
    if (!canStart) return;
    const meta = queue.map((key) => {
      const t = allTicketMap.get(key);
      return { key, title: t?.title ?? key };
    });
    startSession(queue, meta);
    router.push("/refinement/session");
  }, [canStart, queue, startSession, router]);

  const readyCount = useMemo(
    () => availableTickets.filter((t) => t.readiness === "ready_to_refine").length,
    [availableTickets],
  );

  // Sprint filter label
  const sprintFilterLabel = useMemo(() => {
    if (effectiveSprintFilter.size === 0) return "All sprints";
    if (effectiveSprintFilter.size === pinnedSprintIds.size &&
        [...effectiveSprintFilter].every((id) => pinnedSprintIds.has(id))) {
      return "Pinned sprints";
    }
    if (effectiveSprintFilter.size === 1) {
      const id = [...effectiveSprintFilter][0];
      return sprintNameMap[id] ?? id;
    }
    return `${effectiveSprintFilter.size} sprints`;
  }, [effectiveSprintFilter, pinnedSprintIds, sprintNameMap]);

  // Toggle a sprint in the filter
  const toggleSprintInFilter = useCallback((id: string) => {
    setSprintFilter((prev) => {
      const current = prev ?? new Set(pinnedSprintIds);
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, [pinnedSprintIds]);

  return (
    <>
      {pageTitle}
      <ViewHeader
        icon={<Layers size={16} strokeWidth={1.5} />}
        actions={
          canStart ? (
            <Button
              variant="primary"
              size="lg"
              icon={<Play size={14} strokeWidth={2} />}
              onClick={handleBeginRefinement}
            >
              Begin Refinement ({queue.length})
            </Button>
          ) : undefined
        }
      >
        <ViewHeaderTitle>Refinement</ViewHeaderTitle>
      </ViewHeader>

      <div className="relative min-h-full">
        {availableTickets.length === 0 && !searchQuery ? (
          <div className="flex min-h-full items-center justify-center py-24">
            <EmptyState
              icon={<Layers size={20} strokeWidth={1.5} className="text-text-tertiary" />}
              title="No tickets available"
              description="No open tickets match the current sprint filter."
            />
          </div>
        ) : (
          <div className="mx-auto flex max-w-6xl gap-6 p-6">
            {/* Left: ticket selection list */}
            <div className="min-w-0 flex-1">
              {/* Header row */}
              <div className="mb-4 flex items-center gap-3">
                <h2 className="shrink-0 font-[var(--font-display)] text-heading-sm font-semibold tracking-tight text-text-primary">
                  Select tickets
                </h2>
                {readyCount > 0 && (
                  <button
                    type="button"
                    onClick={handleSelectReadyToRefine}
                    className="shrink-0 cursor-pointer rounded-full bg-[rgba(34,197,94,0.12)] px-2 py-0.5 text-caption font-medium text-[#22c55e] hover:bg-[rgba(34,197,94,0.20)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#22c55e] active:opacity-70"
                    style={{ transition: "background-color 0.15s ease, opacity 0.1s ease" }}
                    title="Click to select all ready-to-refine tickets"
                  >
                    {readyCount} ready to refine
                  </button>
                )}

                <div className="flex-1" />

                {/* Sprint filter */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setSprintFilterOpen(!sprintFilterOpen)}
                    className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-default bg-overlay-subtle px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-overlay-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                    style={{ transition: "background-color 0.15s ease" }}
                  >
                    {sprintFilterLabel}
                  </button>
                  {sprintFilterOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setSprintFilterOpen(false)} />
                      <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-border-strong bg-[var(--color-surface-floating)] py-1 shadow-[var(--shadow-lg)]">
                        {/* All sprints option */}
                        <button
                          type="button"
                          onClick={() => { setSprintFilter(new Set()); setSprintFilterOpen(false); }}
                          className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs ${
                            effectiveSprintFilter.size === 0
                              ? "text-[var(--color-brand-400)]"
                              : "text-text-secondary hover:bg-overlay-subtle"
                          }`}
                          style={{ transition: "background-color 0.1s ease" }}
                        >
                          All sprints
                        </button>
                        {/* Pinned sprints shortcut */}
                        {pinnedSprintIds.size > 0 && (
                          <button
                            type="button"
                            onClick={() => { setSprintFilter(null); setSprintFilterOpen(false); }}
                            className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs ${
                              sprintFilter === null
                                ? "text-[var(--color-brand-400)]"
                                : "text-text-secondary hover:bg-overlay-subtle"
                            }`}
                            style={{ transition: "background-color 0.1s ease" }}
                          >
                            Pinned sprints
                          </button>
                        )}
                        <div className="my-1 h-px bg-border-subtle" />
                        {/* Individual sprints */}
                        {allSprintIds.map((id) => {
                          const name = sprintNameMap[id] ?? id;
                          const active = effectiveSprintFilter.has(id);
                          const sprint = (sprints ?? []).find((s) => String(s.id) === id);
                          const isPinned = pinnedSprintIds.has(id);
                          return (
                            <button
                              key={id}
                              type="button"
                              onClick={() => toggleSprintInFilter(id)}
                              className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs text-text-secondary hover:bg-overlay-subtle"
                              style={{ transition: "background-color 0.1s ease" }}
                            >
                              <div
                                className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border ${
                                  active
                                    ? "border-[var(--color-brand-500)] bg-[var(--color-brand-600)]"
                                    : "border-border-strong bg-overlay-subtle"
                                }`}
                              >
                                {active && (
                                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                                    <path d="M1.5 4L3 5.5L6.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                )}
                              </div>
                              <span className={`min-w-0 flex-1 truncate ${active ? "text-text-primary" : ""}`}>
                                {name}
                              </span>
                              {isPinned && (
                                <span className="text-caption text-text-muted">pinned</span>
                              )}
                              {sprint && (
                                <span
                                  className="shrink-0 rounded px-1 py-0.5 text-caption font-medium capitalize"
                                  style={{
                                    color: sprint.state === "active" ? "#4aaa60" : sprint.state === "future" ? "#60a5fa" : "var(--color-text-muted)",
                                    backgroundColor: sprint.state === "active" ? "rgba(74,170,96,0.1)" : sprint.state === "future" ? "rgba(96,165,250,0.1)" : "var(--color-overlay-subtle)",
                                  }}
                                >
                                  {sprint.state}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Search bar */}
              <div className="mb-3 flex items-center gap-2 rounded-lg border border-border-default bg-overlay-subtle px-3 py-2">
                <Search size={14} strokeWidth={1.5} className="shrink-0 text-text-muted" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search tickets..."
                  className="min-w-0 flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="cursor-pointer text-text-muted hover:text-text-secondary"
                  >
                    <X size={13} strokeWidth={2} />
                  </button>
                )}
              </div>

              {/* Ticket list */}
              <div className="space-y-1">
                {availableTickets.map((ticket, idx) => (
                  <TicketRow
                    key={ticket.key}
                    ticket={ticket}
                    selected={selectedKeys.includes(ticket.key)}
                    onToggle={toggleTicket}
                    sprintName={ticket.sprintId ? (sprintNameMap[ticket.sprintId] ?? null) : null}
                    index={idx}
                  />
                ))}
                {availableTickets.length === 0 && searchQuery && (
                  <p className="py-8 text-center text-sm text-text-muted">
                    No tickets match &ldquo;{searchQuery}&rdquo;
                  </p>
                )}
              </div>
            </div>

            {/* Right: selected queue */}
            <div className="w-80 shrink-0">
              <div className="sticky top-6">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="font-[var(--font-display)] text-heading-sm font-semibold tracking-tight text-text-primary">
                    Queue
                  </h2>
                  <span className="text-xs tabular-nums text-text-muted">
                    {queue.length} ticket{queue.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {queue.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border-strong py-12 text-center">
                    <p className="text-sm text-text-muted">Select tickets from the list</p>
                    <p className="mt-1 text-caption text-text-muted">
                      {MIN_TICKETS}-{MAX_TICKETS} tickets recommended
                    </p>
                  </div>
                ) : (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={queue} strategy={verticalListSortingStrategy}>
                      <div className="space-y-1">
                        {queueTickets.map((ticket, idx) => (
                          <SortableQueueItem
                            key={ticket.key}
                            ticket={ticket}
                            index={idx}
                            onRemove={removeFromQueue}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}

                {canStart && (
                  <Button
                    variant="primary"
                    size="lg"
                    icon={<Play size={14} strokeWidth={2} />}
                    onClick={handleBeginRefinement}
                    className="mt-4 w-full"
                  >
                    Begin Refinement
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
