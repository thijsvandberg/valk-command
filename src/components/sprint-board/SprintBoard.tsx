"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { POStatus, TicketReadiness, Sprint, IssueType, JiraStatus } from "@/types/ticket";
import { SprintSlots } from "@/components/sprint-board/SprintSlots";
import { FilterBar } from "@/components/sprint-board/FilterBar";
import { TicketTable } from "@/components/sprint-board/TicketTable";
import { BulkActionBar } from "@/components/sprint-board/BulkActionBar";
import { SidePanel } from "@/components/sprint-board/SidePanel";
import { SprintAnalytics } from "@/components/sprint-board/SprintAnalytics";
import dynamic from "next/dynamic";
const SearchModal = dynamic(() => import("@/components/sprint-board/SearchModal").then((m) => ({ default: m.SearchModal })), { ssr: false });
import { StoryWriterLauncherModal } from "@/components/shared/StoryWriterLauncherModal";
import { AddToRefinementModal } from "@/components/refinement-session/AddToRefinementModal";
import { useJiraSprints, useTickets } from "@/hooks/useSprintBoard";
import { useTicketSessionMap } from "@/hooks/useTicketSessionMap";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useExportTask } from "@/hooks/useExportTask";
import { usePageTitle } from "@/hooks/usePageTitle";
import { mapJiraSprints, saveSprintSlots, saveTicketMetadata, saveStoryPoints, bulkReviewStories } from "@/components/sprint-board/sprint-board-utils";
import { prefetchTicketList, setRouterPrefetch } from "@/lib/prefetch";
import { getJiraUrl } from "@/components/sprint-board/TicketTableCells";
import { StatusCount, SprintCompletionBar, SprintStats } from "@/components/sprint-board/SprintStatPill";
import { SprintStatsPopover } from "@/components/sprint-board/SprintStatsPopover";
import { SprintDetailsPopover } from "@/components/sprint-board/SprintDetailsPopover";
import { apiFetch, jira, followedSprints, workspaceTasks } from "@/lib/api-client";
import { useSprintBoardFilters } from "@/components/sprint-board/useSprintBoardFilters";
import { useGroupBy } from "@/components/sprint-board/useGroupBy";
import { Columns2, Check, LayoutGrid, CalendarRange, NotebookPen, Search, Bookmark, MoreHorizontal, BarChart2, List, Bell, BellOff, Users, AlertTriangle, Inbox, Copy as CopyIcon, ExternalLink, X } from "lucide-react";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { useSprintBoardDragDrop } from "@/components/sprint-board/useSprintBoardDragDrop";
import { useSprintBoardShortcuts } from "@/components/sprint-board/useSprintBoardShortcuts";
import { SprintDropZoneBar, snapToPointer, boardCollisionDetection } from "@/components/sprint-board/SprintBoardDragDrop";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
const SprintListModal = dynamic(() => import("@/components/sprint-board/SprintListModal").then((m) => ({ default: m.SprintListModal })), { ssr: false });
const SprintEditModal = dynamic(() => import("@/components/sprint-board/SprintEditModal").then((m) => ({ default: m.SprintEditModal })), { ssr: false });
const CreateSprintModal = dynamic(() => import("@/components/sprint-board/CreateSprintModal").then((m) => ({ default: m.CreateSprintModal })), { ssr: false });
import { ViewHeader, ViewHeaderTitle, ViewHeaderDivider } from "@/components/shared/ViewHeader";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/shared/LoadingState";
import { useColumnWidths } from "@/hooks/useColumnWidths";
import { useColumnConfig } from "@/hooks/useColumnConfig";
import type { ColumnId } from "@/components/sprint-board/FilterBar";

