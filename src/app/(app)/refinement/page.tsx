"use client";

import { Suspense, useState, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useJiraSprints, useTickets } from "@/hooks/useSprintBoard";
import { useRefinementSession } from "@/contexts/RefinementSessionContext";
import { Layers, Play, GripVertical, X, ChevronDown } from "lucide-react";
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

type ViewMode = "all" | "sprint";

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

function TicketRow({
  ticket,
  selected,
  onToggle,
  showSprint,
}: {
  ticket: Ticket;
  selected: boolean;
  onToggle: (key: string) => void;
  showSprint?: boolean;
}) {
  const readinessCfg = ticket.readiness ? READINESS_CONFIG[ticket.readiness] : null;

  return (
    <button
      type="button"
      onClick={() => onToggle(ticket.key)}
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
          className="rounded-md px-1.5 py-0.5 text-caption font-medium"
          style={{ color: readinessCfg.color, backgroundColor: readinessCfg.bg }}
        >
          {readinessCfg.label}
        </span>
      )}
      {showSprint && ticket.sprintId && (
        <span className="shrink-0 rounded-md bg-overlay-default px-1.5 py-0.5 text-caption font-medium text-text-muted">
          {ticket.sprintId}
        </span>
      )}
      {showSprint && !ticket.sprintId && (
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

/** Sort: ready_to_refine first, then no sprint, then rest */
function smartSort(a: Ticket, b: Ticket): number {
  const aReady = a.readiness === "ready_to_refine" ? 0 : 1;
  const bReady = b.readiness === "ready_to_refine" ? 0 : 1;
  if (aReady !== bReady) return aReady - bReady;

  const aNoSprint = a.sprintId ? 1 : 0;
  const bNoSprint = b.sprintId ? 1 : 0;
  if (aNoSprint !== bNoSprint) return aNoSprint - bNoSprint;

  return 0;
}

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

  const { data: sprints } = useJiraSprints();
  const activeSprints = useMemo(
    () => (sprints ?? []).filter((s) => !s.hidden && (s.state === "active" || s.state === "future")),
    [sprints],
  );

  // View mode: "all" shows all tickets across sprints; "sprint" shows per-sprint
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [selectedSprintId, setSelectedSprintId] = useState<string | null>(null);
  const [sprintDropdownOpen, setSprintDropdownOpen] = useState(false);

  // For "all" mode, fetch all tickets; for "sprint" mode, fetch per sprint
  const effectiveSprintId =
    viewMode === "all"
      ? "__all__"
      : selectedSprintId ?? (activeSprints.length > 0 ? String(activeSprints[0].id) : null);
  const { data: tickets } = useTickets(effectiveSprintId);

  // Filter to non-DONE, non-epic, non-subtask tickets
  const filteredTickets = useMemo(
    () =>
      (tickets ?? []).filter(
        (t) => t.jiraStatus !== "DONE" && t.jiraStatus !== "DEPRECATED" && t.type !== "epic" && t.type !== "subtask",
      ),
    [tickets],
  );

  // In "all" mode, apply smart sort
  const availableTickets = useMemo(
    () => (viewMode === "all" ? [...filteredTickets].sort(smartSort) : filteredTickets),
    [viewMode, filteredTickets],
  );

  // Pre-fill queue from ?keys= query param (e.g. from sprint board multi-select)
  const keysParam = searchParams.get("keys");
  const [initialKeys] = useState(() =>
    keysParam ? keysParam.split(",").filter(Boolean) : [],
  );

  const [selectedKeys, setSelectedKeys] = useState<string[]>(initialKeys);
  const [queue, setQueue] = useState<string[]>(initialKeys);

  const toggleTicket = useCallback(
    (key: string) => {
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
    [],
  );

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

  // Resolve queue tickets from either the loaded ticket list or keep the key for tickets not yet loaded
  const allTicketMap = useMemo(() => {
    const map = new Map<string, Ticket>();
    for (const t of availableTickets) map.set(t.key, t);
    return map;
  }, [availableTickets]);

  const queueTickets = useMemo(
    () => queue.map((key) => allTicketMap.get(key)).filter(Boolean) as Ticket[],
    [queue, allTicketMap],
  );

  const canStart = queue.length >= MIN_TICKETS;

  const handleBeginRefinement = useCallback(() => {
    if (!canStart) return;
    startSession(queue);
    router.push("/refinement/session");
  }, [canStart, queue, startSession, router]);

  const selectedSprintName =
    viewMode === "sprint" && effectiveSprintId && effectiveSprintId !== "__all__"
      ? activeSprints.find((s) => String(s.id) === effectiveSprintId)?.name ?? "Sprint"
      : "";

  // Count ready_to_refine in the list
  const readyCount = useMemo(
    () => availableTickets.filter((t) => t.readiness === "ready_to_refine").length,
    [availableTickets],
  );

  const noData = viewMode === "sprint" && !effectiveSprintId;

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
        {noData || availableTickets.length === 0 ? (
          <div className="flex min-h-full items-center justify-center py-24">
            <EmptyState
              icon={<Layers size={20} strokeWidth={1.5} className="text-text-tertiary" />}
              title={noData ? "No active sprints" : "No tickets available"}
              description={
                noData
                  ? "There are no active or future sprints to refine."
                  : "All tickets in this view are done or deprecated."
              }
            />
          </div>
        ) : (
          <div className="mx-auto flex max-w-6xl gap-6 p-6">
            {/* Left: ticket selection list */}
            <div className="min-w-0 flex-1">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="font-[var(--font-display)] text-heading-sm font-semibold tracking-tight text-text-primary">
                  Select tickets
                  {readyCount > 0 && viewMode === "all" && (
                    <span className="ml-2 rounded-full bg-[rgba(34,197,94,0.12)] px-2 py-0.5 text-caption font-medium text-[#22c55e]">
                      {readyCount} ready to refine
                    </span>
                  )}
                </h2>

                <div className="flex items-center gap-2">
                  {/* View mode toggle */}
                  <div className="flex items-center gap-0.5 rounded-lg bg-overlay-subtle p-0.5">
                    <button
                      type="button"
                      onClick={() => { setViewMode("all"); setSelectedKeys([]); setQueue([]); }}
                      className={`cursor-pointer rounded-md px-2.5 py-1 text-[11px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
                        viewMode === "all"
                          ? "bg-[var(--color-surface-elevated)] text-text-primary shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                          : "text-text-tertiary hover:text-text-secondary"
                      }`}
                      style={{ transition: "color 0.15s ease" }}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => { setViewMode("sprint"); setSelectedKeys([]); setQueue([]); }}
                      className={`cursor-pointer rounded-md px-2.5 py-1 text-[11px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
                        viewMode === "sprint"
                          ? "bg-[var(--color-surface-elevated)] text-text-primary shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                          : "text-text-tertiary hover:text-text-secondary"
                      }`}
                      style={{ transition: "color 0.15s ease" }}
                    >
                      Per sprint
                    </button>
                  </div>

                  {/* Sprint selector (only in sprint mode) */}
                  {viewMode === "sprint" && (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setSprintDropdownOpen(!sprintDropdownOpen)}
                        className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-default bg-overlay-subtle px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-overlay-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                        style={{ transition: "background-color 0.15s ease" }}
                      >
                        {selectedSprintName || "Select sprint"}
                        <ChevronDown size={12} strokeWidth={2} />
                      </button>
                      {sprintDropdownOpen && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setSprintDropdownOpen(false)} />
                          <div className="absolute right-0 top-full z-50 mt-1 min-w-[200px] rounded-lg border border-border-strong bg-[var(--color-surface-floating)] py-1 shadow-[var(--shadow-lg)]">
                            {activeSprints.map((sprint) => (
                              <button
                                key={sprint.id}
                                type="button"
                                onClick={() => {
                                  setSelectedSprintId(String(sprint.id));
                                  setSprintDropdownOpen(false);
                                  setSelectedKeys([]);
                                  setQueue([]);
                                }}
                                className={`flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-xs ${
                                  String(sprint.id) === effectiveSprintId
                                    ? "bg-[var(--color-brand-500)]/[0.08] text-[var(--color-brand-400)]"
                                    : "text-text-secondary hover:bg-overlay-subtle"
                                }`}
                                style={{ transition: "background-color 0.1s ease" }}
                              >
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${
                                    sprint.state === "active" ? "bg-[var(--color-brand-400)]" : "bg-text-muted"
                                  }`}
                                />
                                {sprint.name}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                {availableTickets.map((ticket) => (
                  <TicketRow
                    key={ticket.key}
                    ticket={ticket}
                    selected={selectedKeys.includes(ticket.key)}
                    onToggle={toggleTicket}
                    showSprint={viewMode === "all"}
                  />
                ))}
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
