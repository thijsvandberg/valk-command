"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { POStatus, Sprint } from "@/types/ticket";
import { SprintSlots } from "@/components/sprint-board/SprintSlots";
import { FilterBar } from "@/components/sprint-board/FilterBar";
import { TicketTable } from "@/components/sprint-board/TicketTable";
import { BulkActionBar } from "@/components/sprint-board/BulkActionBar";
import { SidePanel } from "@/components/sprint-board/SidePanel";
import { SprintAnalytics } from "@/components/sprint-board/SprintAnalytics";
import { MultiSprintView } from "@/components/sprint-board/MultiSprintView";
import { SearchModal } from "@/components/sprint-board/SearchModal";
import { StoryWriterLauncherModal } from "@/components/shared/StoryWriterLauncherModal";
import { useJiraSprints, useTickets } from "@/hooks/useSprintBoard";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { usePageTitle } from "@/hooks/usePageTitle";
import { mapJiraSprints, saveSprintSlots, saveTicketMetadata, bulkReviewStories } from "@/components/sprint-board/sprint-board-utils";
import { prefetchTicketList, prefetchTicketDetail, cancelAllPrefetches } from "@/lib/prefetch";
import { getJiraUrl } from "@/components/sprint-board/TicketTableCells";
import { apiFetch, jira, followedSprints, ApiError } from "@/lib/api-client";
import { useSprintBoardFilters } from "@/components/sprint-board/useSprintBoardFilters";
import { useGroupBy } from "@/components/sprint-board/useGroupBy";
import { Columns2, Check, LayoutGrid, CalendarRange, NotebookPen, Search, Bookmark, MoreHorizontal, BarChart2, List, ArrowRight, Bell, BellOff } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  pointerWithin,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
  type CollisionDetection,
  type Modifier,
} from "@dnd-kit/core";

// Sprint drop zone shown when a ticket is being dragged -- appears below the sprint tab bar
// so the ghost card never covers it.