export default function SprintBoard() {
  const { sprints: rawJiraSprints, backlogCount, data: sprintsData } = useJiraSprints();
  const sprints = useMemo(() => {
    const mapped = mapJiraSprints(rawJiraSprints);
    mapped.push({ id: "__backlog__", name: "Backlog", dateRange: "", state: "backlog", ticketCount: backlogCount, startDate: null, endDate: null, goal: null });
    return mapped;
  }, [rawJiraSprints, backlogCount]);
  const { ticketSessionMap } = useTicketSessionMap();
  const searchParams = useSearchParams();
  const router = useRouter();
  setRouterPrefetch((url) => router.prefetch(url));

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
  const [focusedTicketIdx, setFocusedTicketIdx] = useState<number>(-1);
  const [poStatuses, setPoStatuses] = useState<Record<string, POStatus>>({});
  const [readinessMap, setReadinessMap] = useState<Record<string, TicketReadiness | null>>({});
  const [poPriorityMap, setPoPriorityMap] = useLocalStorage<Record<string, string[]>>("sprint-board-po-priority-map", {});
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [barsCollapsed, setBarsCollapsed] = useLocalStorage("sprint-bars-collapsed", false);
  const [analyticsVisible, setAnalyticsVisible] = useLocalStorage("sprint-analytics-visible", false);
  const [showStoryWriterLauncher, setShowStoryWriterLauncher] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [sprintsModalOpen, setSprintsModalOpen] = useState(false);
  const [statsPopoverOpen, setStatsPopoverOpen] = useState(false);
  const [detailsPopoverOpen, setDetailsPopoverOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [autoSuggest, setAutoSuggest] = useState(false);
  const [createSprintModalOpen, setCreateSprintModalOpen] = useState(false);
  const [goalSuggestionUrl, setGoalSuggestionUrl] = useState<string | null>(null);
  const completionBarRef = useRef<HTMLDivElement>(null);
  const headerMenuRef = useRef<HTMLDivElement>(null);
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const mainScrollRef = useRef<HTMLElement>(null);
  const [bulkRefreshing, setBulkRefreshing] = useState(false);
  const exportTask = useExportTask();
  const [toast, setToast] = useState<React.ReactNode | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slotsInitialized = useRef(false);

  const sprintNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    sprints.forEach((s) => { map[s.id] = s.name; });
    return map;
  }, [sprints]);

  const activeSprintId = (isAllView || searchParams.get("view")) ? "__all__" : ephemeralIsActive ? ephemeralSprintId! : slotSprints[activeSlot];

  const poPriorityOrder = activeSprintId ? (poPriorityMap[activeSprintId] ?? null) : null;
  const setPoPriorityOrder = useCallback((order: string[] | null) => {
    if (!activeSprintId) return;
    setPoPriorityMap((prev) => {
      if (order === null) {
        const next = { ...prev };
        delete next[activeSprintId];
        return next;
      }
      return { ...prev, [activeSprintId]: order };
    });
  }, [activeSprintId, setPoPriorityMap]);

  // Track sprint goal suggestion conversation for the active sprint
  useEffect(() => {
    if (!activeSprintId || activeSprintId === "__all__") { setGoalSuggestionUrl(null); return; }
    try {
      const raw = localStorage.getItem(`sprint-goal-conv-${activeSprintId}`);
      if (raw) setGoalSuggestionUrl(`/chat/${raw}`);
      else setGoalSuggestionUrl(null);
    } catch { setGoalSuggestionUrl(null); }
  }, [activeSprintId]);

  const { data: apiTickets, isLoading: ticketsLoading, mutate: mutateTickets } = useTickets(activeSprintId || null);
  const allTickets = useMemo(() => apiTickets ?? [], [apiTickets]);

  // SWR key for the active ticket list, used for targeted optimistic mutations
  const activeListKey = useMemo(() => {
    if (!activeSprintId) return null;
    return activeSprintId === "__all__"
      ? "/api/tickets"
      : `/api/tickets?sprintId=${encodeURIComponent(activeSprintId)}`;
  }, [activeSprintId]);

  const { widths: columnWidths, setColumnWidth, resetColumnWidth } = useColumnWidths();
  const { order: columnOrder, visible: columnVisible, setColumnOrder, toggleColumn, resetTo, resetToDefaults } = useColumnConfig();
  const f = useSprintBoardFilters(allTickets, readinessMap, isAllView, poPriorityOrder, columnVisible, columnOrder, resetTo, sprintNameMap);
  const tickets = f.sortedTickets;
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (f.statusFilter.size > 0) count++;
    if (f.epicFilter.size > 0) count++;
    if (f.assigneeFilter.size > 0) count++;
    if (f.readinessFilter.size > 0) count++;
    if (f.editStateFilter.size > 0) count++;
    if (f.issueTypeFilter.size > 0) count++;
    if (f.gapsFilter.size > 0) count++;
    if (f.teamFilter.size > 0) count++;
    if (f.searchQuery) count++;
    return count;
  }, [f.statusFilter, f.epicFilter, f.assigneeFilter, f.readinessFilter, f.editStateFilter, f.issueTypeFilter, f.gapsFilter, f.teamFilter, f.searchQuery]);
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
  const { todoCount, inProgressCount, testCount, doneCount, totalPoints, noPointsCount, deprecatedWithSp, bvTotal, bvScoredCount, bvAvg, statusStats } = useMemo(() => {
    let todo = 0, inProg = 0, test = 0, done = 0, pts = 0, noPts = 0, deprSp = 0, bvT = 0, bvC = 0;
    const stats: Record<string, { sp: number; bv: number }> = {};
    for (const t of allTickets) {
      if (t.jiraStatus === "TO DO") todo++;
      else if (t.jiraStatus === "IN PROGRESS") inProg++;
      else if (t.jiraStatus === "TEST") test++;
      else if (t.jiraStatus === "DONE") done++;
      pts += t.storyPoints || 0;
      if (t.storyPoints == null && t.jiraStatus !== "DEPRECATED" && t.type !== "spike") noPts++;
      if (t.jiraStatus === "DEPRECATED" && t.storyPoints != null && t.storyPoints > 0) deprSp++;
      if (t.businessValue != null && t.businessValue >= 1 && t.jiraStatus !== "DEPRECATED") {
        bvT += t.businessValue;
        bvC++;
      }
      const s = stats[t.jiraStatus] ?? (stats[t.jiraStatus] = { sp: 0, bv: 0 });
      s.sp += t.storyPoints ?? 0;
      s.bv += t.businessValue ?? 0;
    }
    return {
      todoCount: todo, inProgressCount: inProg, testCount: test, doneCount: done,
      totalPoints: pts, noPointsCount: noPts, deprecatedWithSp: deprSp,
      bvTotal: bvT, bvScoredCount: bvC,
      bvAvg: bvC > 0 ? (bvT / bvC).toFixed(1) : null,
      statusStats: stats,
    };
  }, [allTickets]);
  // Sprint working days for active sprint time indicator
  const sprintWorkDays = useMemo(() => {
    if (!activeSprint || activeSprint.state !== "active" || !activeSprint.startDate || !activeSprint.endDate) return { remaining: null, total: null };
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const start = new Date(activeSprint.startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(activeSprint.endDate);
    end.setHours(0, 0, 0, 0);
    let total = 0;
    const d1 = new Date(start);
    while (d1 <= end) { if (d1.getDay() !== 0 && d1.getDay() !== 6) total++; d1.setDate(d1.getDate() + 1); }
    let remaining = 0;
    if (end >= now) {
      const d2 = new Date(now);
      while (d2 <= end) { if (d2.getDay() !== 0 && d2.getDay() !== 6) remaining++; d2.setDate(d2.getDate() + 1); }
    }
    return { remaining, total };
  }, [activeSprint]);

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
      setReadinessMap((prev) => {
        let changed = false;
        const next = { ...prev };
        apiTickets.forEach((t) => { if (!(t.key in next)) { next[t.key] = t.readiness; changed = true; } });
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

  // Ticket detail prefetching is deferred to mouse-enter intent on individual rows
  // (see TicketRow onMouseEnter) rather than eagerly prefetching on mount.

  useEffect(() => { return () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }; }, []);

  // Grab the <main> scroll container for the virtualizer
  useEffect(() => {
    const main = document.getElementById("main-content");
    if (main) (mainScrollRef as React.MutableRefObject<HTMLElement | null>).current = main;
  }, []);

  const showToast = useCallback((message: React.ReactNode, durationMs = 3000) => {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), durationMs);
  }, []);

  const { handleTableKeyDown } = useSprintBoardShortcuts({
    tickets, focusedTicketIdx, setFocusedTicketIdx, setSelectedTicket,
    setSearchModalOpen, headerMenuRef, headerMenuOpen, setHeaderMenuOpen,
  });

  const navigateToSprint = useCallback((sprintId: string) => {
    f.resetFilters();
    if (f.activeViewId) {
      // Leaving a saved view — restore default sort and column config so the
      // sprint view doesn't inherit the view's custom settings.
      f.setSortField("rank");
      f.setSortDir("asc");
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

  const handleBulkSetReadiness = useCallback(async (readiness: TicketReadiness | null) => {
    const keys = [...checkedTickets];
    const prevReadiness = Object.fromEntries(keys.map((k) => [k, readinessMap[k]]));
    setReadinessMap((prev) => { const next = { ...prev }; keys.forEach((k) => { next[k] = readiness; }); return next; });
    setInflightKeys((prev) => { const next = new Set(prev); keys.forEach((k) => next.add(k)); return next; });
    const results = await Promise.all(keys.map((k) => saveTicketMetadata(k, { readiness }, activeListKey)));
    setInflightKeys((prev) => { const next = new Set(prev); keys.forEach((k) => next.delete(k)); return next; });
    const failedCount = results.filter((ok) => !ok).length;
    if (failedCount > 0) {
      setReadinessMap((prev) => ({ ...prev, ...prevReadiness }));
      showToast(`Failed to update ${failedCount} ticket${failedCount === 1 ? "" : "s"}. Changes reverted.`);
    } else {
      showToast(`Readiness set for ${keys.length} ticket${keys.length === 1 ? "" : "s"}`);
    }
  }, [checkedTickets, readinessMap, showToast, activeListKey]);

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

  const handleExportForStakeholders = useCallback(async () => {
    const selected = tickets.filter((t) => checkedTickets.has(t.key));
    if (selected.length === 0) return;

    const ticketData = selected.map((t) => ({
      key: t.key,
      summary: t.title,
      points: t.storyPoints ?? null,
      epic: t.epic ?? null,
    }));

    const sprintLabel = activeSprint?.name ?? "Selected work";

    await exportTask.startExport({
      sprintName: sprintLabel,
      tickets: JSON.stringify(ticketData),
    });
  }, [tickets, checkedTickets, activeSprint, exportTask]);

  const [refineModalOpen, setRefineModalOpen] = useState(false);
  const handleRefineSelected = useCallback(() => {
    if (checkedTickets.size === 0) return;
    setRefineModalOpen(true);
  }, [checkedTickets]);

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

  const handleSprintCreated = useCallback((sprintId: string) => {
    setSlotSprints((prev) => {
      if (prev.length >= 8 || prev.includes(sprintId)) return prev;
      const next = [...prev, sprintId];
      saveSprintSlots(next, sprints);
      return next;
    });
    navigateToSprint(sprintId);
    setCreateSprintModalOpen(false);
  }, [sprints, navigateToSprint]);

  const [inflightKeys, setInflightKeys] = useState<Set<string>>(new Set());

  const dnd = useSprintBoardDragDrop({
    activeSprintId, isAllView, groupBy, checkedTickets, setCheckedTickets,
    tickets, apiTickets, mutateTickets, sprintNameMap, showToast,
    setPoPriorityOrder, sortField: f.sortField, activeViewId: f.activeViewId,
  });

  const handlePoStatusChange = useCallback((key: string, status: POStatus) => {
    const prevStatus = poStatuses[key];
    setPoStatuses((prev) => ({ ...prev, [key]: status }));
    setInflightKeys((prev) => new Set(prev).add(key));
    saveTicketMetadata(key, { poStatus: status }, activeListKey).then((ok) => {
      setInflightKeys((prev) => { const next = new Set(prev); next.delete(key); return next; });
      if (!ok) {
        setPoStatuses((prev) => ({ ...prev, [key]: prevStatus }));
        setToast(`Failed to update ${key}. Change reverted.`);
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setToast(null), 5000);
      }
    });
  }, [poStatuses, activeListKey]);

  const handleReadinessChange = useCallback((key: string, readiness: TicketReadiness | null) => {
    const prev = readinessMap[key];
    setReadinessMap((m) => ({ ...m, [key]: readiness }));
    setInflightKeys((s) => new Set(s).add(key));
    saveTicketMetadata(key, { readiness }, activeListKey).then((ok) => {
      setInflightKeys((s) => { const next = new Set(s); next.delete(key); return next; });
      if (!ok) {
        setReadinessMap((m) => ({ ...m, [key]: prev }));
        setToast(`Failed to update ${key}. Change reverted.`);
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setToast(null), 5000);
      }
    });
  }, [readinessMap, activeListKey]);

  const handleBusinessValueChange = useCallback((key: string, value: number | null) => {
    saveTicketMetadata(key, { businessValue: value }, activeListKey);
  }, [activeListKey]);

  const handleStoryPointsChange = useCallback((key: string, value: number | null) => {
    saveStoryPoints(key, value, activeListKey);
  }, [activeListKey]);

  const handleJiraStatusChange = useCallback(async (key: string, status: JiraStatus) => {
    const prev = apiTickets?.find((t) => t.key === key)?.jiraStatus;
    mutateTickets((data) => data?.map((t) => t.key === key ? { ...t, jiraStatus: status } : t), { revalidate: false });
    try {
      await apiFetch(`/api/tickets/${encodeURIComponent(key)}/status`, { method: "PUT", body: { status } });
    } catch {
      if (prev !== undefined) {
        mutateTickets((data) => data?.map((t) => t.key === key ? { ...t, jiraStatus: prev } : t), { revalidate: false });
      }
    }
  }, [apiTickets, mutateTickets]);

  const handleIssueTypeChange = useCallback(async (key: string, type: IssueType) => {
    const prev = apiTickets?.find((t) => t.key === key)?.type;
    mutateTickets((data) => data?.map((t) => t.key === key ? { ...t, type } : t), { revalidate: false });
    try {
      await apiFetch(`/api/tickets/${encodeURIComponent(key)}`, { method: "PATCH", body: { type } });
    } catch {
      if (prev !== undefined) {
        mutateTickets((data) => data?.map((t) => t.key === key ? { ...t, type: prev } : t), { revalidate: false });
      }
    }
  }, [apiTickets, mutateTickets]);

  const handleTitleChange = useCallback(async (key: string, title: string) => {
    const prev = apiTickets?.find((t) => t.key === key)?.title;
    mutateTickets((data) => data?.map((t) => t.key === key ? { ...t, title } : t), { revalidate: false });
    try {
      await apiFetch(`/api/tickets/${encodeURIComponent(key)}/summary`, { method: "PUT", body: { title } });
    } catch {
      if (prev !== undefined) {
        mutateTickets((data) => data?.map((t) => t.key === key ? { ...t, title: prev } : t), { revalidate: false });
      }
    }
  }, [apiTickets, mutateTickets]);

  const handleCloseSubtasks = useCallback(async (key: string) => {
    const prev = apiTickets?.find((t) => t.key === key);
    if (prev) {
      mutateTickets((data) => data?.map((t) => t.key === key ? { ...t, openSubtaskCount: 0 } : t), { revalidate: false });
    }
    try {
      await apiFetch(`/api/tickets/${encodeURIComponent(key)}/subtasks/close`, { method: "POST" });
    } catch {
      if (prev) {
        mutateTickets((data) => data?.map((t) => t.key === key ? { ...t, openSubtaskCount: prev.openSubtaskCount } : t), { revalidate: false });
      }
    }
  }, [apiTickets, mutateTickets]);

  // DnD handlers are in useSprintBoardDragDrop hook

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
    if (slotsInitialized.current || !sprintsData) return;
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
  }, [sprintsData, sprints]);

  const sortChange = (fld: typeof f.sortField, d: typeof f.sortDir) => { f.setSortField(fld); f.setSortDir(d); };

  const ticketIds = tickets.map((t) => t.key);

  return (
    <>
      {pageTitle}
      <div className="flex min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <ViewHeader
          icon={isAllView ? <LayoutGrid size={15} strokeWidth={1.5} className="text-text-tertiary" />
            : f.activeView ? <Bookmark size={15} strokeWidth={1.5} className="text-text-tertiary" fill="currentColor" />
            : <CalendarRange size={15} strokeWidth={1.5} className="text-text-tertiary" />}
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
                  aria-label={isSprintFollowed ? "Unfollow sprint" : "Follow sprint"}
                  className={isSprintFollowed ? "border-[var(--color-brand-500)]/40 text-[var(--color-brand-400)]" : ""}
                />
              )}
              <Button variant="soft" size="md" icon={<NotebookPen className="h-3 w-3" strokeWidth={1.5} />} onClick={() => setShowStoryWriterLauncher(true)} className="shadow-[0_2px_8px_rgba(46,145,73,0.12)]">
                Story writer
              </Button>
              <Button variant="secondary" size="md" iconOnly icon={<Search className="h-3.5 w-3.5" strokeWidth={1.5} />} onClick={() => setSearchModalOpen(true)} title="Search tickets (⇧⌘K)" aria-label="Search tickets" />
              <div ref={headerMenuRef} className="relative">
                <Button
                  variant="ghost"
                  size="md"
                  iconOnly
                  icon={<MoreHorizontal size={14} strokeWidth={1.5} />}
                  onClick={() => setHeaderMenuOpen((v) => !v)}
                  title="More options"
                  aria-label="More options"
                  className={headerMenuOpen ? "border-border-strong bg-overlay-strong text-text-secondary" : ""}
                />
                {headerMenuOpen && (
                  <div className="absolute right-0 top-full z-30 mt-1.5 w-44 rounded-xl border border-border-strong bg-[var(--color-surface-floating)] py-1.5 shadow-[var(--shadow-lg)]">
                    <button
                      type="button"
                      onClick={() => { setAnalyticsVisible((v) => !v); setHeaderMenuOpen(false); }}
                      className={`flex w-full items-center gap-2.5 px-3 py-2 text-body-sm cursor-pointer transition-colors duration-150 ${
                        analyticsVisible
                          ? "text-[var(--color-brand-400)] bg-[var(--color-brand-500)]/[0.08]"
                          : "text-text-secondary hover:bg-hover-interactive hover:text-text-primary"
                      }`}
                    >
                      <BarChart2 size={13} strokeWidth={1.5} className="shrink-0" />
                      <span>Analytics</span>
                    </button>
                    {!isAllView && !f.activeView && (
                      <button
                        type="button"
                        onClick={() => {
                          const leftSprint = slotSprints[activeSlot] ?? slotSprints[0] ?? "";
                          const rightSprint = slotSprints.find((_, i) => i !== activeSlot) ?? slotSprints[1] ?? "";
                          router.push(`/sprint-board/compare?left=${encodeURIComponent(leftSprint)}&right=${encodeURIComponent(rightSprint)}`);
                          setHeaderMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary cursor-pointer hover:bg-hover-interactive hover:text-text-primary transition-colors duration-150"
                      >
                        <Columns2 size={13} strokeWidth={1.5} className="shrink-0" />
                        <span>Compare</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => { setSprintsModalOpen(true); setHeaderMenuOpen(false); }}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary cursor-pointer hover:bg-hover-interactive hover:text-text-primary transition-colors duration-150"
                    >
                      <List size={13} strokeWidth={1.5} className="shrink-0" />
                      <span>Sprints</span>
                    </button>
                    {!isAllView && !f.activeView && activeSprint && (
                      <button
                        type="button"
                        onClick={() => {
                          const team = activeSprint.name.match(/^([A-Z]+)[: ]/)?.[1] ?? "";
                          router.push(`/stakeholder?team=${team}&sprintId=${activeSprint.id}`);
                          setHeaderMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary cursor-pointer hover:bg-hover-interactive hover:text-text-primary transition-colors duration-150"
                      >
                        <Users size={13} strokeWidth={1.5} className="shrink-0" />
                        <span>Stakeholder View</span>
                      </button>
                    )}
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
            {!isAllView && !f.activeView && activeSprint ? (
              activeSprint.state === "backlog" ? (
                <span className="inline-flex items-center gap-1.5">
                  <Inbox className="h-4 w-4 text-text-muted" strokeWidth={1.5} />
                  {activeSprint.name}
                </span>
              ) : (
              <span className="relative inline-flex items-center">
                <button
                  type="button"
                  onClick={() => setDetailsPopoverOpen((v) => !v)}
                  className="cursor-pointer rounded-md px-1 -mx-1 transition-colors duration-100
                    hover:bg-overlay-default active:bg-overlay-strong"
                >
                  {activeSprint.name}
                </button>
                {activeSprint.state === "active" && (
                  <span className="relative ml-2 inline-flex h-2 w-2 shrink-0 translate-y-[-1px]">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-secondary-400)] opacity-40" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-secondary-400)]" />
                  </span>
                )}
                <SprintDetailsPopover
                  sprint={activeSprint}
                  open={detailsPopoverOpen}
                  onClose={() => setDetailsPopoverOpen(false)}
                  onEdit={() => setEditModalOpen(true)}
                  onSuggestGoal={async () => {
                    setDetailsPopoverOpen(false);
                    const ticketData = allTickets
                      .filter((t) => t.jiraStatus !== "DEPRECATED")
                      .map((t) => ({ key: t.key, summary: t.title, epic: t.epic ?? undefined, type: t.type, storyPoints: t.storyPoints ?? undefined }));
                    try {
                      const result = await workspaceTasks.create({
                        skillName: "suggest-sprint-goal",
                        args: { sprintId: activeSprint!.id, sprintName: activeSprint!.name, tickets: JSON.stringify(ticketData) },
                      });
                      const convId = (result as Record<string, unknown>).conversationId as string | undefined;
                      if (convId) {
                        try { localStorage.setItem(`sprint-goal-conv-${activeSprint!.id}`, convId); } catch { /* ok */ }
                        router.push(`/chat/${convId}`);
                      }
                    } catch {
                      showToast("Could not start suggestion. Is the workspace running?");
                    }
                  }}
                  goalSuggestionUrl={goalSuggestionUrl}
                />
              </span>
              )
            ) : (
              <>
                {isAllView ? "All tickets" : f.activeView ? f.activeView.title : "Sprint Board"}
              </>
            )}
          </ViewHeaderTitle>
          {!ticketsLoading && (isAllView || activeSprint || f.activeView) && (
              <>
                {/* Active sprint: unified completion bar replaces separate stats + bar */}
                {!isAllView && !f.activeView && activeSprint?.state === "active" ? (
                  <>
                    <ViewHeaderDivider />
                    <div
                      ref={completionBarRef}
                      role="button"
                      tabIndex={0}
                      onClick={() => setStatsPopoverOpen((v) => !v)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setStatsPopoverOpen((v) => !v); } }}
                      className="cursor-pointer"
                    >
                      <SprintCompletionBar
                        doneSp={statusStats["DONE"]?.sp ?? 0}
                        testSp={statusStats["TEST"]?.sp ?? 0}
                        inProgressSp={statusStats["IN PROGRESS"]?.sp ?? 0}
                        totalSp={totalPoints}
                        doneBv={statusStats["DONE"]?.bv ?? 0}
                        testBv={statusStats["TEST"]?.bv ?? 0}
                        inProgressBv={statusStats["IN PROGRESS"]?.bv ?? 0}
                        totalBv={bvTotal}
                        doneItems={doneCount}
                        testItems={testCount}
                        inProgressItems={inProgressCount}
                        totalItems={allTickets.length}
                        workingDaysRemaining={sprintWorkDays.remaining}
                        totalWorkingDays={sprintWorkDays.total}
                      />
                    </div>
                    {noPointsCount > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const next = new Set(f.gapsFilter);
                          if (next.has("no_points")) next.delete("no_points"); else next.add("no_points");
                          f.setGapsFilter(next);
                        }}
                        className={`flex items-center justify-center h-[18px] min-w-[18px] rounded cursor-pointer transition-[background-color,color,box-shadow] duration-150 ${
                          f.gapsFilter.has("no_points")
                            ? "bg-amber-400/15 text-amber-500 shadow-[0_0_0_1px_rgba(234,179,8,0.3)]"
                            : "text-amber-400/50 hover:text-amber-500 hover:bg-amber-400/8"
                        }`}
                        title={`${noPointsCount} without estimate`}
                      >
                        <AlertTriangle size={10} strokeWidth={2.5} />
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <ViewHeaderDivider />
                    <SprintStats
                      totalItems={f.hasActiveFilters ? tickets.length : allTickets.length}
                      totalSp={!isAllView && !f.activeView ? totalPoints : 0}
                      totalBv={!isAllView && !f.activeView ? bvTotal : 0}
                    />
                  </>
                )}
                {!isAllView && !f.activeView && activeSprint?.state !== "active" && (
                  <>
                    <ViewHeaderDivider />
                    <div className="flex items-center gap-1">
                      {(["TO DO", "IN PROGRESS", "TEST", "DONE"] as const).map((status) => {
                        const count = status === "TO DO" ? todoCount : status === "IN PROGRESS" ? inProgressCount : status === "TEST" ? testCount : doneCount;
                        if (count === 0 && status === "TEST") return null;
                        const active = f.statusFilter.has(status);
                        const dimmed = f.statusFilter.size > 0 && !active;
                        return (
                          <StatusCount
                            key={status}
                            colorKey={status}
                            label={status}
                            count={count}
                            active={active}
                            dimmed={dimmed}
                            onClick={() => {
                              const next = new Set(f.statusFilter);
                              if (active) next.delete(status); else next.add(status);
                              f.setStatusFilter(next);
                            }}
                          />
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={() => setStatsPopoverOpen(true)}
                      className="rounded-md p-1 text-text-muted cursor-pointer hover:text-text-secondary hover:bg-overlay-default active:bg-overlay-strong transition-colors duration-100"
                      title="Sprint statistics"
                    >
                      <BarChart2 size={13} strokeWidth={1.5} />
                    </button>
                  </>
                )}
              </>
            )}
            {statsPopoverOpen && (
              <SprintStatsPopover
                allTickets={allTickets}
                sprintId={activeSprintId}
                sprintName={activeSprint?.name}
                workingDaysRemaining={sprintWorkDays.remaining}
                totalWorkingDays={sprintWorkDays.total}
                onClose={() => setStatsPopoverOpen(false)}
                anchorRef={completionBarRef}
                onFilterStatus={(status) => {
                  f.resetFilters();
                  f.setStatusFilter(new Set([status]));
                }}
                onFilterType={(type) => {
                  f.resetFilters();
                  f.setIssueTypeFilter(new Set([type]));
                }}
                onFilterEpic={(epic) => {
                  f.resetFilters();
                  f.setEpicFilter(new Set([epic]));
                }}
              />
            )}
        </ViewHeader>

        {/* Sprint board body -- optionally wrapped in a parent DndContext for Jira rank DnD */}
        {dnd.jiraRankDndEnabled ? (
          <DndContext
            sensors={dnd.boardSensors}
            collisionDetection={boardCollisionDetection}
            onDragStart={dnd.handleBoardDragStart}
            onDragOver={dnd.handleBoardDragOver}
            onDragEnd={dnd.handleBoardDragEnd}
          >
            <div className="relative bg-[var(--color-surface-toolbar)]">
              <SprintSlots slotSprints={slotSprints} activeSlot={activeSlot} allActive={isAllView && !f.activeViewId} sprints={sprints} backlogCount={backlogCount} onSlotClick={setActiveSlot} onAllClick={handleAllClick} editingSlot={editingSlot} onSlotEdit={handleSlotEdit} onSprintSelect={handleSprintSelect} onEditClose={() => setEditingSlot(null)} syncing={syncing} onRefresh={handleRefresh} onReorderSlots={handleReorderSlots} ephemeralSprintId={ephemeralSprintId} ephemeralIsActive={ephemeralIsActive} onEphemeralClick={handleEphemeralClick} filtersCollapsed={barsCollapsed} activeFilterCount={activeFilterCount} onToggleFilters={() => setBarsCollapsed((v) => !v)} savedViews={f.savedViews} activeViewId={f.activeViewId} onViewClick={f.handleViewClick} sortField={f.sortField} sortDir={f.sortDir} onSortChange={sortChange} columnVisible={f.visibleColumns} columnOrder={columnOrder} onColumnToggle={toggleColumn} onColumnReorder={handleColumnReorder} onColumnReset={resetToDefaults} groupBy={groupBy} onGroupByChange={setGroupBy} onCreateSprint={() => setCreateSprintModalOpen(true)} />
              {dnd.boardActiveDragId && <SprintDropZoneBar sprints={sprints} slotSprints={slotSprints} activeSprintId={activeSprintId} />}
            </div>

            {!barsCollapsed && (
              <div className="border-b border-border-default bg-[var(--color-surface-toolbar)]">
                <FilterBar statusFilter={f.statusFilter} epicFilter={f.epicFilter} assigneeFilter={f.assigneeFilter} readinessFilter={f.readinessFilter} editStateFilter={f.editStateFilter} issueTypeFilter={f.issueTypeFilter} onStatusFilterChange={f.setStatusFilter} onEpicFilterChange={f.setEpicFilter} onAssigneeFilterChange={f.setAssigneeFilter} onReadinessFilterChange={f.setReadinessFilter} onEditStateFilterChange={f.setEditStateFilter} onIssueTypeFilterChange={f.setIssueTypeFilter} gapsFilter={f.gapsFilter} onGapsFilterChange={f.setGapsFilter} statusOptions={f.statusOptions} epicOptions={f.epicOptions} assigneeOptions={f.assigneeOptions} issueTypeOptions={f.issueTypeOptions} teamFilter={f.teamFilter} onTeamFilterChange={f.setTeamFilter} teamOptions={f.teamOptions} {... (isAllView ? { sprintFilter: f.sprintFilter, onSprintFilterChange: f.setSprintFilter, sprintOptions: f.sprintOptions, sprintNameMap } : {})} noBorder searchQuery={f.searchQuery} onSearchChange={f.setSearchQuery} onSaveView={f.handleSaveView} onDeleteView={f.activeViewId ? () => f.handleDeleteView(f.activeViewId!) : undefined} activeView={f.activeView} />
              </div>
            )}

            <div ref={contentScrollRef}>
              {!ticketsLoading && analyticsVisible && <SprintAnalytics tickets={allTickets} onClose={() => setAnalyticsVisible(false)} sprintId={activeSprintId} />}

              {ticketsLoading && <LoadingState variant="spinner" label="Loading tickets..." />}

              {!ticketsLoading && (
                <TicketTable tickets={tickets} checkedTickets={checkedTickets} selectedTicket={selectedTicket} focusedTicketIdx={focusedTicketIdx} someChecked={someChecked} allChecked={allChecked} visibleColumns={effectiveVisibleColumns} sprintNameMap={sprintNameMap} poStatuses={poStatuses} readinessMap={readinessMap} inflightKeys={inflightKeys} onToggleCheck={toggleCheck} onRangeCheck={handleRangeCheck} onToggleAll={toggleAll} onSelectTicket={setSelectedTicket} onPoStatusChange={handlePoStatusChange} onReadinessChange={handleReadinessChange} onBusinessValueChange={handleBusinessValueChange} onStoryPointsChange={handleStoryPointsChange} onJiraStatusChange={handleJiraStatusChange} onIssueTypeChange={handleIssueTypeChange} onTitleChange={handleTitleChange} onCloseSubtasks={handleCloseSubtasks} onTableKeyDown={handleTableKeyDown} sortField={f.sortField} sortDir={f.sortDir} onSortChange={sortChange} columnOrder={columnOrder} columnWidths={columnWidths} onColumnResize={setColumnWidth} onColumnResetWidth={resetColumnWidth} externalDnd externalActiveDragId={dnd.boardActiveDragId} dragOverKey={dnd.boardOverId} groups={groups} collapsedGroups={collapsedGroups} onToggleCollapse={toggleCollapse} groupBy={groupBy} scrollContainerRef={mainScrollRef} refinementSessionMap={ticketSessionMap} />
              )}
            </div>

            {someChecked && <BulkActionBar count={checkedTickets.size} totalCount={tickets.length} selectedPoints={tickets.filter((t) => checkedTickets.has(t.key)).reduce((s, t) => s + (t.storyPoints ?? 0), 0)} allChecked={allChecked} onToggleAll={toggleAll} onClear={() => setCheckedTickets(new Set())} onSetReadiness={handleBulkSetReadiness} onRefreshFromJira={handleBulkRefresh} onReviewStory={handleBulkReviewStory} onCopyToClipboard={handleCopyToClipboard} onExportForStakeholders={handleExportForStakeholders} isRefreshing={bulkRefreshing} isExporting={exportTask.isActive} onRefine={handleRefineSelected} />}

            <DragOverlay dropAnimation={null} modifiers={[snapToPointer]}>
              {dnd.boardActiveDragTicket && (() => {
                const isMulti = dnd.boardDraggedKeys.length > 1;
                const draggedTickets = isMulti
                  ? dnd.boardDraggedKeys.map((k) => tickets.find((t) => t.key === k)).filter(Boolean)
                  : [dnd.boardActiveDragTicket];
                return (
                  <div style={{ opacity: 0.92 }} className="inline-block w-max">
                    <div className="relative">
                      {isMulti && (
                        <>
                          <div className="absolute inset-0 translate-y-1.5 translate-x-1.5 rounded-lg border border-border-subtle bg-[var(--color-surface-elevated)]" style={{ opacity: 0.4 }} />
                          <div className="absolute inset-0 translate-y-[5px] translate-x-[5px] rounded-lg border border-border-subtle bg-[var(--color-surface-elevated)]" style={{ opacity: 0.2 }} />
                        </>
                      )}
                      <div className={`relative rounded-lg border bg-[var(--color-surface-elevated)] shadow-[var(--shadow-lg)] ${isMulti ? "border-[var(--color-brand-500)]/30" : "border-[var(--color-brand-500)]/20"}`}>
                        {isMulti && (
                          <div className="absolute -top-2.5 -right-2.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--color-brand-500)] px-1.5 text-[11px] font-semibold text-white shadow-sm">
                            {dnd.boardDraggedKeys.length}
                          </div>
                        )}
                        <div className="px-3 py-2 space-y-0.5">
                          {draggedTickets.slice(0, 5).map((t) => (
                            <div key={t!.key} className="flex items-center gap-2 text-body-lg">
                              <IssueTypeIcon type={t!.type} />
                              <span className="font-mono text-body-sm text-text-tertiary">{t!.key}</span>
                              <span className="max-w-52 truncate text-text-secondary">{t!.title}</span>
                            </div>
                          ))}
                          {draggedTickets.length > 5 && (
                            <div className="text-body-sm text-text-muted pl-0.5">
                              and {draggedTickets.length - 5} more...
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    {dnd.boardDragTargetSprintId && (
                      <div className="mt-1.5 rounded-md border border-[var(--color-brand-500)]/30 bg-[var(--color-surface-elevated)] px-2 py-1 text-label text-[var(--color-brand-300)]">
                        Move to {sprintNameMap[dnd.boardDragTargetSprintId] ?? dnd.boardDragTargetSprintId}
                      </div>
                    )}
                  </div>
                );
              })()}
            </DragOverlay>
          </DndContext>
        ) : (
          <>
            <div className="bg-[var(--color-surface-toolbar)]">
              <SprintSlots slotSprints={slotSprints} activeSlot={activeSlot} allActive={isAllView && !f.activeViewId} sprints={sprints} backlogCount={backlogCount} onSlotClick={setActiveSlot} onAllClick={handleAllClick} editingSlot={editingSlot} onSlotEdit={handleSlotEdit} onSprintSelect={handleSprintSelect} onEditClose={() => setEditingSlot(null)} syncing={syncing} onRefresh={handleRefresh} onReorderSlots={handleReorderSlots} ephemeralSprintId={ephemeralSprintId} ephemeralIsActive={ephemeralIsActive} onEphemeralClick={handleEphemeralClick} filtersCollapsed={barsCollapsed} activeFilterCount={activeFilterCount} onToggleFilters={() => setBarsCollapsed((v) => !v)} savedViews={f.savedViews} activeViewId={f.activeViewId} onViewClick={f.handleViewClick} sortField={f.sortField} sortDir={f.sortDir} onSortChange={sortChange} columnVisible={f.visibleColumns} columnOrder={columnOrder} onColumnToggle={toggleColumn} onColumnReorder={handleColumnReorder} onColumnReset={resetToDefaults} groupBy={groupBy} onGroupByChange={setGroupBy} onCreateSprint={() => setCreateSprintModalOpen(true)} />
            </div>

            {!barsCollapsed && (
              <div className="border-b border-border-default bg-[var(--color-surface-toolbar)]">
                <FilterBar statusFilter={f.statusFilter} epicFilter={f.epicFilter} assigneeFilter={f.assigneeFilter} readinessFilter={f.readinessFilter} editStateFilter={f.editStateFilter} issueTypeFilter={f.issueTypeFilter} onStatusFilterChange={f.setStatusFilter} onEpicFilterChange={f.setEpicFilter} onAssigneeFilterChange={f.setAssigneeFilter} onReadinessFilterChange={f.setReadinessFilter} onEditStateFilterChange={f.setEditStateFilter} onIssueTypeFilterChange={f.setIssueTypeFilter} gapsFilter={f.gapsFilter} onGapsFilterChange={f.setGapsFilter} statusOptions={f.statusOptions} epicOptions={f.epicOptions} assigneeOptions={f.assigneeOptions} issueTypeOptions={f.issueTypeOptions} teamFilter={f.teamFilter} onTeamFilterChange={f.setTeamFilter} teamOptions={f.teamOptions} {... (isAllView ? { sprintFilter: f.sprintFilter, onSprintFilterChange: f.setSprintFilter, sprintOptions: f.sprintOptions, sprintNameMap } : {})} noBorder searchQuery={f.searchQuery} onSearchChange={f.setSearchQuery} onSaveView={f.handleSaveView} onDeleteView={f.activeViewId ? () => f.handleDeleteView(f.activeViewId!) : undefined} activeView={f.activeView} />
              </div>
            )}

            <div ref={contentScrollRef}>
              {!ticketsLoading && analyticsVisible && <SprintAnalytics tickets={allTickets} onClose={() => setAnalyticsVisible(false)} sprintId={activeSprintId} />}

              {ticketsLoading && <LoadingState variant="spinner" label="Loading tickets..." />}

              {!ticketsLoading && <TicketTable tickets={tickets} checkedTickets={checkedTickets} selectedTicket={selectedTicket} focusedTicketIdx={focusedTicketIdx} someChecked={someChecked} allChecked={allChecked} visibleColumns={effectiveVisibleColumns} sprintNameMap={sprintNameMap} poStatuses={poStatuses} readinessMap={readinessMap} inflightKeys={inflightKeys} onToggleCheck={toggleCheck} onRangeCheck={handleRangeCheck} onToggleAll={toggleAll} onSelectTicket={setSelectedTicket} onPoStatusChange={handlePoStatusChange} onReadinessChange={handleReadinessChange} onBusinessValueChange={handleBusinessValueChange} onStoryPointsChange={handleStoryPointsChange} onJiraStatusChange={handleJiraStatusChange} onIssueTypeChange={handleIssueTypeChange} onTitleChange={handleTitleChange} onCloseSubtasks={handleCloseSubtasks} onTableKeyDown={handleTableKeyDown} onReorder={f.sortField === "rank" && !f.activeViewId ? handleReorder : undefined} sortField={f.sortField} sortDir={f.sortDir} onSortChange={sortChange} columnOrder={columnOrder} columnWidths={columnWidths} onColumnResize={setColumnWidth} onColumnResetWidth={resetColumnWidth} groups={groups} collapsedGroups={collapsedGroups} onToggleCollapse={toggleCollapse} groupBy={groupBy} scrollContainerRef={mainScrollRef} refinementSessionMap={ticketSessionMap} />}
            </div>

            {someChecked && <BulkActionBar count={checkedTickets.size} totalCount={tickets.length} selectedPoints={tickets.filter((t) => checkedTickets.has(t.key)).reduce((s, t) => s + (t.storyPoints ?? 0), 0)} allChecked={allChecked} onToggleAll={toggleAll} onClear={() => setCheckedTickets(new Set())} onSetReadiness={handleBulkSetReadiness} onRefreshFromJira={handleBulkRefresh} onReviewStory={handleBulkReviewStory} onCopyToClipboard={handleCopyToClipboard} onExportForStakeholders={handleExportForStakeholders} isRefreshing={bulkRefreshing} isExporting={exportTask.isActive} onRefine={handleRefineSelected} />}
          </>
        )}
      </div>

      {selected && (() => {
        const idx = tickets.findIndex((t) => t.key === selected.key);
        const adjacentKeys = { prev: idx > 0 ? tickets[idx - 1].key : null, next: idx < tickets.length - 1 ? tickets[idx + 1].key : null };
        return <SidePanel ticket={selected} poStatus={poStatuses[selected.key] ?? null} readiness={readinessMap[selected.key] ?? null} onPoStatusChange={(v) => handlePoStatusChange(selected.key, v)} onReadinessChange={(v) => handleReadinessChange(selected.key, v)} onNotesChange={(notes) => { saveTicketMetadata(selected.key, { poNotes: notes }, activeListKey); }} onClose={() => setSelectedTicket(null)} onShowToast={showToast} adjacentKeys={adjacentKeys} />;
      })()}

      {toast && (
        <div role="status" className="pointer-events-auto fixed right-6 bottom-6 z-50 flex items-center gap-2 rounded-lg border border-border-strong bg-[var(--color-surface-floating)] px-4 py-2.5 shadow-[var(--shadow-lg)]" style={{ animation: "fadeInUp 0.2s ease-out" }}>
          <Check className="h-4 w-4 shrink-0 text-[var(--color-brand-400)]" strokeWidth={1.5} />
          <span className="text-body-lg text-text-secondary">{toast}</span>
        </div>
      )}

      {exportTask.status === "completed" && exportTask.output && (
        <div
          role="alert"
          className="pointer-events-auto fixed right-6 bottom-16 z-50 flex flex-col gap-2 rounded-lg border border-[var(--color-brand-500)]/20 bg-[var(--color-surface-floating)]/95 px-4 py-3 shadow-[var(--shadow-lg)] backdrop-blur-sm max-w-sm"
          style={{ animation: "fadeInUp 0.2s ease-out" }}
        >
          <div className="flex items-start gap-2.5">
            <Check className="h-4 w-4 shrink-0 mt-0.5 text-[var(--color-brand-400)]" strokeWidth={2} />
            <div className="flex-1 min-w-0">
              <p className="text-body-sm font-medium text-text-primary">Stakeholder export ready</p>
            </div>
            <button
              type="button"
              onClick={exportTask.dismiss}
              className="shrink-0 text-text-muted hover:text-text-secondary cursor-pointer"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          </div>
          <div className="flex items-center gap-2 pl-6.5">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(exportTask.output!).then(() => {
                  showToast("Copied to clipboard");
                }).catch(() => {
                  showToast("Failed to copy");
                });
              }}
              className="flex items-center gap-1.5 rounded-md border border-[var(--color-brand-500)]/20 bg-[var(--color-brand-500)]/10 px-2.5 py-1 text-body-sm font-medium text-[var(--color-brand-300)] cursor-pointer hover:bg-[var(--color-brand-500)]/15 active:bg-[var(--color-brand-500)]/20"
            >
              <CopyIcon className="h-3 w-3" strokeWidth={2} />
              Copy to clipboard
            </button>
            <button
              type="button"
              onClick={() => {
                if (exportTask.conversationId) {
                  router.push(`/chat/${exportTask.conversationId}`);
                }
                exportTask.dismiss();
              }}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-body-sm text-text-tertiary cursor-pointer hover:text-text-secondary"
            >
              <ExternalLink className="h-3 w-3" strokeWidth={2} />
              View in chat
            </button>
          </div>
        </div>
      )}

      {exportTask.status === "failed" && exportTask.error && (
        <div
          role="alert"
          className="pointer-events-auto fixed right-6 bottom-16 z-50 flex items-start gap-2.5 rounded-lg border border-red-500/20 bg-[var(--color-surface-floating)]/95 px-4 py-3 shadow-[var(--shadow-lg)] backdrop-blur-sm max-w-sm"
          style={{ animation: "fadeInUp 0.2s ease-out" }}
        >
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" strokeWidth={2} />
          <div className="flex-1 min-w-0">
            <p className="text-body-sm font-medium text-text-primary">Export failed</p>
            <p className="text-label text-text-tertiary mt-0.5">{exportTask.error}</p>
          </div>
          <button
            type="button"
            onClick={exportTask.dismiss}
            className="shrink-0 text-text-muted hover:text-text-secondary cursor-pointer"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>
      )}
      <SearchModal open={searchModalOpen} initialQuery={f.searchQuery} onClose={() => setSearchModalOpen(false)} onSelectTicket={(key: string) => setSelectedTicket(key)} sprintNameMap={sprintNameMap} />
      <StoryWriterLauncherModal open={showStoryWriterLauncher} onClose={() => setShowStoryWriterLauncher(false)} />
      {editModalOpen && activeSprint && (
        <SprintEditModal
          sprint={activeSprint}
          tickets={allTickets}
          onClose={() => { setEditModalOpen(false); setAutoSuggest(false); }}
          showToast={showToast}
          autoSuggest={autoSuggest}
        />
      )}
      {createSprintModalOpen && (
        <CreateSprintModal
          onClose={() => setCreateSprintModalOpen(false)}
          onCreated={handleSprintCreated}
          showToast={showToast}
        />
      )}
      <AddToRefinementModal
        open={refineModalOpen}
        onClose={() => setRefineModalOpen(false)}
        ticketKeys={Array.from(checkedTickets)}
        onAdded={(id, name) => showToast(
          <span>
            Added to &ldquo;{name}&rdquo;
            {" "}
            <a
              href={`/refinement/${id}`}
              onClick={(e) => { e.preventDefault(); router.push(`/refinement/${id}`); }}
              className="font-medium text-[var(--color-brand-400)] underline underline-offset-2 hover:text-[var(--color-brand-300)]"
            >
              Open refinement
            </a>
          </span>,
          5000,
        )}
      />
    </div>
    </>
  );
}
