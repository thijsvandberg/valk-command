"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useJiraSprints, useTickets } from "@/hooks/useSprintBoard";
import { useSprintSlots } from "@/hooks/useSprintBoard";
import { useRefinementSession } from "@/contexts/RefinementSessionContext";
import { useRefinementSessions } from "@/hooks/useRefinementSessions";
import { refinementSessions as refinementSessionsApi, type RefinementSessionResponse } from "@/lib/api-client";
import { Layers, Play, GripVertical, X, Search, ArrowRightLeft, ChevronDown, Check, SlidersHorizontal, FolderPlus, Plus, Save } from "lucide-react";
import { ViewHeader, ViewHeaderTitle } from "@/components/shared/ViewHeader";
import { Button } from "@/components/ui/Button";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { EmptyState } from "@/components/shared/EmptyState";
import { SprintListModal } from "@/components/sprint-board/SprintListModal";
import { TicketStatusPill } from "@/components/shared/TicketStatusPill";
import { SavedSessionList } from "@/components/refinement-session/SavedSessionList";
import { FilterDropdown } from "@/components/shared/FilterDropdown";
import { Tooltip } from "@/components/shared/Tooltip";
import type { Ticket } from "@/types/ticket";
import { getSpColor, getEpicColor } from "@/types/ticket";
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

const LAST_UPDATED_OPTIONS = [
  { value: "1w", label: "1 week", ms: 7 * 24 * 60 * 60 * 1000 },
  { value: "2w", label: "2 weeks", ms: 14 * 24 * 60 * 60 * 1000 },
  { value: "4w", label: "4 weeks", ms: 28 * 24 * 60 * 60 * 1000 },
  { value: "3m", label: "3 months", ms: 90 * 24 * 60 * 60 * 1000 },
  { value: "all", label: "All time", ms: 0 },
] as const;

const MIN_TICKETS = 1;
const MAX_TICKETS = 12;
const DEFAULT_QUEUE_WIDTH = 380;
const MIN_QUEUE_WIDTH = 260;
const MAX_QUEUE_WIDTH_RATIO = 0.45;

// ---------------------------------------------------------------------------
// Resizable queue pane
// ---------------------------------------------------------------------------

function ResizableQueuePane({ children }: { children: React.ReactNode }) {
  const [width, setWidth] = useState(DEFAULT_QUEUE_WIDTH);
  const [isDragging, setIsDragging] = useState(false);
  const paneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isDragging) return;
    function handleMouseMove(e: MouseEvent) {
      if (!paneRef.current) return;
      const rect = paneRef.current.getBoundingClientRect();
      const maxW = window.innerWidth * MAX_QUEUE_WIDTH_RATIO;
      const newW = Math.max(MIN_QUEUE_WIDTH, Math.min(maxW, rect.right - e.clientX));
      setWidth(newW);
    }
    function handleMouseUp() { setIsDragging(false); }
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div
      ref={paneRef}
      className="relative shrink-0"
      style={{ width }}
    >
      {/* Resize handle */}
      <div
        onMouseDown={(e) => { e.preventDefault(); setIsDragging(true); }}
        className="absolute top-0 z-20 h-full cursor-col-resize"
        style={{ left: -16, width: 8 }}
      >
        <div
          className="mx-auto h-full w-0.5 hover:bg-[var(--color-brand-500)]/30 active:bg-[var(--color-brand-500)]/50"
          style={isDragging ? { backgroundColor: "rgba(46, 145, 73, 0.5)" } : {}}
        />
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Queue item (drag-to-reorder) with context menu for cross-session move
// ---------------------------------------------------------------------------

