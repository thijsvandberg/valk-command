"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { Sprint } from "@/types/ticket";
import { SprintSlots } from "@/components/sprint-board/SprintSlots";
import { FilterBar } from "@/components/sprint-board/FilterBar";
import { TicketTable } from "@/components/sprint-board/TicketTable";
import { BulkActionBar } from "@/components/sprint-board/BulkActionBar";
import { CursorMenu, TicketActionMenuContent, type FlagState } from "@/components/sprint-board/ticket-action-menu";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { SidePanel } from "@/components/sprint-board/SidePanel";
import { SprintAnalytics } from "@/components/sprint-board/SprintAnalytics";
import dynamic from "next/dynamic";
const SearchModal = dynamic(() => import("@/components/sprint-board/SearchModal").then((m) => ({ default: m.SearchModal })), { ssr: false });
const StoryWriterLauncherModal = dynamic(() => import("@/components/shared/StoryWriterLauncherModal").then((m) => ({ default: m.StoryWriterLauncherModal })), { ssr: false });
const AddToRefinementModal = dynamic(() => import("@/components/refinement-session/AddToRefinementModal").then((m) => ({ default: m.AddToRefinementModal })), { ssr: false });
import { useJiraSprints, useTickets } from "@/hooks/useSprintBoard";
import { useTicketSessionMap } from "@/hooks/useTicketSessionMap";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useExportTask } from "@/hooks/useExportTask";
import { usePageTitle } from "@/hooks/usePageTitle";
import { mapJiraSprints, saveSprintSlots, saveTicketMetadata, bulkReviewStories, bulkGenerateSubtasks, computeSprintStats, computeSprintWorkDays } from "@/components/sprint-board/sprint-board-utils";
import { prefetchTicketList, setRouterPrefetch } from "@/lib/prefetch";
import { getJiraUrl } from "@/components/sprint-board/TicketTableCells";
import { apiFetch, jira } from "@/lib/api-client";
import { useSprintBoardFilters } from "@/components/sprint-board/useSprintBoardFilters";
import { useGroupBy } from "@/components/sprint-board/useGroupBy";
import { useSprintBoardDragDrop } from "@/components/sprint-board/useSprintBoardDragDrop";
import { useSprintBoardShortcuts } from "@/components/sprint-board/useSprintBoardShortcuts";
import { useTicketActions } from "@/components/sprint-board/useTicketActions";
import { SprintBoardHeader } from "@/components/sprint-board/SprintBoardHeader";
import { DragGhostOverlay } from "@/components/sprint-board/DragGhostOverlay";
import { SprintDropZoneBar, snapToPointer, boardCollisionDetection } from "@/components/sprint-board/SprintBoardDragDrop";
import { ExportToasts } from "@/components/sprint-board/ExportToasts";
import { Check, X, Loader2 } from "lucide-react";
import { DndContext, DragOverlay } from "@dnd-kit/core";
const SprintEditModal = dynamic(() => import("@/components/sprint-board/SprintEditModal").then((m) => ({ default: m.SprintEditModal })), { ssr: false });
const CreateSprintModal = dynamic(() => import("@/components/sprint-board/CreateSprintModal").then((m) => ({ default: m.CreateSprintModal })), { ssr: false });
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
  const slotSprintsSet = useMemo(() => new Set(slotSprints), [slotSprints]);
  const isAllView = searchParams.get("sprint") === "__all__";
  const activeSlot = useMemo(() => {
    const url = searchParams.get("sprint"); if (url === "__all__") return -1;
    if (url && slotSprints.length > 0) { const idx = slotSprints.indexOf(url); if (idx >= 0) return idx; }
    const ai = slotSprints.findIndex((id) => sprints.find((s) => s.id === id && s.state === "active")); return ai >= 0 ? ai : 0;
  }, [searchParams, slotSprints, sprints]);

  const [ephemeralSprintId, setEphemeralSprintId] = useState<string | null>(null);
  const ephemeralIsActive = !isAllView && ephemeralSprintId !== null && searchParams.get("sprint") === ephemeralSprintId;
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);
  const [checkedTickets, setCheckedTickets] = useState<Set<string>>(new Set());
  const [focusedTicketIdx, setFocusedTicketIdx] = useState<number>(-1);
  const [poPriorityMap, setPoPriorityMap] = useLocalStorage<Record<string, string[]>>("sprint-board-po-priority-map", {});
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [barsCollapsed, setBarsCollapsed] = useLocalStorage("sprint-bars-collapsed", false);
  const [analyticsVisible, setAnalyticsVisible] = useLocalStorage("sprint-analytics-visible", false);
  const [showStoryWriterLauncher, setShowStoryWriterLauncher] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [autoSuggest, setAutoSuggest] = useState(false);
  const [createSprintModalOpen, setCreateSprintModalOpen] = useState(false);
  const [bulkRefreshing, setBulkRefreshing] = useState(false);
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [refineModalOpen, setRefineModalOpen] = useState(false);
  const [refineKeys, setRefineKeys] = useState<string[] | null>(null);
  // Board-level right-click quick-actions menu (one instance, positioned at the cursor).
  const [rowMenu, setRowMenu] = useState<{ x: number; y: number; targets: Set<string> } | null>(null);
  const [flagDialog, setFlagDialog] = useState<{ targets: Set<string> } | null>(null);
  const [flagReason, setFlagReason] = useState("");
  const headerMenuRef = useRef<HTMLDivElement>(null);
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const mainScrollRef = useRef<HTMLElement>(null);
  const exportTask = useExportTask();
  const [toast, setToast] = useState<React.ReactNode | null>(null);
  const [toastLoading, setToastLoading] = useState(false);
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
    setPoPriorityMap((prev) => { if (order === null) { const n = { ...prev }; delete n[activeSprintId]; return n; } return { ...prev, [activeSprintId]: order }; });
  }, [activeSprintId, setPoPriorityMap]);

  const { data: apiTickets, isLoading: ticketsLoading, mutate: mutateTickets } = useTickets(activeSprintId || null);
  const allTickets = useMemo(() => apiTickets ?? [], [apiTickets]);
  const activeListKey = useMemo(() => {
    if (!activeSprintId) return null;
    return activeSprintId === "__all__" ? "/api/tickets" : `/api/tickets?sprintId=${encodeURIComponent(activeSprintId)}`;
  }, [activeSprintId]);

  const showToast = useCallback((message: React.ReactNode, durationMs = 3000, opts?: { loading?: boolean }) => {
    setToast(message);
    setToastLoading(opts?.loading ?? false);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    // durationMs <= 0 keeps the toast until manually dismissed.
    if (durationMs > 0) toastTimerRef.current = setTimeout(() => setToast(null), durationMs);
  }, []);
  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(null);
  }, []);

  // Ticket actions hook (must be before useSprintBoardFilters which needs readinessMap)
  const ta = useTicketActions({ apiTickets, mutateTickets, activeListKey, showToast });
  const { poStatuses, readinessMap, inflightKeys } = ta;

  const { widths: columnWidths, setColumnWidth, resetColumnWidth } = useColumnWidths();
  const { order: columnOrder, visible: columnVisible, setColumnOrder, toggleColumn, resetTo, resetToDefaults } = useColumnConfig();
  const f = useSprintBoardFilters(allTickets, readinessMap, isAllView, poPriorityOrder, columnVisible, columnOrder, resetTo, sprintNameMap);
  const tickets = f.sortedTickets;
  const activeFilterCount = useMemo(() =>
    [f.statusFilter, f.epicFilter, f.assigneeFilter, f.readinessFilter, f.editStateFilter, f.issueTypeFilter, f.gapsFilter, f.teamFilter].filter((s) => s.size > 0).length + (f.searchQuery ? 1 : 0),
  [f.statusFilter, f.epicFilter, f.assigneeFilter, f.readinessFilter, f.editStateFilter, f.issueTypeFilter, f.gapsFilter, f.teamFilter, f.searchQuery]);
  const { groupBy, setGroupBy, collapsedGroups, toggleCollapse, allCollapsed, toggleAllGroups, groups } = useGroupBy(tickets, sprints, sprintNameMap, isAllView);
  const effectiveVisibleColumns = useMemo(() => {
    if (!groupBy || groupBy === "none") return f.visibleColumns;
    const cols = new Set(f.visibleColumns); cols.delete(groupBy === "epic" ? "epic" : "sprint"); return cols;
  }, [f.visibleColumns, groupBy]);

  const activeSprint = isAllView ? null : sprints.find((s) => s.id === activeSprintId) ?? null;
  const stats = useMemo(() => computeSprintStats(allTickets), [allTickets]);
  const sprintWorkDays = useMemo(() => computeSprintWorkDays(activeSprint), [activeSprint]);
  const pageTitle = usePageTitle(isAllView ? "Sprint Board - All" : activeSprint ? `${activeSprint.name} - Sprint Board` : "Sprint Board");

  // Sync PO data from API
  useEffect(() => { if (apiTickets && apiTickets.length > 0) ta.syncFromApiTickets(apiTickets); }, [apiTickets, ta.syncFromApiTickets]);

  // Keyboard shortcuts
  const { handleTableKeyDown } = useSprintBoardShortcuts({
    tickets, focusedTicketIdx, setFocusedTicketIdx, setSelectedTicket,
    setSearchModalOpen, headerMenuRef, headerMenuOpen, setHeaderMenuOpen,
  });

  // DnD
  const dnd = useSprintBoardDragDrop({
    activeSprintId, isAllView, groupBy, checkedTickets, setCheckedTickets,
    tickets, apiTickets, mutateTickets, sprintNameMap, showToast,
    setPoPriorityOrder, sortField: f.sortField, activeViewId: f.activeViewId,
  });

  // Prefetch adjacent sprints
  useEffect(() => {
    if (isAllView || slotSprints.length === 0) return;
    const prevSlot = slotSprints[activeSlot - 1];
    const nextSlot = slotSprints[activeSlot + 1];
    if (prevSlot) prefetchTicketList(prevSlot);
    if (nextSlot) prefetchTicketList(nextSlot);
  }, [activeSlot, slotSprints, isAllView]);

  useEffect(() => { return () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }; }, []);
  useEffect(() => {
    const main = document.getElementById("main-content");
    if (main) (mainScrollRef as React.MutableRefObject<HTMLElement | null>).current = main;
  }, []);
  const selected = tickets.find((t) => t.key === selectedTicket);
  const allChecked = checkedTickets.size === tickets.length && tickets.length > 0;
  const someChecked = checkedTickets.size > 0;

  // Navigation handlers
  const navigateToSprint = useCallback((sprintId: string) => {
    f.resetFilters();
    if (f.activeViewId) { f.setSortField("rank"); f.setSortDir("asc"); resetToDefaults(); }
    const params = new URLSearchParams(searchParams.toString());
    params.set("sprint", sprintId); params.delete("view");
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [f, searchParams, router, resetToDefaults]);
  const setActiveSlot = useCallback((slot: number) => { const id = slotSprints[slot]; if (id) { setEphemeralSprintId(null); navigateToSprint(id); } }, [slotSprints, navigateToSprint]);
  const handleAllClick = useCallback(() => { setEphemeralSprintId(null); navigateToSprint("__all__"); }, [navigateToSprint]);
  const handleSprintListSelect = useCallback((id: string) => { setEphemeralSprintId(id); navigateToSprint(id); }, [navigateToSprint]);
  const handleEphemeralClick = useCallback(() => { if (ephemeralSprintId) navigateToSprint(ephemeralSprintId); }, [ephemeralSprintId, navigateToSprint]);
  const handleSlotEdit = useCallback((i: number) => { setEditingSlot((prev) => (prev === i ? null : i)); }, []);
  const handleSprintSelect = useCallback((id: string) => { if (editingSlot !== null) { setSlotSprints((prev) => { const next = [...prev]; next[editingSlot] = id; saveSprintSlots(next, sprints); return next; }); } }, [editingSlot, sprints]);
  const handleAddSlotWithSprint = useCallback((id: string) => {
    setSlotSprints((prev) => { if (prev.includes(id)) { const next = prev.filter((x) => x !== id); saveSprintSlots(next, sprints); return next; } if (prev.length >= 8) return prev; const next = [...prev, id]; saveSprintSlots(next, sprints); return next; });
  }, [sprints]);
  const handleSprintCreated = useCallback((id: string) => {
    setSlotSprints((prev) => { if (prev.length >= 8 || prev.includes(id)) return prev; const next = [...prev, id]; saveSprintSlots(next, sprints); return next; });
    navigateToSprint(id); setCreateSprintModalOpen(false);
  }, [sprints, navigateToSprint]);
  const handleReorderSlots = useCallback((activeId: string, overId: string) => {
    setSlotSprints((prev) => { const oi = prev.indexOf(activeId); const ni = prev.indexOf(overId); if (oi === -1 || ni === -1) return prev; const next = [...prev]; next.splice(oi, 1); next.splice(ni, 0, activeId); saveSprintSlots(next, sprints); return next; });
  }, [sprints]);

  // Selection handlers
  const toggleCheck = useCallback((key: string) => { setCheckedTickets((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; }); }, []);
  const toggleAll = useCallback(() => { setCheckedTickets(allChecked ? new Set() : new Set(tickets.map((t) => t.key))); }, [allChecked, tickets]);
  const handleRangeCheck = useCallback((keys: string[], checked: boolean) => { setCheckedTickets((prev) => { const next = new Set(prev); if (checked) keys.forEach((k) => next.add(k)); else keys.forEach((k) => next.delete(k)); return next; }); }, []);
  // Selection-aware: act on the whole selection when right-clicking a selected row,
  // otherwise act on just that row without disturbing the current selection.
  const handleRowContextMenu = useCallback((key: string, e: React.MouseEvent) => {
    const targets = checkedTickets.has(key) && checkedTickets.size > 0 ? new Set(checkedTickets) : new Set([key]);
    setRowMenu({ x: e.clientX, y: e.clientY, targets });
  }, [checkedTickets]);
  const handleReorder = useCallback((activeKey: string, overKey: string) => {
    const order = poPriorityOrder ?? tickets.map((t) => t.key); const oi = order.indexOf(activeKey); const ni = order.indexOf(overKey);
    if (oi === -1 || ni === -1) return; const next = [...order]; next.splice(oi, 1); next.splice(ni, 0, activeKey); setPoPriorityOrder(next);
  }, [poPriorityOrder, tickets, setPoPriorityOrder]);

  // Bulk actions. Each accepts an explicit target set (defaulting to the current
  // checkbox selection) so the same handlers serve both the toolbar and the
  // right-click row context menu.
  const handleBulkSetReadiness = useCallback(async (readiness: Parameters<typeof ta.handleBulkSetReadiness>[0], targets: Set<string> = checkedTickets) => { await ta.handleBulkSetReadiness(readiness, targets); }, [ta.handleBulkSetReadiness, checkedTickets]);
  const handleBulkRefresh = useCallback(async () => { setBulkRefreshing(true); try { await jira.syncTickets({ sprintId: slotSprints[activeSlot] }); showToast(`Refreshed ${checkedTickets.size} ticket${checkedTickets.size === 1 ? "" : "s"} from Jira`); } finally { setBulkRefreshing(false); } }, [slotSprints, activeSlot, checkedTickets.size, showToast]);
  const handleBulkReviewStory = useCallback(async (targets: Set<string> = checkedTickets) => { const keys = Array.from(targets); showToast(`Reviewing ${keys.length} ticket${keys.length === 1 ? "" : "s"}...`); await bulkReviewStories(keys); mutateTickets(); showToast(`Reviewed ${keys.length} ticket${keys.length === 1 ? "" : "s"}`); }, [checkedTickets, showToast, mutateTickets]);
  const handleCopyToClipboard = useCallback(() => { const sel = tickets.filter((t) => checkedTickets.has(t.key)); navigator.clipboard.writeText(sel.map((t) => `- ${t.title} - ${getJiraUrl(t.key)}`).join("\n")).then(() => showToast(`Copied ${sel.length} ticket${sel.length === 1 ? "" : "s"} to clipboard`)).catch(() => showToast("Failed to copy to clipboard")); }, [tickets, checkedTickets, showToast]);
  const handleExportForStakeholders = useCallback(async () => { const sel = tickets.filter((t) => checkedTickets.has(t.key)); if (!sel.length) return; await exportTask.startExport({ sprintName: activeSprint?.name ?? "Selected work", tickets: JSON.stringify(sel.map((t) => ({ key: t.key, summary: t.title, points: t.storyPoints ?? null, epic: t.epic ?? null }))) }); }, [tickets, checkedTickets, activeSprint, exportTask]);
  const openRefine = useCallback((keys: string[]) => { if (keys.length > 0) { setRefineKeys(keys); setRefineModalOpen(true); } }, []);
  const handleRefineSelected = useCallback(() => { openRefine(Array.from(checkedTickets)); }, [checkedTickets, openRefine]);
  const handleBulkSetStatus = useCallback(async (status: Parameters<typeof ta.handleBulkSetStatus>[0], targets: Set<string> = checkedTickets) => { await ta.handleBulkSetStatus(status, targets); }, [ta.handleBulkSetStatus, checkedTickets]);
  const handleBulkSetEpic = useCallback(async (epicKey: string | null, targets: Set<string> = checkedTickets) => { await ta.handleBulkSetEpic(epicKey, targets); }, [ta.handleBulkSetEpic, checkedTickets]);
  const handleBulkMoveSprint = useCallback(async (sprintId: string, targets: Set<string> = checkedTickets) => {
    const isBacklog = sprintId === "__backlog__";
    const dest = sprintNameMap[sprintId] ?? (isBacklog ? "backlog" : "sprint");
    const count = targets.size;
    // Immediate feedback: the move is a remote call and takes a moment.
    showToast(
      <span>Moving {count} ticket{count === 1 ? "" : "s"} to <span className="font-semibold text-text-primary">{dest}</span>&hellip;</span>,
      0,
      { loading: true },
    );
    const { ok } = await ta.handleBulkMoveSprint(sprintId, targets);
    if (!ok) { showToast("Failed to move tickets to sprint"); return; }
    showToast(
      <span>
        Moved {count} ticket{count === 1 ? "" : "s"} to{" "}
        <span className="font-semibold text-text-primary">{dest}</span>
        <span className="mx-2 text-text-muted" aria-hidden>&middot;</span>
        <a
          href="#"
          onClick={(e) => { e.preventDefault(); handleSprintListSelect(sprintId); dismissToast(); }}
          className="font-medium text-[var(--color-brand-400)] underline underline-offset-2 hover:text-[var(--color-brand-300)]"
        >
          {isBacklog ? "View in backlog" : "View on sprint board"}
        </a>
      </span>,
      0,
    );
  }, [ta.handleBulkMoveSprint, checkedTickets, sprintNameMap, handleSprintListSelect, showToast, dismissToast]);
  const handleBulkUpdateAssignee = useCallback(async (accountId: string | null, name: string | null, targets: Set<string> = checkedTickets) => { await ta.handleBulkUpdateAssignee(accountId, name, targets); }, [ta.handleBulkUpdateAssignee, checkedTickets]);
  const handleBulkUpdateLabels = useCallback(async (labels: string[], mode: "add" | "set", targets: Set<string> = checkedTickets) => { await ta.handleBulkUpdateLabels(labels, mode, targets); }, [ta.handleBulkUpdateLabels, checkedTickets]);
  const handleBulkGenerateSubtasks = useCallback(async (targets: Set<string> = checkedTickets) => { const keys = Array.from(targets); setBulkGenerating(true); showToast(`Generating subtasks for ${keys.length} ticket${keys.length === 1 ? "" : "s"}...`); try { const { succeeded, failed } = await bulkGenerateSubtasks(keys); if (failed > 0) { showToast(`Generated subtasks for ${succeeded} ticket${succeeded === 1 ? "" : "s"}, ${failed} failed`); } else { showToast(`Subtask suggestions sent for ${succeeded} ticket${succeeded === 1 ? "" : "s"}`); } mutateTickets(); } finally { setBulkGenerating(false); } }, [checkedTickets, showToast, mutateTickets]);
  // Flag: "Flag" opens a reason dialog (reason synced to Jira as a comment); "Remove flag" is immediate.
  const handleSetFlagged = useCallback((flagged: boolean, targets: Set<string> = checkedTickets) => {
    if (targets.size === 0) return;
    if (flagged) { setFlagReason(""); setFlagDialog({ targets }); }
    else { void ta.handleBulkSetFlagged(false, null, targets); }
  }, [ta.handleBulkSetFlagged, checkedTickets]);
  const computeFlagState = useCallback((keys: Set<string>): FlagState => {
    const sel = tickets.filter((t) => keys.has(t.key));
    if (sel.length === 0) return "mixed";
    const flaggedCount = sel.filter((t) => t.flagged).length;
    if (flaggedCount === 0) return "unflagged";
    if (flaggedCount === sel.length) return "flagged";
    return "mixed";
  }, [tickets]);
  const handleRefresh = useCallback(async () => { setSyncing(true); try { const data = await jira.syncTickets({ sprintId: slotSprints[activeSlot] }) as { count?: number } | null; showToast(`Refreshed ${data?.count ?? 0} ticket${(data?.count ?? 0) === 1 ? "" : "s"}`); mutateTickets(); } catch { showToast("Failed to refresh tickets"); } finally { setSyncing(false); } }, [slotSprints, activeSlot, showToast, mutateTickets]);
  const handleColumnReorder = useCallback((a: ColumnId, b: ColumnId) => { setColumnOrder((prev) => { const oi = prev.indexOf(a); const ni = prev.indexOf(b); if (oi === -1 || ni === -1) return prev; const next = [...prev]; next.splice(oi, 1); next.splice(ni, 0, a); return next; }); }, [setColumnOrder]);

  useEffect(() => {
    if (slotsInitialized.current || !sprintsData) return; slotsInitialized.current = true;
    const fallback = () => { const fb = sprints.find((s) => s.state === "active") ?? sprints[0]; if (fb) setSlotSprints([fb.id]); };
    apiFetch<{ slotIndex: number; sprintId: string }[]>("/api/sprint-slots").then((saved) => {
      const ids = new Set(sprints.map((s) => s.id));
      if (Array.isArray(saved) && saved.length > 0) { const loaded = saved.sort((a, b) => a.slotIndex - b.slotIndex).map((s) => s.sprintId).filter((id) => ids.has(id)); if (loaded.length > 0) { setSlotSprints(loaded); if (loaded.length !== saved.length) saveSprintSlots(loaded, sprints); return; } }
      fallback();
    }).catch(fallback);
  }, [sprintsData, sprints]);

  const sortChange = (fld: typeof f.sortField, d: typeof f.sortDir) => { f.setSortField(fld); f.setSortDir(d); };

  // Shared board content rendered once, conditionally wrapped in DndContext
  const boardContent = (
    <>
      <div className={`${dnd.jiraRankDndEnabled ? "relative " : ""}bg-[var(--color-surface-toolbar)]`}>
        <SprintSlots slotSprints={slotSprints} activeSlot={activeSlot} allActive={isAllView && !f.activeViewId} sprints={sprints} backlogCount={backlogCount} onSlotClick={setActiveSlot} onAllClick={handleAllClick} editingSlot={editingSlot} onSlotEdit={handleSlotEdit} onSprintSelect={handleSprintSelect} onEditClose={() => setEditingSlot(null)} syncing={syncing} onRefresh={handleRefresh} onReorderSlots={handleReorderSlots} ephemeralSprintId={ephemeralSprintId} ephemeralIsActive={ephemeralIsActive} onEphemeralClick={handleEphemeralClick} filtersCollapsed={barsCollapsed} activeFilterCount={activeFilterCount} onToggleFilters={() => setBarsCollapsed((v) => !v)} savedViews={f.savedViews} activeViewId={f.activeViewId} onViewClick={f.handleViewClick} sortField={f.sortField} sortDir={f.sortDir} onSortChange={sortChange} columnVisible={f.visibleColumns} columnOrder={columnOrder} onColumnToggle={toggleColumn} onColumnReorder={handleColumnReorder} onColumnReset={resetToDefaults} groupBy={groupBy} onGroupByChange={setGroupBy} onCreateSprint={() => setCreateSprintModalOpen(true)} groupCount={groups.length} allGroupsCollapsed={allCollapsed} onToggleCollapseAll={toggleAllGroups} />
        {dnd.jiraRankDndEnabled && dnd.boardActiveDragId && <SprintDropZoneBar sprints={sprints} slotSprints={slotSprints} activeSprintId={activeSprintId} />}
      </div>
      {!barsCollapsed && (
        <div className="border-b border-border-default bg-[var(--color-surface-toolbar)]">
          <FilterBar statusFilter={f.statusFilter} epicFilter={f.epicFilter} assigneeFilter={f.assigneeFilter} readinessFilter={f.readinessFilter} editStateFilter={f.editStateFilter} issueTypeFilter={f.issueTypeFilter} onStatusFilterChange={f.setStatusFilter} onEpicFilterChange={f.setEpicFilter} onAssigneeFilterChange={f.setAssigneeFilter} onReadinessFilterChange={f.setReadinessFilter} onEditStateFilterChange={f.setEditStateFilter} onIssueTypeFilterChange={f.setIssueTypeFilter} gapsFilter={f.gapsFilter} onGapsFilterChange={f.setGapsFilter} statusOptions={f.statusOptions} epicOptions={f.epicOptions} assigneeOptions={f.assigneeOptions} issueTypeOptions={f.issueTypeOptions} teamFilter={f.teamFilter} onTeamFilterChange={f.setTeamFilter} teamOptions={f.teamOptions} {... (isAllView ? { sprintFilter: f.sprintFilter, onSprintFilterChange: f.setSprintFilter, sprintOptions: f.sprintOptions, sprintNameMap } : {})} noBorder searchQuery={f.searchQuery} onSearchChange={f.setSearchQuery} onSaveView={f.handleSaveView} onDeleteView={f.activeViewId ? () => f.handleDeleteView(f.activeViewId!) : undefined} activeView={f.activeView} />
        </div>
      )}
      <div ref={contentScrollRef}>
        {!ticketsLoading && analyticsVisible && <SprintAnalytics tickets={allTickets} onClose={() => setAnalyticsVisible(false)} sprintId={activeSprintId} />}
        {ticketsLoading && <LoadingState variant="spinner" label="Loading tickets..." className="min-h-[200px]" />}
        {!ticketsLoading && (
          <TicketTable tickets={tickets} checkedTickets={checkedTickets} selectedTicket={selectedTicket} focusedTicketIdx={focusedTicketIdx} someChecked={someChecked} allChecked={allChecked} visibleColumns={effectiveVisibleColumns} sprintNameMap={sprintNameMap} poStatuses={poStatuses} readinessMap={readinessMap} inflightKeys={inflightKeys} onToggleCheck={toggleCheck} onRangeCheck={handleRangeCheck} onToggleAll={toggleAll} onSelectTicket={setSelectedTicket} onRowContextMenu={handleRowContextMenu} contextMenuKeys={rowMenu?.targets} onPoStatusChange={ta.handlePoStatusChange} onReadinessChange={ta.handleReadinessChange} onBusinessValueChange={ta.handleBusinessValueChange} onStoryPointsChange={ta.handleStoryPointsChange} onJiraStatusChange={ta.handleJiraStatusChange} onIssueTypeChange={ta.handleIssueTypeChange} onTitleChange={ta.handleTitleChange} onAssigneeChange={ta.handleAssigneeChange} onEpicChange={ta.handleEpicChange} onSprintChange={ta.handleSprintChange} sprints={sprints} onCloseSubtasks={ta.handleCloseSubtasks} onTableKeyDown={handleTableKeyDown} sortField={f.sortField} sortDir={f.sortDir} onSortChange={sortChange} columnOrder={columnOrder} columnWidths={columnWidths} onColumnResize={setColumnWidth} onColumnResetWidth={resetColumnWidth} groups={groups} collapsedGroups={collapsedGroups} onToggleCollapse={toggleCollapse} groupBy={groupBy} pinnedSprintIds={slotSprintsSet} onPinSprint={handleAddSlotWithSprint} scrollContainerRef={mainScrollRef} refinementSessionMap={ticketSessionMap} {...(dnd.jiraRankDndEnabled ? { externalDnd: true as const, externalActiveDragId: dnd.boardActiveDragId, dragOverKey: dnd.boardOverId } : { onReorder: f.sortField === "rank" && !f.activeViewId ? handleReorder : undefined })} />
        )}
      </div>
    </>
  );

  // Rendered full-width below both list and side panel so its actions never
  // overflow over the panel when the list column is narrowed.
  const bulkActionBar = someChecked && (() => {
    const sel = tickets.filter((t) => checkedTickets.has(t.key));
    return <BulkActionBar count={checkedTickets.size} totalCount={tickets.length} selectedPoints={sel.reduce((s, t) => s + (t.storyPoints ?? 0), 0)} selectedBV={sel.reduce((s, t) => s + (t.businessValue ?? 0), 0)} allChecked={allChecked} onToggleAll={toggleAll} onClear={() => setCheckedTickets(new Set())} onSetReadiness={handleBulkSetReadiness} onSetStatus={handleBulkSetStatus} onSetEpic={handleBulkSetEpic} onMoveSprint={handleBulkMoveSprint} onUpdateAssignee={handleBulkUpdateAssignee} onUpdateLabel={handleBulkUpdateLabels} onSetFlagged={(flagged) => handleSetFlagged(flagged)} flagState={computeFlagState(checkedTickets)} sprints={sprints} pinnedSprintIds={slotSprints} onRefreshFromJira={handleBulkRefresh} onReviewStory={handleBulkReviewStory} onCopyToClipboard={handleCopyToClipboard} onExportForStakeholders={handleExportForStakeholders} isRefreshing={bulkRefreshing} isExporting={exportTask.isActive} onGenerateSubtasks={handleBulkGenerateSubtasks} isGeneratingSubtasks={bulkGenerating} onRefine={handleRefineSelected} />;
  })();

  return (
    <>
      {pageTitle}
      <div className="flex min-h-0 flex-col">
      <div className="flex min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <SprintBoardHeader
          isAllView={isAllView} activeSprint={activeSprint} activeSprintId={activeSprintId}
          allTickets={allTickets} tickets={tickets} ticketsLoading={ticketsLoading}
          stats={stats} sprintWorkDays={sprintWorkDays} slotSprints={slotSprints} activeSlot={activeSlot}
          showToast={showToast} activeView={f.activeView} sortField={f.sortField} sortDir={f.sortDir}
          filters={{ statusFilter: f.statusFilter, setStatusFilter: f.setStatusFilter, gapsFilter: f.gapsFilter, setGapsFilter: f.setGapsFilter, hasActiveFilters: f.hasActiveFilters, resetFilters: f.resetFilters, setIssueTypeFilter: f.setIssueTypeFilter, setEpicFilter: f.setEpicFilter }}
          analyticsVisible={analyticsVisible} setAnalyticsVisible={setAnalyticsVisible}
          setShowStoryWriterLauncher={setShowStoryWriterLauncher} setSearchModalOpen={setSearchModalOpen}
          setEditModalOpen={setEditModalOpen} setCreateSprintModalOpen={setCreateSprintModalOpen}
          handleSprintListSelect={handleSprintListSelect} handleAddSlotWithSprint={handleAddSlotWithSprint}
        />

        {dnd.jiraRankDndEnabled ? (
          <DndContext sensors={dnd.boardSensors} collisionDetection={boardCollisionDetection} onDragStart={dnd.handleBoardDragStart} onDragOver={dnd.handleBoardDragOver} onDragEnd={dnd.handleBoardDragEnd}>
            {boardContent}
            <DragOverlay dropAnimation={null} modifiers={[snapToPointer]}>
              {dnd.boardActiveDragTicket && <DragGhostOverlay dragTicket={dnd.boardActiveDragTicket} draggedKeys={dnd.boardDraggedKeys} tickets={tickets} targetSprintId={dnd.boardDragTargetSprintId} sprintNameMap={sprintNameMap} />}
            </DragOverlay>
          </DndContext>
        ) : boardContent}
      </div>

      {selected && (() => {
        const idx = tickets.findIndex((t) => t.key === selected.key);
        const adjacentKeys = { prev: idx > 0 ? tickets[idx - 1].key : null, next: idx < tickets.length - 1 ? tickets[idx + 1].key : null };
        return <SidePanel key={selected.key} ticket={selected} poStatus={poStatuses[selected.key] ?? null} readiness={readinessMap[selected.key] ?? null} onPoStatusChange={(v) => ta.handlePoStatusChange(selected.key, v)} onReadinessChange={(v) => ta.handleReadinessChange(selected.key, v)} onNotesChange={(notes) => { saveTicketMetadata(selected.key, { poNotes: notes }, activeListKey); }} onClose={() => setSelectedTicket(null)} onShowToast={showToast} onMutate={mutateTickets} adjacentKeys={adjacentKeys} />;
      })()}
      </div>
      {bulkActionBar}

      {toast && (
        <div role="status" className="pointer-events-auto fixed right-6 bottom-6 z-50 flex items-center gap-2 rounded-lg border border-border-strong bg-[var(--color-surface-floating)] px-4 py-2.5 shadow-[var(--shadow-lg)]" style={{ animation: "fadeInUp 0.2s ease-out" }}>
          {toastLoading
            ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-text-tertiary" strokeWidth={1.5} />
            : <Check className="h-4 w-4 shrink-0 text-[var(--color-brand-400)]" strokeWidth={1.5} />}
          <span className="text-body-lg text-text-secondary">{toast}</span>
          {!toastLoading && (
            <button type="button" onClick={dismissToast} aria-label="Dismiss" className="ml-1 shrink-0 cursor-pointer text-text-muted hover:text-text-secondary"><X className="h-3.5 w-3.5" strokeWidth={2} /></button>
          )}
        </div>
      )}

      <ExportToasts status={exportTask.status} output={exportTask.output} error={exportTask.error} conversationId={exportTask.conversationId} dismiss={exportTask.dismiss} showToast={showToast} />

      <SearchModal open={searchModalOpen} initialQuery={f.searchQuery} onClose={() => setSearchModalOpen(false)} onSelectTicket={(key: string) => setSelectedTicket(key)} sprintNameMap={sprintNameMap} />
      <StoryWriterLauncherModal open={showStoryWriterLauncher} onClose={() => setShowStoryWriterLauncher(false)} />
      {editModalOpen && activeSprint && <SprintEditModal sprint={activeSprint} tickets={allTickets} onClose={() => { setEditModalOpen(false); setAutoSuggest(false); }} showToast={showToast} autoSuggest={autoSuggest} />}
      {createSprintModalOpen && <CreateSprintModal onClose={() => setCreateSprintModalOpen(false)} onCreated={handleSprintCreated} showToast={showToast} />}
      <AddToRefinementModal open={refineModalOpen} onClose={() => { setRefineModalOpen(false); setRefineKeys(null); }} ticketKeys={refineKeys ?? Array.from(checkedTickets)} onAdded={(id, name) => showToast(<span>Added to &ldquo;{name}&rdquo;{" "}<a href={`/refinement/${id}`} onClick={(e) => { e.preventDefault(); router.push(`/refinement/${id}`); }} className="font-medium text-[var(--color-brand-400)] underline underline-offset-2 hover:text-[var(--color-brand-300)]">Open refinement</a></span>, 5000)} />

      {rowMenu && (
        <CursorMenu x={rowMenu.x} y={rowMenu.y} onClose={() => setRowMenu(null)}>
          <TicketActionMenuContent
            header={rowMenu.targets.size === 1 ? [...rowMenu.targets][0] : `${rowMenu.targets.size} tickets`}
            onSetStatus={(s) => handleBulkSetStatus(s, rowMenu.targets)}
            onSetReadiness={(r) => handleBulkSetReadiness(r, rowMenu.targets)}
            onSetEpic={(epicKey) => handleBulkSetEpic(epicKey, rowMenu.targets)}
            onMoveSprint={(sprintId) => handleBulkMoveSprint(sprintId, rowMenu.targets)}
            onUpdateAssignee={(accountId, name) => handleBulkUpdateAssignee(accountId, name, rowMenu.targets)}
            onUpdateLabel={(labels, mode) => handleBulkUpdateLabels(labels, mode, rowMenu.targets)}
            onSetFlagged={(flagged) => handleSetFlagged(flagged, rowMenu.targets)}
            flagState={computeFlagState(rowMenu.targets)}
            onReviewStory={() => handleBulkReviewStory(rowMenu.targets)}
            onGenerateSubtasks={() => handleBulkGenerateSubtasks(rowMenu.targets)}
            onRefine={() => openRefine(Array.from(rowMenu.targets))}
            sprints={sprints}
            pinnedSprintIds={slotSprints}
            close={() => setRowMenu(null)}
          />
        </CursorMenu>
      )}

      <ConfirmDialog
        open={flagDialog !== null}
        onClose={() => { setFlagDialog(null); setFlagReason(""); }}
        title={flagDialog && flagDialog.targets.size > 1 ? `Flag ${flagDialog.targets.size} tickets` : "Flag this ticket"}
        description="Add an optional reason for flagging. This will be synced to Jira as a comment."
        confirmLabel="Flag"
        confirmVariant="destructive"
        onConfirm={() => { if (flagDialog) void ta.handleBulkSetFlagged(true, flagReason.trim() || null, flagDialog.targets); setFlagDialog(null); setFlagReason(""); }}
        extra={
          <textarea
            value={flagReason}
            onChange={(e) => setFlagReason(e.target.value)}
            placeholder="Reason (optional)..."
            rows={3}
            maxLength={2000}
            className="w-full resize-none rounded-lg border border-border-default bg-[var(--color-surface-base)] px-3 py-2 text-body-sm leading-relaxed text-text-primary placeholder:text-text-muted focus:border-[var(--color-brand-400)] focus:outline-none"
          />
        }
      />
    </div>
    </>
  );
}