function SprintDropTile({
  sprintId,
  sprint,
}: {
  sprintId: string;
  sprint: Sprint;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `sprint-slot:${sprintId}`,
    data: { type: "sprint-slot", sprintId },
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors duration-100 ${
        isOver
          ? "border-[var(--color-brand-500)]/50 bg-[var(--color-brand-500)]/12 text-[var(--color-brand-300)]"
          : "border-white/[0.06] bg-white/[0.025] text-white/35 hover:border-white/10 hover:text-white/55"
      }`}
    >
      <ArrowRight size={10} strokeWidth={1.5} className="shrink-0 opacity-50" />
      <span className="truncate">{sprint.name}</span>
    </div>
  );
}

// Overlay that covers the sprint tab bar during a drag -- no layout shift.
function SprintDropZoneBar({
  sprints,
  slotSprints,
  activeSprintId,
}: {
  sprints: Sprint[];
  slotSprints: string[];
  activeSprintId: string;
}) {
  const targets = slotSprints.filter((id) => id !== activeSprintId);
  return (
    <div className="absolute inset-0 z-10 flex items-center gap-2 bg-[var(--color-surface-elevated)] px-5">
      <span className="shrink-0 text-[10px] font-medium uppercase tracking-widest text-white/20">
        Move to
      </span>
      <span className="h-3 w-px shrink-0 bg-white/[0.07]" />
      {targets.map((sprintId) => {
        const sprint = sprints.find((s) => s.id === sprintId);
        if (!sprint) return null;
        return (
          <SprintDropTile
            key={sprintId}
            sprintId={sprintId}
            sprint={sprint}
          />
        );
      })}
    </div>
  );
}

// Position the drag ghost 8px to the right/below the cursor, regardless of where on the
// row the user grabbed (matches Jira's drag UX where the ghost tracks the pointer).
const snapToPointer: Modifier = ({ activatorEvent, draggingNodeRect, transform }) => {
  if (activatorEvent && draggingNodeRect) {
    const e = activatorEvent as PointerEvent | MouseEvent;
    if (typeof e.clientX !== "number") return transform;
    return {
      ...transform,
      x: transform.x + e.clientX - draggingNodeRect.left + 8,
      y: transform.y + e.clientY - draggingNodeRect.top + 8,
    };
  }
  return transform;
};

// sprint-slot and group-zone droppables only activate when the pointer is physically inside
// them (pointerWithin). They are excluded from closestCenter so they don't activate just
// because they are geometrically close to the cursor.
const boardCollisionDetection: CollisionDetection = (args) => {
  const pointerContainers = args.droppableContainers.filter((c) =>
    String(c.id).startsWith("sprint-slot:") || String(c.id).startsWith("group-zone:")
  );
  if (pointerContainers.length > 0) {
    const pointerHits = pointerWithin({
      ...args,
      droppableContainers: pointerContainers,
    });
    if (pointerHits.length > 0) return pointerHits;
  }
  const ticketContainers = args.droppableContainers.filter(
    (c) => !String(c.id).startsWith("sprint-slot:") && !String(c.id).startsWith("group-zone:")
  );
  return closestCenter({ ...args, droppableContainers: ticketContainers });
};
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { SprintListModal } from "@/components/sprint-board/SprintListModal";
import { ViewHeader, ViewHeaderTitle, ViewHeaderDivider } from "@/components/shared/ViewHeader";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/shared/LoadingState";
import { useColumnWidths } from "@/hooks/useColumnWidths";
import { useColumnConfig } from "@/hooks/useColumnConfig";
import type { ColumnId } from "@/components/sprint-board/FilterBar";

export default function SprintBoard() {
  const { data: rawJiraSprints } = useJiraSprints();
  const sprints = useMemo(() => mapJiraSprints(rawJiraSprints), [rawJiraSprints]);
  const searchParams = useSearchParams();
  const router = useRouter();

  const [slotSprints, setSlotSprints] = useState<string[]>([]);
  const isAllView = searchParams.get("sprint") === "__all__";

  const activeSlot = useMemo(() => {
    const urlSprint = searchParams.get("sprint");
    if (urlSprint === "__all__") return -1;
    if (urlSprint && slotSprints.length > 0) {
      const idx = slotSprints.indexOf(urlSprint);
      if (idx >= 0) return idx;
    }
    const activeIdx = slotSprints.findIndex((id) => sprints.find((s) => s.id === id && s.state === "active"));
    return activeIdx >= 0 ? activeIdx : 0;
  }, [searchParams, slotSprints, sprints]);

  const [ephemeralSprintId, setEphemeralSprintId] = useState<string | null>(null);
  const ephemeralIsActive = !isAllView && ephemeralSprintId !== null && searchParams.get("sprint") === ephemeralSprintId;
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);
  const [checkedTickets, setCheckedTickets] = useState<Set<string>>(new Set());
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [focusedTicketIdx, setFocusedTicketIdx] = useState<number>(-1);
  const [poStatuses, setPoStatuses] = useState<Record<string, POStatus>>({});
  const [poPriorityOrder, setPoPriorityOrder] = useLocalStorage<string[] | null>("sprint-board-po-priority", null);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [barsCollapsed, setBarsCollapsed] = useLocalStorage("sprint-bars-collapsed", false);
  const [analyticsVisible, setAnalyticsVisible] = useLocalStorage("sprint-analytics-visible", false);
  const [compareMode, setCompareMode] = useState(false);
  const [showStoryWriterLauncher, setShowStoryWriterLauncher] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [sprintsModalOpen, setSprintsModalOpen] = useState(false);
  const headerMenuRef = useRef<HTMLDivElement>(null);
  const [bulkRefreshing, setBulkRefreshing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slotsInitialized = useRef(false);

  const sprintNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    sprints.forEach((s) => { map[s.id] = s.name; });
    return map;
  }, [sprints]);

  const activeSprintId = (isAllView || searchParams.get("view")) ? "__all__" : ephemeralIsActive ? ephemeralSprintId! : slotSprints[activeSlot];
  const { data: apiTickets, isLoading: ticketsLoading, mutate: mutateTickets } = useTickets(activeSprintId || null);
  const allTickets = useMemo(() => apiTickets ?? [], [apiTickets]);

  const { widths: columnWidths, setColumnWidth, resetColumnWidth } = useColumnWidths();
  const { order: columnOrder, visible: columnVisible, setColumnOrder, toggleColumn, resetTo, resetToDefaults } = useColumnConfig();
  const f = useSprintBoardFilters(allTickets, poStatuses, isAllView, poPriorityOrder, columnVisible, columnOrder, resetTo, sprintNameMap);
  const tickets = f.sortedTickets;
  const { groupBy, setGroupBy, collapsedGroups, toggleCollapse, groups } = useGroupBy(tickets, sprints, sprintNameMap, isAllView);

  const effectiveVisibleColumns = useMemo(() => {
    if (!groupBy || groupBy === "none") return f.visibleColumns;
    const cols = new Set(f.visibleColumns);
    if (groupBy === "epic") cols.delete("epic");
    if (groupBy === "sprint") cols.delete("sprint");
    return cols;
  }, [f.visibleColumns, groupBy]);

  const activeSprint = isAllView ? null : sprints.find((s) => s.id === activeSprintId);
  const activeSprintName = activeSprint?.name ?? null;
  const [isSprintFollowed, setIsSprintFollowed] = useState(false);

  useEffect(() => {
    if (!activeSprintName) { setIsSprintFollowed(false); return; }
    followedSprints.list()
      .then((names: string[]) => setIsSprintFollowed(names.includes(activeSprintName)))
      .catch(() => {});
  }, [activeSprintName]);

  const handleToggleFollowSprint = useCallback(async () => {
    if (!activeSprintName) return;
    if (isSprintFollowed) {
      await followedSprints.unfollow(activeSprintName);
      setIsSprintFollowed(false);
    } else {
      await followedSprints.follow(activeSprintName);
      setIsSprintFollowed(true);
    }
  }, [activeSprintName, isSprintFollowed]);
  const pageTitle = usePageTitle(isAllView ? "Sprint Board - All" : activeSprint ? `${activeSprint.name} - Sprint Board` : "Sprint Board");
  const selected = tickets.find((t) => t.key === selectedTicket);
  const todoCount = allTickets.filter((t) => t.jiraStatus === "TO DO").length;
  const inProgressCount = allTickets.filter((t) => t.jiraStatus === "IN PROGRESS").length;
  const testCount = allTickets.filter((t) => t.jiraStatus === "TEST").length;
  const doneCount = allTickets.filter((t) => t.jiraStatus === "DONE").length;
  const totalPoints = allTickets.reduce((sum, t) => sum + (t.storyPoints || 0), 0);
  const allChecked = checkedTickets.size === tickets.length && tickets.length > 0;
  const someChecked = checkedTickets.size > 0;

  useEffect(() => {
    if (apiTickets && apiTickets.length > 0) {
      setPoStatuses((prev) => {
        let changed = false;
        const next = { ...prev };
        apiTickets.forEach((t) => { if (!(t.key in next)) { next[t.key] = t.poStatus; changed = true; } });
        return changed ? next : prev;
      });
    }
  }, [apiTickets]);

  // Prefetch adjacent sprint slots when board loads
  useEffect(() => {
    if (isAllView || slotSprints.length === 0) return;
    const prevSlot = slotSprints[activeSlot - 1];
    const nextSlot = slotSprints[activeSlot + 1];
    if (prevSlot) prefetchTicketList(prevSlot);
    if (nextSlot) prefetchTicketList(nextSlot);
  }, [activeSlot, slotSprints, isAllView]);

  // Prefetch first 5 ticket details for instant side panel opens
  useEffect(() => {
    if (!allTickets || allTickets.length === 0) return;
    allTickets.slice(0, 5).forEach((t) => prefetchTicketDetail(t.key));
    return () => cancelAllPrefetches();
  }, [allTickets]);

  useEffect(() => { return () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }; }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    function onOpenSearch() { setSearchModalOpen(true); }
    window.addEventListener("valk:openSearch", onOpenSearch);
    return () => { window.removeEventListener("valk:openSearch", onOpenSearch); };
  }, []);

  useEffect(() => {
    if (!headerMenuOpen) return;
    function handleClick(e: MouseEvent) {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) setHeaderMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [headerMenuOpen]);

  const navigateToSprint = useCallback((sprintId: string) => {
    f.resetFilters();
    if (f.activeViewId) {
      // Leaving a saved view — restore default column config so the sprint view
      // doesn't inherit the view's custom column selection.
      resetToDefaults();
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("sprint", sprintId);
    params.delete("view");
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [f, searchParams, router, resetToDefaults]);

  const setActiveSlot = useCallback((slot: number) => {
    const sprintId = slotSprints[slot];
    if (!sprintId) return;
    setEphemeralSprintId(null);
    navigateToSprint(sprintId);
  }, [slotSprints, navigateToSprint]);

  const handleAllClick = useCallback(() => {
    setEphemeralSprintId(null);
    navigateToSprint("__all__");
  }, [navigateToSprint]);

  const toggleCheck = useCallback((key: string) => {
    setCheckedTickets((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  }, []);

  const toggleAll = useCallback(() => {
    setCheckedTickets(allChecked ? new Set() : new Set(tickets.map((t) => t.key)));
  }, [allChecked, tickets]);

  const handleReorder = useCallback((activeKey: string, overKey: string) => {
    const currentOrder = poPriorityOrder ?? tickets.map((t) => t.key);
    const oldIndex = currentOrder.indexOf(activeKey);
    const newIndex = currentOrder.indexOf(overKey);
    if (oldIndex === -1 || newIndex === -1) return;
    const newOrder = [...currentOrder];
    newOrder.splice(oldIndex, 1);
    newOrder.splice(newIndex, 0, activeKey);
    setPoPriorityOrder(newOrder);
  }, [poPriorityOrder, tickets, setPoPriorityOrder]);

  const handleRangeCheck = useCallback((keys: string[], checked: boolean) => {
    setCheckedTickets((prev) => { const next = new Set(prev); if (checked) keys.forEach((k) => next.add(k)); else keys.forEach((k) => next.delete(k)); return next; });
  }, []);

  const handleBulkSetPoStatus = useCallback(async (status: POStatus) => {
    const keys = [...checkedTickets];
    const prevStatuses = Object.fromEntries(keys.map((k) => [k, poStatuses[k]]));
    setPoStatuses((prev) => { const next = { ...prev }; keys.forEach((k) => { next[k] = status; }); return next; });
    setInflightKeys((prev) => { const next = new Set(prev); keys.forEach((k) => next.add(k)); return next; });
    const results = await Promise.all(keys.map((k) => saveTicketMetadata(k, { poStatus: status })));
    setInflightKeys((prev) => { const next = new Set(prev); keys.forEach((k) => next.delete(k)); return next; });
    const failedCount = results.filter((ok) => !ok).length;
    if (failedCount > 0) {
      setPoStatuses((prev) => ({ ...prev, ...prevStatuses }));
      showToast(`Failed to update ${failedCount} ticket${failedCount === 1 ? "" : "s"}. Changes reverted.`);
    } else {
      showToast(`PO Status set to "${status || "None"}" for ${keys.length} ticket${keys.length === 1 ? "" : "s"}`);
    }
  }, [checkedTickets, poStatuses, showToast]);

  const handleBulkRefresh = useCallback(async () => {
    setBulkRefreshing(true);
    try {
      await jira.syncTickets({ sprintId: slotSprints[activeSlot] });
      showToast(`Refreshed ${checkedTickets.size} ticket${checkedTickets.size === 1 ? "" : "s"} from Jira`);
    } finally { setBulkRefreshing(false); }
  }, [slotSprints, activeSlot, checkedTickets.size, showToast]);

  const handleBulkReviewStory = useCallback(async () => {
    const keys = Array.from(checkedTickets);
    showToast(`Reviewing ${keys.length} ticket${keys.length === 1 ? "" : "s"}...`);
    await bulkReviewStories(keys);
    mutateTickets();
    showToast(`Reviewed ${keys.length} ticket${keys.length === 1 ? "" : "s"}`);
  }, [checkedTickets, showToast, mutateTickets]);

  const handleCopyToClipboard = useCallback(() => {
    const selected = tickets.filter((t) => checkedTickets.has(t.key));
    const text = selected.map((t) => `- ${t.title} - ${getJiraUrl(t.key)}`).join("\n");
    navigator.clipboard.writeText(text).then(() => {
      showToast(`Copied ${selected.length} ticket${selected.length === 1 ? "" : "s"} to clipboard`);
    }).catch(() => {
      showToast("Failed to copy to clipboard");
    });
  }, [tickets, checkedTickets, showToast]);

  const handleTableKeyDown = useCallback((e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (e.key === "Escape") { setSelectedTicket(null); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setFocusedTicketIdx((prev) => Math.min(prev + 1, tickets.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setFocusedTicketIdx((prev) => Math.max(prev - 1, 0)); }
    else if (e.key === "Enter" && focusedTicketIdx >= 0 && focusedTicketIdx < tickets.length) { e.preventDefault(); const t = tickets[focusedTicketIdx]; setSelectedTicket((prev) => (prev === t.key ? null : t.key)); }
  }, [tickets, focusedTicketIdx]);

  const handleSlotEdit = useCallback((slotIndex: number) => { setEditingSlot((prev) => (prev === slotIndex ? null : slotIndex)); }, []);

  const handleSprintSelect = useCallback((sprintId: string) => {
    if (editingSlot !== null) { setSlotSprints((prev) => { const next = [...prev]; next[editingSlot] = sprintId; saveSprintSlots(next, sprints); return next; }); }
  }, [editingSlot, sprints]);

  const handleSprintListSelect = useCallback((sprintId: string) => {
    setEphemeralSprintId(sprintId);
    navigateToSprint(sprintId);
  }, [navigateToSprint]);

  const handleEphemeralClick = useCallback(() => {
    if (ephemeralSprintId) navigateToSprint(ephemeralSprintId);
  }, [ephemeralSprintId, navigateToSprint]);

  const handleAddSlotWithSprint = useCallback((sprintId: string) => {
    setSlotSprints((prev) => {
      if (prev.includes(sprintId)) { const next = prev.filter((id) => id !== sprintId); saveSprintSlots(next, sprints); return next; }
      if (prev.length >= 8) return prev;
      const next = [...prev, sprintId]; saveSprintSlots(next, sprints); return next;
    });
  }, [sprints]);

  const [inflightKeys, setInflightKeys] = useState<Set<string>>(new Set());
  const [boardActiveDragId, setBoardActiveDragId] = useState<string | null>(null);
  const [boardOverId, setBoardOverId] = useState<string | null>(null);
  // Sprint ID of the group the user is currently dragging over (for cross-group label in overlay)
  const [boardDragTargetSprintId, setBoardDragTargetSprintId] = useState<string | null>(null);

  // Jira-rank DnD:
  // - Single sprint view: enabled when sorted by rank, within virtualization threshold.
  // - All view: enabled when grouped by sprint + sorted by rank (cross-group = sprint move).
  const VIRTUALIZE_THRESHOLD = 80;
  const jiraRankDndEnabled = (
    f.sortField === "rank" &&
    !f.activeViewId &&
    (
      (!isAllView && tickets.length <= VIRTUALIZE_THRESHOLD) ||
      (isAllView && groupBy === "sprint")
    )
  );

  const boardSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const handlePoStatusChange = useCallback((key: string, status: POStatus) => {
    const prevStatus = poStatuses[key];
    setPoStatuses((prev) => ({ ...prev, [key]: status }));
    setInflightKeys((prev) => new Set(prev).add(key));
    saveTicketMetadata(key, { poStatus: status }).then((ok) => {
      setInflightKeys((prev) => { const next = new Set(prev); next.delete(key); return next; });
      if (!ok) {
        setPoStatuses((prev) => ({ ...prev, [key]: prevStatus }));
        setToast(`Failed to update ${key}. Change reverted.`);
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setToast(null), 5000);
      }
    });
  }, [poStatuses]);

  const handleBoardDragStart = useCallback((event: DragStartEvent) => {
    setBoardActiveDragId(event.active.id as string);
    setBoardDragTargetSprintId(null);
  }, []);

  const handleBoardDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    const overId = over ? String(over.id) : null;
    // Only track ticket-key overs for insertion line indicator (not sprint-slot/group-zone droppables)
    setBoardOverId(
      overId && !overId.startsWith("sprint-slot:") && !overId.startsWith("group-zone:")
        ? overId
        : null
    );
    // Track target sprint for cross-group overlay label
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
      const prevData = apiTickets;
      mutateTickets(
        (current) => current?.filter((t) => !keysToMove.includes(t.key)) ?? [],
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
      } catch {
        mutateTickets(prevData, { revalidate: true });
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
  }, [activeSprintId, isAllView, groupBy, checkedTickets, tickets, apiTickets, mutateTickets, sprintNameMap, showToast, setCheckedTickets, setPoPriorityOrder]);

  const handleRefresh = useCallback(async () => {
    setSyncing(true);
    try {
      const data = await jira.syncTickets({ sprintId: slotSprints[activeSlot] }) as { count?: number } | null;
      const count = data?.count ?? 0;
      showToast(`Refreshed ${count} ticket${count === 1 ? "" : "s"}`);
      mutateTickets();
    } catch {
      showToast("Failed to refresh tickets");
    } finally { setSyncing(false); }
  }, [slotSprints, activeSlot, showToast, mutateTickets]);

  const handleColumnReorder = useCallback((activeId: ColumnId, overId: ColumnId) => {
    setColumnOrder((prev) => {
      const oldIndex = prev.indexOf(activeId);
      const newIndex = prev.indexOf(overId);
      if (oldIndex === -1 || newIndex === -1) return prev;
      const next = [...prev];
      next.splice(oldIndex, 1);
      next.splice(newIndex, 0, activeId);
      return next;
    });
  }, [setColumnOrder]);

  const handleReorderSlots = useCallback((activeId: string, overId: string) => {
    setSlotSprints((prev) => {
      const oldIndex = prev.indexOf(activeId); const newIndex = prev.indexOf(overId);
      if (oldIndex === -1 || newIndex === -1) return prev;
      const next = [...prev]; next.splice(oldIndex, 1); next.splice(newIndex, 0, activeId); saveSprintSlots(next, sprints); return next;
    });
  }, [sprints]);

  useEffect(() => {
    if (slotsInitialized.current || sprints.length === 0) return;
    slotsInitialized.current = true;
    apiFetch<{ slotIndex: number; sprintId: string }[]>("/api/sprint-slots")
      .then((savedSlots) => {
        const sprintIds = new Set(sprints.map((s) => s.id));
        if (Array.isArray(savedSlots) && savedSlots.length > 0) {
          const loaded = savedSlots.sort((a, b) => a.slotIndex - b.slotIndex).map((s) => s.sprintId).filter((id) => sprintIds.has(id));
          if (loaded.length > 0) { setSlotSprints(loaded); if (loaded.length !== savedSlots.length) saveSprintSlots(loaded, sprints); return; }
        }
        const fb = sprints.find((s) => s.state === "active") ?? sprints[0];
        if (fb) setSlotSprints([fb.id]);
      })
      .catch(() => { const fb = sprints.find((s) => s.state === "active") ?? sprints[0]; if (fb) setSlotSprints([fb.id]); });
  }, [sprints]);

  if (compareMode) {
    const leftSprint = slotSprints[activeSlot] ?? slotSprints[0] ?? "";
    const rightSprint = slotSprints.find((_, i) => i !== activeSlot) ?? slotSprints[1] ?? "";
    return <MultiSprintView initialLeft={leftSprint} initialRight={rightSprint} sprints={sprints} onClose={() => setCompareMode(false)} />;
  }

  const sortChange = (fld: typeof f.sortField, d: typeof f.sortDir) => { f.setSortField(fld); f.setSortDir(d); };

  // Compute active drag ticket for the DragOverlay
  const boardActiveDragTicket = boardActiveDragId ? tickets.find((t) => t.key === boardActiveDragId) : null;
  const boardDraggedKeys = boardActiveDragId && checkedTickets.has(boardActiveDragId)
    ? [...checkedTickets].filter((k) => tickets.some((t) => t.key === k))
    : boardActiveDragId ? [boardActiveDragId] : [];
  const ticketIds = tickets.map((t) => t.key);

  return (
    <>
      {pageTitle}
      <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        {(isAllView || activeSprint || f.activeView) && (
          <ViewHeader
            icon={isAllView ? <LayoutGrid size={15} strokeWidth={1.5} className="text-white/30" />
              : f.activeView ? <Bookmark size={15} strokeWidth={1.5} className="text-white/30" fill="currentColor" />
              : <CalendarRange size={15} strokeWidth={1.5} className="text-white/30" />}
            actions={<>
              {!isAllView && !f.activeView && activeSprint && (
                <Button
                  variant="secondary"
                  size="md"
                  iconOnly
                  icon={isSprintFollowed
                    ? <BellOff className="h-3.5 w-3.5" strokeWidth={1.5} />
                    : <Bell className="h-3.5 w-3.5" strokeWidth={1.5} />}
                  onClick={handleToggleFollowSprint}
                  title={isSprintFollowed ? "Unfollow sprint (stop UAT deploy notifications)" : "Follow sprint (get UAT deploy notifications)"}
                  className={isSprintFollowed ? "border-[var(--color-brand-500)]/40 text-[var(--color-brand-400)]" : ""}
                />
              )}
              <Button variant="soft" size="md" icon={<NotebookPen className="h-3 w-3" strokeWidth={1.5} />} onClick={() => setShowStoryWriterLauncher(true)} className="shadow-[0_2px_8px_rgba(46,145,73,0.12)]">
                Story writer
              </Button>
              <Button variant="secondary" size="md" iconOnly icon={<Search className="h-3.5 w-3.5" strokeWidth={1.5} />} onClick={() => setSearchModalOpen(true)} title="Search tickets (⇧⌘K)" />
              <div ref={headerMenuRef} className="relative">
                <Button
                  variant="ghost"
                  size="md"
                  iconOnly
                  icon={<MoreHorizontal size={14} strokeWidth={1.5} />}
                  onClick={() => setHeaderMenuOpen((v) => !v)}
                  title="More options"
                  className={headerMenuOpen ? "border-white/[0.12] bg-white/[0.08] text-white/70" : ""}
                />
                {headerMenuOpen && (
                  <div className="absolute right-0 top-full z-30 mt-1.5 w-44 rounded-xl border border-white/[0.10] bg-[var(--color-surface-floating)] py-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
                    <button
                      type="button"
                      onClick={() => { setAnalyticsVisible((v) => !v); setHeaderMenuOpen(false); }}
                      className={`flex w-full items-center gap-2.5 px-3 py-2 text-xs cursor-pointer transition-colors duration-150 ${
                        analyticsVisible
                          ? "text-[var(--color-brand-400)] bg-[var(--color-brand-500)]/[0.08]"
                          : "text-white/65 hover:bg-white/[0.06] hover:text-white/85"
                      }`}
                    >
                      <BarChart2 size={13} strokeWidth={1.5} className="shrink-0" />
                      <span>Analytics</span>
                    </button>
                    {!isAllView && !f.activeView && (
                      <button
                        type="button"
                        onClick={() => { setCompareMode(true); setHeaderMenuOpen(false); }}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-white/65 cursor-pointer hover:bg-white/[0.06] hover:text-white/85 transition-colors duration-150"
                      >
                        <Columns2 size={13} strokeWidth={1.5} className="shrink-0" />
                        <span>Compare</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => { setSprintsModalOpen(true); setHeaderMenuOpen(false); }}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-white/65 cursor-pointer hover:bg-white/[0.06] hover:text-white/85 transition-colors duration-150"
                    >
                      <List size={13} strokeWidth={1.5} className="shrink-0" />
                      <span>Sprints</span>
                    </button>
                  </div>
                )}
                {sprintsModalOpen && (
                  <SprintListModal
                    onClose={() => setSprintsModalOpen(false)}
                    onSelect={handleSprintListSelect}
                    onPin={handleAddSlotWithSprint}
                    pinnedIds={new Set(slotSprints)}
                  />
                )}
              </div>
            </>}
          >
            <ViewHeaderTitle>
              {isAllView ? "All tickets" : f.activeView ? f.activeView.title : activeSprint!.name}
            </ViewHeaderTitle>
            {!ticketsLoading && (
              <>
                <ViewHeaderDivider />
                <span className="text-xs tabular-nums text-white/30 shrink-0"><span className="text-white/20">Items</span> {f.hasActiveFilters ? `${tickets.length}/${allTickets.length}` : allTickets.length}</span>
                {!isAllView && !f.activeView && totalPoints > 0 && <span className="text-xs tabular-nums text-white/30 shrink-0"><span className="text-white/20">Pts</span> {totalPoints}</span>}
                {!isAllView && !f.activeView && (
                  <>
                    <ViewHeaderDivider />
                    <div className="flex items-center gap-1.5 text-[11px] font-medium">
                      {([
                        { status: "TO DO", count: todoCount, bg: "rgba(100, 116, 139, 0.15)", text: "#94a3b8" },
                        { status: "IN PROGRESS", count: inProgressCount, bg: "rgba(56, 152, 210, 0.15)", text: "#58b4e6" },
                        ...(testCount > 0 ? [{ status: "TEST", count: testCount, bg: "rgba(120, 90, 220, 0.15)", text: "#9b7ee8" }] : []),
                        { status: "DONE", count: doneCount, bg: "rgba(34, 197, 94, 0.15)", text: "#4ade80" },
                      ] as const).map(({ status, count, bg, text }) => {
                        const active = f.statusFilter.has(status);
                        return (
                          <button
                            key={status}
                            type="button"
                            onClick={() => {
                              const next = new Set(f.statusFilter);
                              if (active) next.delete(status); else next.add(status);
                              f.setStatusFilter(next);
                            }}
                            className="inline-flex items-center rounded px-1.5 py-0.5 cursor-pointer transition-opacity duration-150 hover:opacity-80 active:opacity-60"
                            style={{ backgroundColor: bg, color: text, opacity: f.statusFilter.size > 0 && !active ? 0.4 : 1 }}
                          >
                            {status}: {count}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            )}
          </ViewHeader>
        )}

        {/* Sprint board body -- optionally wrapped in a parent DndContext for Jira rank DnD */}
        {jiraRankDndEnabled ? (
          <DndContext
            sensors={boardSensors}
            collisionDetection={boardCollisionDetection}
            onDragStart={handleBoardDragStart}
            onDragOver={handleBoardDragOver}
            onDragEnd={handleBoardDragEnd}
          >
            <div className="relative">
              <SprintSlots slotSprints={slotSprints} activeSlot={activeSlot} allActive={isAllView && !f.activeViewId} sprints={sprints} onSlotClick={setActiveSlot} onAllClick={handleAllClick} editingSlot={editingSlot} onSlotEdit={handleSlotEdit} onSprintSelect={handleSprintSelect} onEditClose={() => setEditingSlot(null)} syncing={syncing} onRefresh={handleRefresh} onReorderSlots={handleReorderSlots} ephemeralSprintId={ephemeralSprintId} ephemeralIsActive={ephemeralIsActive} onEphemeralClick={handleEphemeralClick} filtersCollapsed={barsCollapsed} onToggleFilters={() => setBarsCollapsed((v) => !v)} savedViews={f.savedViews} activeViewId={f.activeViewId} onViewClick={f.handleViewClick} sortField={f.sortField} sortDir={f.sortDir} onSortChange={sortChange} columnVisible={f.visibleColumns} columnOrder={columnOrder} onColumnToggle={toggleColumn} onColumnReorder={handleColumnReorder} onColumnReset={resetToDefaults} groupBy={groupBy} onGroupByChange={setGroupBy} />
              {boardActiveDragId && <SprintDropZoneBar sprints={sprints} slotSprints={slotSprints} activeSprintId={activeSprintId} />}
            </div>

            {!barsCollapsed && (
              <>
                <div className="border-b border-white/[0.06]">
                  <FilterBar statusFilter={f.statusFilter} epicFilter={f.epicFilter} assigneeFilter={f.assigneeFilter} poStatusFilter={f.poStatusFilter} editStateFilter={f.editStateFilter} issueTypeFilter={f.issueTypeFilter} onStatusFilterChange={f.setStatusFilter} onEpicFilterChange={f.setEpicFilter} onAssigneeFilterChange={f.setAssigneeFilter} onPoStatusFilterChange={f.setPoStatusFilter} onEditStateFilterChange={f.setEditStateFilter} onIssueTypeFilterChange={f.setIssueTypeFilter} statusOptions={f.statusOptions} epicOptions={f.epicOptions} assigneeOptions={f.assigneeOptions} issueTypeOptions={f.issueTypeOptions} {... (isAllView ? { ...(groupBy !== "epic" ? { teamFilter: f.teamFilter, onTeamFilterChange: f.setTeamFilter, teamOptions: f.teamOptions } : {}), sprintFilter: f.sprintFilter, onSprintFilterChange: f.setSprintFilter, sprintOptions: f.sprintOptions, sprintNameMap } : {})} noBorder searchQuery={f.searchQuery} onSearchChange={f.setSearchQuery} onSaveView={f.handleSaveView} onDeleteView={f.activeViewId ? () => f.handleDeleteView(f.activeViewId!) : undefined} activeView={f.activeView} />
                </div>
                {!ticketsLoading && analyticsVisible && <SprintAnalytics tickets={allTickets} />}
              </>
            )}

            {ticketsLoading && <LoadingState variant="spinner" label="Loading tickets..." />}

            {!ticketsLoading && (
              <TicketTable tickets={tickets} checkedTickets={checkedTickets} selectedTicket={selectedTicket} hoveredRow={hoveredRow} focusedTicketIdx={focusedTicketIdx} someChecked={someChecked} allChecked={allChecked} visibleColumns={effectiveVisibleColumns} sprintNameMap={sprintNameMap} poStatuses={poStatuses} inflightKeys={inflightKeys} onToggleCheck={toggleCheck} onRangeCheck={handleRangeCheck} onToggleAll={toggleAll} onSelectTicket={setSelectedTicket} onHoverRow={setHoveredRow} onLeaveRow={() => setHoveredRow(null)} onPoStatusChange={handlePoStatusChange} onTableKeyDown={handleTableKeyDown} sortField={f.sortField} sortDir={f.sortDir} onSortChange={sortChange} columnOrder={columnOrder} columnWidths={columnWidths} onColumnResize={setColumnWidth} onColumnResetWidth={resetColumnWidth} externalDnd externalActiveDragId={boardActiveDragId} dragOverKey={boardOverId} groups={groups} collapsedGroups={collapsedGroups} onToggleCollapse={toggleCollapse} groupBy={groupBy} />
            )}

            {someChecked && <BulkActionBar count={checkedTickets.size} onClear={() => setCheckedTickets(new Set())} onSetPoStatus={handleBulkSetPoStatus} onRefreshFromJira={handleBulkRefresh} onReviewStory={handleBulkReviewStory} onCopyToClipboard={handleCopyToClipboard} isRefreshing={bulkRefreshing} />}

            <DragOverlay dropAnimation={null} modifiers={[snapToPointer]}>
              {boardActiveDragTicket && (
                <div style={{ opacity: 0.92 }}>
                  <div className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-brand-500)]/20 bg-[var(--color-surface-elevated)] px-3 py-2 text-sm shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
                    <IssueTypeIcon type={boardActiveDragTicket.type} />
                    <span className="font-mono text-xs text-white/40">{boardActiveDragTicket.key}</span>
                    <span className="max-w-48 truncate text-white/75">{boardActiveDragTicket.title}</span>
                    {boardDraggedKeys.length > 1 && (
                      <span className="ml-1 rounded-full bg-[var(--color-brand-500)]/20 px-1.5 py-0.5 text-[10px] text-[var(--color-brand-300)]">
                        +{boardDraggedKeys.length - 1}
                      </span>
                    )}
                  </div>
                  {boardDragTargetSprintId && (
                    <div className="mt-1.5 rounded-md border border-[var(--color-brand-500)]/30 bg-[var(--color-surface-elevated)] px-2 py-1 text-[11px] text-[var(--color-brand-300)]">
                      Move to {sprintNameMap[boardDragTargetSprintId] ?? boardDragTargetSprintId}
                    </div>
                  )}
                </div>
              )}
            </DragOverlay>
          </DndContext>
        ) : (
          <>
            <SprintSlots slotSprints={slotSprints} activeSlot={activeSlot} allActive={isAllView && !f.activeViewId} sprints={sprints} onSlotClick={setActiveSlot} onAllClick={handleAllClick} editingSlot={editingSlot} onSlotEdit={handleSlotEdit} onSprintSelect={handleSprintSelect} onEditClose={() => setEditingSlot(null)} syncing={syncing} onRefresh={handleRefresh} onReorderSlots={handleReorderSlots} ephemeralSprintId={ephemeralSprintId} ephemeralIsActive={ephemeralIsActive} onEphemeralClick={handleEphemeralClick} filtersCollapsed={barsCollapsed} onToggleFilters={() => setBarsCollapsed((v) => !v)} savedViews={f.savedViews} activeViewId={f.activeViewId} onViewClick={f.handleViewClick} sortField={f.sortField} sortDir={f.sortDir} onSortChange={sortChange} columnVisible={f.visibleColumns} columnOrder={columnOrder} onColumnToggle={toggleColumn} onColumnReorder={handleColumnReorder} onColumnReset={resetToDefaults} groupBy={groupBy} onGroupByChange={setGroupBy} />

            {!barsCollapsed && (
              <>
                <div className="border-b border-white/[0.06]">
                  <FilterBar statusFilter={f.statusFilter} epicFilter={f.epicFilter} assigneeFilter={f.assigneeFilter} poStatusFilter={f.poStatusFilter} editStateFilter={f.editStateFilter} issueTypeFilter={f.issueTypeFilter} onStatusFilterChange={f.setStatusFilter} onEpicFilterChange={f.setEpicFilter} onAssigneeFilterChange={f.setAssigneeFilter} onPoStatusFilterChange={f.setPoStatusFilter} onEditStateFilterChange={f.setEditStateFilter} onIssueTypeFilterChange={f.setIssueTypeFilter} statusOptions={f.statusOptions} epicOptions={f.epicOptions} assigneeOptions={f.assigneeOptions} issueTypeOptions={f.issueTypeOptions} {... (isAllView ? { ...(groupBy !== "epic" ? { teamFilter: f.teamFilter, onTeamFilterChange: f.setTeamFilter, teamOptions: f.teamOptions } : {}), sprintFilter: f.sprintFilter, onSprintFilterChange: f.setSprintFilter, sprintOptions: f.sprintOptions, sprintNameMap } : {})} noBorder searchQuery={f.searchQuery} onSearchChange={f.setSearchQuery} onSaveView={f.handleSaveView} onDeleteView={f.activeViewId ? () => f.handleDeleteView(f.activeViewId!) : undefined} activeView={f.activeView} />
                </div>
                {!ticketsLoading && analyticsVisible && <SprintAnalytics tickets={allTickets} />}
              </>
            )}

            {ticketsLoading && <LoadingState variant="spinner" label="Loading tickets..." />}

            {!ticketsLoading && <TicketTable tickets={tickets} checkedTickets={checkedTickets} selectedTicket={selectedTicket} hoveredRow={hoveredRow} focusedTicketIdx={focusedTicketIdx} someChecked={someChecked} allChecked={allChecked} visibleColumns={effectiveVisibleColumns} sprintNameMap={sprintNameMap} poStatuses={poStatuses} inflightKeys={inflightKeys} onToggleCheck={toggleCheck} onRangeCheck={handleRangeCheck} onToggleAll={toggleAll} onSelectTicket={setSelectedTicket} onHoverRow={setHoveredRow} onLeaveRow={() => setHoveredRow(null)} onPoStatusChange={handlePoStatusChange} onTableKeyDown={handleTableKeyDown} onReorder={handleReorder} sortField={f.sortField} sortDir={f.sortDir} onSortChange={sortChange} columnOrder={columnOrder} columnWidths={columnWidths} onColumnResize={setColumnWidth} onColumnResetWidth={resetColumnWidth} groups={groups} collapsedGroups={collapsedGroups} onToggleCollapse={toggleCollapse} groupBy={groupBy} />}

            {someChecked && <BulkActionBar count={checkedTickets.size} onClear={() => setCheckedTickets(new Set())} onSetPoStatus={handleBulkSetPoStatus} onRefreshFromJira={handleBulkRefresh} onReviewStory={handleBulkReviewStory} onCopyToClipboard={handleCopyToClipboard} isRefreshing={bulkRefreshing} />}
          </>
        )}
      </div>

      {selected && (() => {
        const idx = tickets.findIndex((t) => t.key === selected.key);
        const adjacentKeys = { prev: idx > 0 ? tickets[idx - 1].key : null, next: idx < tickets.length - 1 ? tickets[idx + 1].key : null };
        return <SidePanel ticket={selected} poStatus={poStatuses[selected.key] ?? null} onPoStatusChange={(v) => handlePoStatusChange(selected.key, v)} onNotesChange={(notes) => { saveTicketMetadata(selected.key, { poNotes: notes }); }} onClose={() => setSelectedTicket(null)} onShowToast={showToast} adjacentKeys={adjacentKeys} />;
      })()}

      {toast && (
        <div role="status" className="pointer-events-none fixed right-6 bottom-6 z-50 flex items-center gap-2 rounded-lg border border-white/[0.08] bg-[var(--color-surface-floating)] px-4 py-2.5 shadow-[0_4px_24px_rgba(0,0,0,0.4)]" style={{ animation: "fadeInUp 0.2s ease-out" }}>
          <Check className="h-4 w-4 shrink-0 text-[var(--color-brand-400)]" strokeWidth={1.5} />
          <span className="text-sm text-white/70">{toast}</span>
        </div>
      )}
      <SearchModal open={searchModalOpen} initialQuery={f.searchQuery} onClose={() => setSearchModalOpen(false)} onSelectTicket={(key: string) => setSelectedTicket(key)} sprintNameMap={sprintNameMap} />
      <StoryWriterLauncherModal open={showStoryWriterLauncher} onClose={() => setShowStoryWriterLauncher(false)} />
      <style>{`@keyframes fadeInUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
    </>
  );
}