function SortableQueueItem({
  ticket,
  index,
  onRemove,
  otherSessions,
  onMoveToSession,
}: {
  ticket: Ticket;
  index: number;
  onRemove: (key: string) => void;
  otherSessions?: RefinementSessionResponse[];
  onMoveToSession?: (ticketKey: string, targetSessionId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ticket.key,
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    // Defer so the click that opened the menu doesn't immediately close it
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menuOpen]);

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
    zIndex: isDragging ? 10 : undefined,
    position: "relative" as const,
  };

  const hasOtherSessions = otherSessions && otherSessions.length > 0;

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

      {/* Move to another session */}
      {hasOtherSessions && (
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="cursor-pointer rounded p-0.5 text-text-muted opacity-0 hover:bg-overlay-default hover:text-text-secondary focus-visible:opacity-100 group-hover:opacity-100"
            style={{ transition: "opacity 0.15s ease" }}
            aria-label="Move to another session"
          >
            <ArrowRightLeft size={13} strokeWidth={2} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full z-30 mt-1 min-w-[180px] rounded-lg border border-border-strong bg-[var(--color-surface-elevated)] py-1 shadow-[var(--shadow-lg)]">
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                Move to
              </div>
              {otherSessions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onMoveToSession?.(ticket.key, s.id);
                  }}
                  className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs text-text-secondary hover:bg-overlay-subtle"
                >
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  <span className="shrink-0 text-[10px] tabular-nums text-text-muted">{s.ticketCount}</span>
                </button>
              ))}
            </div>
          )}
        </div>
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
  sessionNames,
  isOtherSession,
}: {
  ticket: Ticket;
  selected: boolean;
  onToggle: (key: string, index: number, shiftKey: boolean) => void;
  sprintName: string | null;
  index: number;
  sessionNames?: string[];
  isOtherSession?: boolean;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => onToggle(ticket.key, index, e.shiftKey)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(ticket.key, index, e.shiftKey); } }}
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
      <span onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
        <TicketStatusPill
          ticketKey={ticket.key}
          jiraStatus={ticket.jiraStatus}
          issueType={ticket.type}
          title={ticket.title}
          readiness={ticket.readiness}
          variant="list"
        />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-text-secondary">{ticket.title}</span>
      {ticket.epic && (
        <span
          className="shrink-0 truncate max-w-[140px] rounded-md px-1.5 py-0.5 text-caption font-medium"
          style={{
            backgroundColor: getEpicColor(ticket.epic).bg,
            color: getEpicColor(ticket.epic).text,
          }}
        >
          {ticket.epic}
        </span>
      )}
      {(ticket.totalSubtaskCount ?? 0) > 0 && (
        <span className="shrink-0 rounded-md bg-overlay-default px-1.5 py-0.5 text-caption font-medium tabular-nums text-text-muted">
          {ticket.openSubtaskCount ?? 0}/{ticket.totalSubtaskCount}
        </span>
      )}
      {sessionNames && sessionNames.length > 0 && (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[var(--color-brand-500)]/[0.08] px-1.5 py-0.5 text-caption font-medium text-[var(--color-brand-400)]">
          <Layers size={9} strokeWidth={1.5} />
          {sessionNames.join(", ")}
        </span>
      )}
      {selected && isOtherSession && (
        <span className="shrink-0 text-[11px] text-amber-400/70">
          In other session
        </span>
      )}
      {sprintName && (
        <span className="shrink-0 rounded-md bg-overlay-default px-1.5 py-0.5 text-caption font-medium text-text-muted">
          {sprintName}
        </span>
      )}
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Smart sort: ready_to_refine first, then no sprint, then rest
// ---------------------------------------------------------------------------

export function filterTickets(
  tickets: Ticket[],
  opts: {
    sprintFilter: Set<string>;
    hideEstimated: boolean;
    epicFilter: Set<string>;
    lastUpdatedFilter: string;
  },
): Ticket[] {
  const lastUpdatedMs = opts.lastUpdatedFilter !== "all"
    ? LAST_UPDATED_OPTIONS.find((o) => o.value === opts.lastUpdatedFilter)?.ms ?? 0
    : 0;
  const cutoff = lastUpdatedMs > 0 ? Date.now() - lastUpdatedMs : 0;

  return tickets.filter((t) => {
    if (opts.sprintFilter.size > 0) {
      if (!t.sprintId || !opts.sprintFilter.has(t.sprintId)) return false;
    }
    if (opts.hideEstimated && t.storyPoints != null && t.storyPoints > 0) return false;
    if (opts.epicFilter.size > 0 && (!t.epic || !opts.epicFilter.has(t.epic))) return false;
    if (cutoff > 0) {
      if (!t.jiraUpdatedAt || new Date(t.jiraUpdatedAt).getTime() < cutoff) return false;
    }
    return true;
  });
}

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
// Props
// ---------------------------------------------------------------------------

interface RefinementPageContentProps {
  initialSessionId?: string;
  onSessionChange?: (id: string | null) => void;
}

// ---------------------------------------------------------------------------
// Main content
// ---------------------------------------------------------------------------

export function RefinementPageContent({
  initialSessionId,
  onSessionChange,
}: RefinementPageContentProps) {
  const pageTitle = usePageTitle("Refinement");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { startSession } = useRefinementSession();

  // Saved sessions
  const { sessions, mutate: mutateSessions } = useRefinementSessions();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(
    initialSessionId ?? null,
  );
  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) ?? null,
    [sessions, activeSessionId],
  );

  // Redirect to /refinement if initialSessionId doesn't match any session
  const hasCheckedSession = useRef(false);
  useEffect(() => {
    if (!initialSessionId || sessions.length === 0 || hasCheckedSession.current) return;
    hasCheckedSession.current = true;
    const found = sessions.some((s) => s.id === initialSessionId);
    if (!found) {
      router.replace("/refinement");
    }
  }, [initialSessionId, sessions, router]);

  // Build reverse lookup: ticket key -> sessions it belongs to (excluding active session)
  const ticketSessionMap = useMemo(() => {
    const map = new Map<string, { id: string; name: string }[]>();
    for (const session of sessions) {
      if (session.status !== "draft") continue;
      for (const key of session.ticketKeys) {
        const existing = map.get(key);
        const entry = { id: session.id, name: session.name };
        if (existing) {
          existing.push(entry);
        } else {
          map.set(key, [entry]);
        }
      }
    }
    return map;
  }, [sessions]);

  // Sprint data
  const { sprints } = useJiraSprints();
  const { data: sprintSlots } = useSprintSlots();

  const sprintNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    (sprints ?? []).forEach((s) => { map[String(s.id)] = s.name; });
    return map;
  }, [sprints]);

  const pinnedSprintIds = useMemo(() => {
    if (!sprintSlots) return new Set<string>();
    return new Set(sprintSlots.map((s) => s.sprintId));
  }, [sprintSlots]);

  const [sprintFilter, setSprintFilter] = useState<Set<string> | null>(null);
  const effectiveSprintFilter = sprintFilter ?? pinnedSprintIds;
  const [sprintFilterOpen, setSprintFilterOpen] = useState(false);

  // Filter bar visibility
  const [filtersOpen, setFiltersOpen] = useState(false);

  // New filter state
  const [hideEstimated, setHideEstimated] = useState(true);
  const [epicFilter, setEpicFilter] = useState<Set<string>>(new Set());
  const [lastUpdatedFilter, setLastUpdatedFilter] = useState("4w");
  const [lastUpdatedOpen, setLastUpdatedOpen] = useState(false);
  const lastUpdatedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!lastUpdatedOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (lastUpdatedRef.current && !lastUpdatedRef.current.contains(e.target as Node)) {
        setLastUpdatedOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [lastUpdatedOpen]);

  // Fetch all tickets
  const { data: tickets } = useTickets("__all__");

  // Base tickets: hardcoded exclusions only (status, type, removed)
  const baseTickets = useMemo(() => {
    return (tickets ?? []).filter((t) => {
      if (t.jiraStatus === "DONE" || t.jiraStatus === "DEPRECATED") return false;
      if (t.type === "epic" || t.type === "subtask") return false;
      if (t.removedFromJiraAt) return false;
      return true;
    });
  }, [tickets]);

  // Epic options derived from base tickets
  const epicOptions = useMemo(() => {
    const epics = new Set<string>();
    for (const t of baseTickets) {
      if (t.epic) epics.add(t.epic);
    }
    return [...epics].sort();
  }, [baseTickets]);

  // Filtered tickets: base + sprint + estimated + epic + lastUpdated
  const filteredTickets = useMemo(() => {
    return filterTickets(baseTickets, {
      sprintFilter: effectiveSprintFilter,
      hideEstimated,
      epicFilter,
      lastUpdatedFilter,
    });
  }, [baseTickets, effectiveSprintFilter, hideEstimated, epicFilter, lastUpdatedFilter]);

  const sortedTickets = useMemo(
    () => [...filteredTickets].sort(smartSort),
    [filteredTickets],
  );

  const [searchQuery, setSearchQuery] = useState("");
  // When search is active, bypass all filters and search across baseTickets
  const availableTickets = useMemo(() => {
    if (!searchQuery.trim()) return sortedTickets;
    const q = searchQuery.toLowerCase();
    return baseTickets
      .filter((t) => t.key.toLowerCase().includes(q) || t.title.toLowerCase().includes(q))
      .sort(smartSort);
  }, [sortedTickets, baseTickets, searchQuery]);

  // Queue state: for quick session (no activeSessionId), uses local state.
  // For saved sessions, derives from the session's ticketKeys.
  const keysParam = searchParams.get("keys");
  const [initialKeys] = useState(() =>
    keysParam ? keysParam.split(",").filter(Boolean) : [],
  );
  const [quickQueue, setQuickQueue] = useState<string[]>(initialKeys);
  const [quickSelectedKeys, setQuickSelectedKeys] = useState<string[]>(initialKeys);

  // Derive queue from active session or quick mode
  const queue = activeSession ? activeSession.ticketKeys : quickQueue;
  const selectedKeys = activeSession ? activeSession.ticketKeys : quickSelectedKeys;

  const lastClickedIndexRef = useRef<number | null>(null);

  // Debounce timer for persisting session queue changes
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistSessionQueue = useCallback(
    (sessionId: string, newKeys: string[]) => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      persistTimerRef.current = setTimeout(async () => {
        await refinementSessionsApi.update(sessionId, { ticketKeys: newKeys });
        await mutateSessions();
      }, 400);
    },
    [mutateSessions],
  );

  // Update queue: for saved session, optimistically update local cache + debounce persist
  const updateQueue = useCallback(
    (newKeys: string[]) => {
      if (activeSessionId && activeSession) {
        // Optimistic update
        mutateSessions(
          (prev) =>
            prev?.map((s) =>
              s.id === activeSessionId
                ? { ...s, ticketKeys: newKeys, ticketCount: newKeys.length }
                : s,
            ),
          false,
        );
        persistSessionQueue(activeSessionId, newKeys);
      } else {
        setQuickQueue(newKeys);
        setQuickSelectedKeys(newKeys);
      }
    },
    [activeSessionId, activeSession, mutateSessions, persistSessionQueue],
  );

  const toggleTicket = useCallback(
    (key: string, index: number, shiftKey: boolean) => {
      if (shiftKey && lastClickedIndexRef.current !== null) {
        const from = Math.min(lastClickedIndexRef.current, index);
        const to = Math.max(lastClickedIndexRef.current, index);
        const rangeKeys = availableTickets.slice(from, to + 1).map((t) => t.key);
        const merged = Array.from(new Set([...queue, ...rangeKeys]));
        updateQueue(merged);
        lastClickedIndexRef.current = index;
        return;
      }

      lastClickedIndexRef.current = index;
      if (queue.includes(key)) {
        updateQueue(queue.filter((k) => k !== key));
      } else {
        if (queue.length >= MAX_TICKETS) return;
        updateQueue([...queue, key]);
      }
    },
    [availableTickets, queue, updateQueue],
  );

  const handleToggleReadyToRefine = useCallback(() => {
    const readyKeys = availableTickets
      .filter((t) => t.readiness === "ready_to_refine")
      .map((t) => t.key);
    if (readyKeys.length === 0) return;

    const allSelected = readyKeys.every((k) => queue.includes(k));

    if (allSelected) {
      const readySet = new Set(readyKeys);
      updateQueue(queue.filter((k) => !readySet.has(k)));
    } else {
      const merged = Array.from(new Set([...queue, ...readyKeys]));
      updateQueue(merged);
    }
  }, [availableTickets, queue, updateQueue]);

  const removeFromQueue = useCallback(
    (key: string) => {
      updateQueue(queue.filter((k) => k !== key));
    },
    [queue, updateQueue],
  );

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
      updateQueue(arrayMove(queue, oldIndex, newIndex));
    },
    [queue, updateQueue],
  );

  const allTicketMap = useMemo(() => {
    const map = new Map<string, Ticket>();
    for (const t of tickets ?? []) map.set(t.key, t);
    return map;
  }, [tickets]);

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
    startSession(queue, meta, activeSessionId ?? undefined);
    router.push("/refinement/session");
  }, [canStart, queue, allTicketMap, startSession, router, activeSessionId]);

  const readyKeys = useMemo(
    () => availableTickets.filter((t) => t.readiness === "ready_to_refine").map((t) => t.key),
    [availableTickets],
  );
  const readyCount = readyKeys.length;
  const allReadySelected = readyCount > 0 && readyKeys.every((k) => queue.includes(k));

  const sprintFilterLabel = useMemo(() => {
    if (effectiveSprintFilter.size === 0) return "All";
    if (effectiveSprintFilter.size === pinnedSprintIds.size &&
        [...effectiveSprintFilter].every((id) => pinnedSprintIds.has(id))) {
      return "Pinned";
    }
    if (effectiveSprintFilter.size === 1) {
      const id = [...effectiveSprintFilter][0];
      return sprintNameMap[id] ?? id;
    }
    return `${effectiveSprintFilter.size} sprints`;
  }, [effectiveSprintFilter, pinnedSprintIds, sprintNameMap]);

  const lastUpdatedLabel = useMemo(() => {
    const opt = LAST_UPDATED_OPTIONS.find((o) => o.value === lastUpdatedFilter);
    return opt?.label ?? "4 weeks";
  }, [lastUpdatedFilter]);

  // Count non-default filters for badge on filter button
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (!hideEstimated) count++; // default is ON, so OFF is non-default
    if (epicFilter.size > 0) count++;
    if (lastUpdatedFilter !== "4w") count++;
    // Sprint filter: non-default if user changed from pinned
    if (sprintFilter !== null) count++;
    return count;
  }, [hideEstimated, epicFilter, lastUpdatedFilter, sprintFilter]);

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

  // Other sessions for cross-session move
  const otherSessions = useMemo(
    () => sessions.filter((s) => s.id !== activeSessionId && s.status === "draft"),
    [sessions, activeSessionId],
  );

  const handleMoveToSession = useCallback(
    async (ticketKey: string, targetSessionId: string) => {
      // Remove from current session
      updateQueue(queue.filter((k) => k !== ticketKey));

      // Add to target session
      const target = sessions.find((s) => s.id === targetSessionId);
      if (target) {
        const newKeys = [...target.ticketKeys, ticketKey];
        await refinementSessionsApi.update(targetSessionId, { ticketKeys: newKeys });
        await mutateSessions();
      }
    },
    [queue, updateQueue, sessions, mutateSessions],
  );

  // When switching sessions, load the session's queue
  const handleSelectSession = useCallback(
    (id: string | null) => {
      // Flush any pending persist for the previous session
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      setActiveSessionId(id);
      onSessionChange?.(id);
    },
    [onSessionChange],
  );

  // "Save to session" dropdown for quick mode
  const [saveMenuOpen, setSaveMenuOpen] = useState(false);
  const saveMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!saveMenuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (saveMenuRef.current && !saveMenuRef.current.contains(e.target as Node)) {
        setSaveMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [saveMenuOpen]);

  const savableSessions = useMemo(
    () => sessions,
    [sessions],
  );

  const handleSaveToSession = useCallback(
    async (targetSessionId: string) => {
      setSaveMenuOpen(false);
      const target = sessions.find((s) => s.id === targetSessionId);
      if (!target) return;
      const merged = Array.from(new Set([...target.ticketKeys, ...queue]));
      await refinementSessionsApi.update(targetSessionId, { ticketKeys: merged });
      await mutateSessions();
      setQuickQueue([]);
      setQuickSelectedKeys([]);
      onSessionChange?.(targetSessionId);
      setActiveSessionId(targetSessionId);
    },
    [sessions, queue, mutateSessions, onSessionChange],
  );

  const handleSaveToNewSession = useCallback(async () => {
    setSaveMenuOpen(false);
    const created = await refinementSessionsApi.create({ ticketKeys: queue });
    await mutateSessions();
    setQuickQueue([]);
    setQuickSelectedKeys([]);
    onSessionChange?.(created.id);
    setActiveSessionId(created.id);
  }, [queue, mutateSessions, onSessionChange]);

  // Suppress unused variable warning
  void selectedKeys;

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
              Start Refinement ({queue.length})
            </Button>
          ) : undefined
        }
      >
        <ViewHeaderTitle>Refinement</ViewHeaderTitle>
      </ViewHeader>

      {/* Saved session tabs */}
      <div className="border-b border-border-default px-6 py-3">
        <SavedSessionList
          sessions={sessions}
          mutate={mutateSessions}
          activeSessionId={activeSessionId}
          onSelectSession={handleSelectSession}
        />
      </div>

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
              <div className="mb-4 flex items-center gap-3">
                <h2 className="shrink-0 font-[var(--font-display)] text-heading-sm font-semibold tracking-tight text-text-primary">
                  Select tickets
                </h2>
                {readyCount > 0 && (
                  <button
                    type="button"
                    onClick={handleToggleReadyToRefine}
                    className={`shrink-0 cursor-pointer rounded-full px-2 py-0.5 text-caption font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#22c55e] active:opacity-70 ${
                      allReadySelected
                        ? "bg-[#22c55e] text-white hover:bg-[#1ea34d]"
                        : "bg-[rgba(34,197,94,0.12)] text-[#22c55e] hover:bg-[rgba(34,197,94,0.20)]"
                    }`}
                    style={{ transition: "background-color 0.15s ease, color 0.15s ease, opacity 0.1s ease" }}
                    title={allReadySelected ? "Click to deselect all ready-to-refine tickets" : "Click to select all ready-to-refine tickets"}
                  >
                    {readyCount} ready to refine
                  </button>
                )}
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
                <button
                  type="button"
                  onClick={() => setFiltersOpen(!filtersOpen)}
                  className={`relative flex cursor-pointer items-center justify-center rounded-md p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
                    filtersOpen
                      ? "text-[var(--color-brand-400)]"
                      : "text-text-muted hover:text-text-secondary"
                  }`}
                  style={{ transition: "color 0.12s ease" }}
                  title="Toggle filters"
                >
                  <SlidersHorizontal size={15} strokeWidth={1.5} />
                  {activeFilterCount > 0 && !filtersOpen && (
                    <span className="absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[var(--color-brand-500)] px-0.5 text-[9px] font-semibold text-white">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </div>

              {/* Filter bar */}
              {filtersOpen && <div className="mb-3 flex flex-wrap items-center gap-2">
                {/* Sprint filter */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setSprintFilterOpen(!sprintFilterOpen)}
                    className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border-default bg-overlay-subtle px-2 py-1 text-label font-medium text-text-secondary hover:bg-hover-interactive hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                    style={{ transition: "background-color 0.12s ease, border-color 0.12s ease" }}
                  >
                    <span className="text-text-muted">Sprint:</span> {sprintFilterLabel}
                    <ChevronDown size={12} strokeWidth={1.5} className="opacity-40" />
                  </button>
                  {sprintFilterOpen && (
                    <SprintListModal
                      onClose={() => setSprintFilterOpen(false)}
                      onSelect={() => {}}
                      onPin={() => {}}
                      pinnedIds={pinnedSprintIds}
                      multiSelect
                      selectedIds={effectiveSprintFilter}
                      onToggleSelect={toggleSprintInFilter}
                    />
                  )}
                </div>

                {/* Epic filter */}
                <FilterDropdown
                  label="Epic"
                  options={epicOptions}
                  selected={epicFilter}
                  onChange={setEpicFilter}
                  searchable={epicOptions.length > 6}
                  searchPlaceholder="Search epics..."
                  renderOption={(epic) => {
                    const c = getEpicColor(epic);
                    return (
                      <span
                        className="truncate rounded-md px-1.5 py-0.5 text-caption font-medium"
                        style={{ backgroundColor: c.bg, color: c.text }}
                      >
                        {epic}
                      </span>
                    );
                  }}
                />

                {/* Last updated filter */}
                <div className="relative" ref={lastUpdatedRef}>
                  <button
                    type="button"
                    onClick={() => setLastUpdatedOpen(!lastUpdatedOpen)}
                    className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border-default bg-overlay-subtle px-2 py-1 text-label font-medium text-text-secondary hover:bg-hover-interactive hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                    style={{ transition: "background-color 0.12s ease, border-color 0.12s ease" }}
                  >
                    <span className="text-text-muted">Updated:</span> {lastUpdatedLabel}
                    <ChevronDown
                      size={12}
                      strokeWidth={1.5}
                      className={`opacity-40 ${lastUpdatedOpen ? "rotate-180" : ""}`}
                      style={{ transition: "transform 0.15s ease" }}
                    />
                  </button>
                  {lastUpdatedOpen && (
                    <div className="absolute left-0 top-full z-50 mt-1.5 w-40 rounded-xl border border-border-strong bg-[var(--color-surface-floating)] py-1 shadow-[var(--shadow-lg)]">
                      {LAST_UPDATED_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            setLastUpdatedFilter(opt.value);
                            setLastUpdatedOpen(false);
                          }}
                          className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-xs hover:bg-hover-list-item ${
                            lastUpdatedFilter === opt.value
                              ? "font-medium text-text-primary"
                              : "text-text-secondary"
                          }`}
                          style={{ transition: "background-color 80ms" }}
                        >
                          <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                            {lastUpdatedFilter === opt.value && (
                              <Check size={11} strokeWidth={2.5} className="text-[var(--color-brand-400)]" />
                            )}
                          </span>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Hide estimated toggle */}
                <button
                  type="button"
                  onClick={() => setHideEstimated(!hideEstimated)}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-label font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98] ${
                    hideEstimated
                      ? "border-[var(--color-brand-500)]/35 bg-[var(--color-brand-500)]/10 text-[var(--color-brand-300)]"
                      : "border-border-default bg-overlay-subtle text-text-secondary hover:bg-hover-interactive hover:border-border-strong"
                  }`}
                  style={{ transition: "background-color 0.12s ease, border-color 0.12s ease, color 0.12s ease, transform 80ms" }}
                >
                  <span
                    className="flex h-3 w-3 shrink-0 items-center justify-center rounded-sm border"
                    style={{
                      backgroundColor: hideEstimated ? "var(--color-brand-500)" : "transparent",
                      borderColor: hideEstimated ? "var(--color-brand-500)" : "var(--color-text-muted)",
                      transition: "background-color 0.1s ease, border-color 0.1s ease",
                    }}
                  >
                    {hideEstimated && (
                      <svg width="7" height="6" viewBox="0 0 9 7" fill="none">
                        <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  Hide estimated
                </button>
              </div>}

              {/* Ticket list */}
              <div className="space-y-1">
                {availableTickets.map((ticket, idx) => (
                  <TicketRow
                    key={ticket.key}
                    ticket={ticket}
                    selected={queue.includes(ticket.key)}
                    onToggle={toggleTicket}
                    sprintName={ticket.sprintId ? (sprintNameMap[ticket.sprintId] ?? null) : null}
                    index={idx}
                    sessionNames={
                      ticketSessionMap.get(ticket.key)
                        ?.filter((s) => s.id !== activeSessionId)
                        .map((s) => s.name)
                    }
                    isOtherSession={
                      (ticketSessionMap.get(ticket.key)?.some((s) => s.id !== activeSessionId)) ?? false
                    }
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
            <ResizableQueuePane>
              <div className="sticky top-6">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="font-[var(--font-display)] text-heading-sm font-semibold tracking-tight text-text-primary">
                    {activeSession ? activeSession.name : "Queue"}
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
                            otherSessions={activeSession ? otherSessions : undefined}
                            onMoveToSession={activeSession ? handleMoveToSession : undefined}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}

                {canStart && (
                  <div className="mt-4 flex items-center gap-2">
                    {/* Save to session (quick mode only) */}
                    {!activeSession && (
                      <div className="relative" ref={saveMenuRef}>
                        <Tooltip content="Save queue to a session for later" delay={300}>
                          <button
                            type="button"
                            onClick={() => setSaveMenuOpen(!saveMenuOpen)}
                            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-border-default bg-overlay-subtle text-text-secondary hover:bg-overlay-default hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97]"
                            style={{ transition: "background-color 0.15s ease, color 0.15s ease, transform 80ms" }}
                            aria-label="Save to session"
                          >
                            <Save size={16} strokeWidth={1.5} />
                          </button>
                        </Tooltip>
                        {saveMenuOpen && (
                          <div className="absolute bottom-full left-0 z-30 mb-1.5 w-52 rounded-xl border border-border-strong bg-[var(--color-surface-floating)] py-1 shadow-[var(--shadow-lg)]">
                            {savableSessions.length > 0 && (
                              <>
                                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                                  Add to existing
                                </div>
                                {savableSessions.map((s) => (
                                  <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => handleSaveToSession(s.id)}
                                    className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs text-text-secondary hover:bg-overlay-subtle"
                                    style={{ transition: "background-color 80ms" }}
                                  >
                                    <span className="min-w-0 flex-1 truncate">{s.name}</span>
                                    <span className="shrink-0 text-[10px] tabular-nums text-text-muted">{s.ticketCount}</span>
                                  </button>
                                ))}
                                <div className="my-1 border-t border-border-default" />
                              </>
                            )}
                            <button
                              type="button"
                              onClick={handleSaveToNewSession}
                              className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs font-medium text-text-secondary hover:bg-overlay-subtle"
                              style={{ transition: "background-color 80ms" }}
                            >
                              <Plus size={12} strokeWidth={2} className="text-text-muted" />
                              New session
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    <Button
                      variant="primary"
                      size="lg"
                      icon={<Play size={14} strokeWidth={2} />}
                      onClick={handleBeginRefinement}
                      className="flex-1"
                    >
                      Start Refinement
                    </Button>
                  </div>
                )}
              </div>
            </ResizableQueuePane>
          </div>
        )}
      </div>
    </>
  );
}
