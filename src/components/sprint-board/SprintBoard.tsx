"use client";

import { useState, useRef, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { Inbox, Plus } from "lucide-react";
import { trailingDoneDepStart, interpolateRank } from "@/lib/sprint-insert-position";
import { GroupStatBar, type StatCriterion } from "@/components/sprint-board/GroupStatBar";
import { matchesWarningFilter } from "@/components/sprint-board/warning-filter";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import type { Sprint, Ticket, IssueType } from "@/types/ticket";
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
const AddToRefinementModal = dynamic(() => import("@/components/refinement-session/AddToRefinementModal").then((m) => ({ default: m.AddToRefinementModal })), { ssr: false });
import { useJiraSprints, useTickets, useTicketDetail } from "@/hooks/useSprintBoard";
import { useTicketSessionMap } from "@/hooks/useTicketSessionMap";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { usePencilCapacity } from "@/hooks/usePencilCapacity";
import { useExportTask } from "@/hooks/useExportTask";
import { usePageTitle } from "@/hooks/usePageTitle";
import { mapJiraSprints, saveSprintSlots, saveTicketMetadata, bulkReviewStories, bulkGenerateSubtasks, computeSprintStats, computeSprintWorkDays } from "@/components/sprint-board/sprint-board-utils";
import { sprintToSlug, slugToSprintId, buildBoardUrl, nextSprintName, latestRegularSprint, isBacklogSprintName, isOverallRefinementSprint } from "@/lib/sprint-utils";
import type { SavedView } from "@/components/sprint-board/filter-bar-types";
import { startDateFromPreviousEnd } from "@/lib/sprint-dates";
import { prefetchTicketList, setRouterPrefetch } from "@/lib/prefetch";
import { getJiraUrl } from "@/components/sprint-board/TicketTableCells";
import { apiFetch, jira, tickets as ticketsApi, refinementSessions as refinementSessionsApi } from "@/lib/api-client";
import { syncGroupInTranches, type GroupSyncTarget, type GroupSyncProgress } from "@/lib/group-sync";
import { useSprintBoardFilters } from "@/components/sprint-board/useSprintBoardFilters";
import { useGroupBy } from "@/components/sprint-board/useGroupBy";
import { useSprintBoardDragDrop } from "@/components/sprint-board/useSprintBoardDragDrop";
import { useSprintBoardShortcuts } from "@/components/sprint-board/useSprintBoardShortcuts";
import { useTicketActions } from "@/components/sprint-board/useTicketActions";
import { SprintBoardHeader } from "@/components/sprint-board/SprintBoardHeader";
import { DragGhostOverlay } from "@/components/sprint-board/DragGhostOverlay";
import { SprintDropZoneBar, snapToPointer, boardCollisionDetection } from "@/components/sprint-board/SprintBoardDragDrop";
import { ExportToasts } from "@/components/sprint-board/ExportToasts";
import { Toast } from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";
import { DndContext, DragOverlay } from "@dnd-kit/core";
const SprintEditModal = dynamic(() => import("@/components/sprint-board/SprintEditModal").then((m) => ({ default: m.SprintEditModal })), { ssr: false });
const CreateSprintModal = dynamic(() => import("@/components/sprint-board/CreateSprintModal").then((m) => ({ default: m.CreateSprintModal })), { ssr: false });
const SprintListModal = dynamic(() => import("@/components/sprint-board/SprintListModal").then((m) => ({ default: m.SprintListModal })), { ssr: false });
const FinishSprintModal = dynamic(() => import("@/components/sprint-board/FinishSprintModal").then((m) => ({ default: m.FinishSprintModal })), { ssr: false });
import { LoadingState } from "@/components/shared/LoadingState";
import { useColumnConfig } from "@/hooks/useColumnConfig";

export default function SprintBoard() {
  const { sprints: rawJiraSprints, backlogCount, data: sprintsData } = useJiraSprints();
  const sprints = useMemo(() => {
    const mapped = mapJiraSprints(rawJiraSprints);
    mapped.push({ id: "__backlog__", name: "Backlog", dateRange: "", state: "backlog", ticketCount: backlogCount, startDate: null, endDate: null, goal: null });
    return mapped;
  }, [rawJiraSprints, backlogCount]);
  const { ticketSessionMap, sessions: refinementSessionList, mutate: mutateRefinementSessions } = useTicketSessionMap();
  const searchParams = useSearchParams();
  const router = useRouter();
  setRouterPrefetch((url) => router.prefetch(url));

  // The board is path-based (BRDG-270): `/sprint-board/<sprint-slug>/<ticket>`.
  // The sprint slug and open ticket are read from the URL; the URL is the source
  // of truth for both, so refresh, deep-link, share and back/forward all work.
  // Derive the sprint slug and open ticket from the pathname rather than
  // useParams(): opening a ticket updates the URL via window.history.pushState
  // (see selectTicket) so the board does not remount, and usePathname() stays in
  // sync with pushState while useParams() does not (BRDG-270).
  const pathname = usePathname();
  const slugSegments = useMemo(() => {
    const prefix = "/sprint-board/";
    if (!pathname || !pathname.startsWith(prefix)) return [] as string[];
    return pathname.slice(prefix.length).split("/").filter(Boolean);
  }, [pathname]);
  const sprintSlug = slugSegments[0] ?? null;
  const ticketSlug = slugSegments[1] ? decodeURIComponent(slugSegments[1]) : null;
  const selectedTicket = ticketSlug;

  const [slotSprints, setSlotSprints] = useState<string[]>([]);
  const slotSprintsSet = useMemo(() => new Set(slotSprints), [slotSprints]);
  // Back-compat: existing deep links (ticket page, activity log, search) still
  // point at `/sprint-board?sprint=<id>`. When there is no path slug, fall back
  // to that legacy query so those links keep selecting the right sprint (BRDG-270).
  const urlSprintId = useMemo(
    () => slugToSprintId(sprintSlug, sprints) ?? searchParams.get("sprint"),
    [sprintSlug, sprints, searchParams],
  );
  const isAllView = urlSprintId === "__all__";
  const activeSlot = useMemo(() => {
    const url = urlSprintId; if (url === "__all__") return -1;
    if (url && slotSprints.length > 0) { const idx = slotSprints.indexOf(url); if (idx >= 0) return idx; }
    const ai = slotSprints.findIndex((id) => sprints.find((s) => s.id === id && s.state === "active")); return ai >= 0 ? ai : 0;
  }, [urlSprintId, slotSprints, sprints]);

  const [ephemeralSprintId, setEphemeralSprintId] = useState<string | null>(null);
  const ephemeralIsActive = !isAllView && ephemeralSprintId !== null && urlSprintId === ephemeralSprintId;

  // Views bar reorganisation (BRDG-319): backlog-named sprints are pulled out of the
  // numbered-pill row into the Backlogs dropdown, and "Overall refinement" becomes a
  // preset filter under the saved-views menu. Detection is by name (single source of
  // truth in sprint-utils); no per-sprint setting or schema change.
  const backlogSprints = useMemo(
    () => sprints.filter((s) => s.id === "__backlog__" || isBacklogSprintName(s.name)),
    [sprints],
  );
  // Pinned slots minus backlogs + Overall refinement; render/dnd only, persistence untouched.
  const pillSlotSprints = useMemo(
    () => slotSprints.filter((id) => {
      const s = sprints.find((x) => x.id === id);
      return s ? !isBacklogSprintName(s.name) && !isOverallRefinementSprint(s.name) : true;
    }),
    [slotSprints, sprints],
  );
  const overallRefinementSprint = useMemo(
    () => sprints.find((s) => isOverallRefinementSprint(s.name)) ?? null,
    [sprints],
  );
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const [checkedTickets, setCheckedTickets] = useState<Set<string>>(new Set());
  const [focusedTicketIdx, setFocusedTicketIdx] = useState<number>(-1);
  const [poPriorityMap, setPoPriorityMap] = useLocalStorage<Record<string, string[]>>("sprint-board-po-priority-map", {});
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [barsCollapsed, setBarsCollapsed] = useLocalStorage("sprint-bars-collapsed", false);
  const [analyticsVisible, setAnalyticsVisible] = useLocalStorage("sprint-analytics-visible", false);
  // Forward-planning mode (BRDG-303): per-view toggle that reveals pencil capacity,
  // the fullness meter and guestimation pickers. Off by default; persisted per view.
  const [planningVisible, setPlanningVisible] = useLocalStorage("sprint-board-planning-visible", false);
  // Pencil capacity is fetched only while planning mode is on, so the board makes no
  // extra request in the default (planning-off) state.
  const { capacityMap: pencilCapacityMap, setCapacity: setPencilCapacity } = usePencilCapacity(planningVisible);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [autoSuggest, setAutoSuggest] = useState(false);
  const [createSprintModalOpen, setCreateSprintModalOpen] = useState(false);
  // Sprint overview opened from the views bar's overflow menu (BRDG-319); the header
  // keeps its own entry, so this is a separate instance with its own open state.
  const [barSprintListOpen, setBarSprintListOpen] = useState(false);
  // Editable defaults for the Create Sprint modal, derived from the regular series (BRDG-305).
  const latestRegular = useMemo(() => latestRegularSprint(sprints), [sprints]);
  const suggestedSprintName = useMemo(() => nextSprintName(sprints), [sprints]);
  const suggestedSprintStartDate = useMemo(
    () => startDateFromPreviousEnd(latestRegular?.sprint.endDate),
    [latestRegular],
  );
  const [finishModalOpen, setFinishModalOpen] = useState(false);
  const [finishEarlyClose, setFinishEarlyClose] = useState(false);
  // In the All view there is no single active sprint, so the edit/finish modals target a
  // sprint chosen from a group row's "..." menu. Null falls back to the active sprint.
  const [editSprintId, setEditSprintId] = useState<string | null>(null);
  const [finishSprintId, setFinishSprintId] = useState<string | null>(null);
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
  const exportTask = useExportTask();
  const { toast, toastLoading, showToast, dismissToast } = useToast();
  const slotsInitialized = useRef(false);

  const activeSprintId = (isAllView || searchParams.get("view")) ? "__all__" : ephemeralIsActive ? ephemeralSprintId! : slotSprints[activeSlot];

  // The currently-open backlog (if any), so the Backlogs dropdown trigger can reflect it.
  const activeBacklog = useMemo(
    () => (isAllView ? null : backlogSprints.find((s) => s.id === activeSprintId) ?? null),
    [isAllView, activeSprintId, backlogSprints],
  );

  // Open/close the side panel by writing the ticket to the URL path. We use
  // window.history.pushState rather than router.push: router.push triggers a Next
  // route navigation that remounts the whole board, wiping the checkbox selection
  // and visibly re-rendering the list on every ticket click. pushState updates the
  // URL (deep-link, refresh and back/forward still work) and usePathname() syncs
  // with it, so the panel opens/switches without a remount (BRDG-270).
  const selectTicket = useCallback((key: string | null) => {
    const slug = activeSprintId ? sprintToSlug(activeSprintId, sprints) : sprintSlug;
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("sprint"); // legacy param now lives in the path
    window.history.pushState(null, "", buildBoardUrl(slug, key, sp.toString()));
  }, [activeSprintId, sprints, sprintSlug, searchParams]);
  // Drop-in for the former useState setter so existing call sites keep working,
  // including the functional-update form used by the keyboard shortcuts.
  const setSelectedTicket = useCallback((action: React.SetStateAction<string | null>) => {
    const next = typeof action === "function" ? action(selectedTicket) : action;
    selectTicket(next);
  }, [selectedTicket, selectTicket]);

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

  // Sprint id -> display name. The cached sprint list omits older closed sprints,
  // so fall back to the per-ticket name resolved from the sprint_name_cache; this
  // keeps group headers and row labels from showing raw numeric sprint ids (BRDG-239).
  const sprintNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    allTickets.forEach((t) => { if (t.sprintId && t.sprintDisplayName) map[t.sprintId] = t.sprintDisplayName; });
    sprints.forEach((s) => { map[s.id] = s.name; });
    return map;
  }, [sprints, allTickets]);

  // Sprint id -> state, for the sprint-state quick filters (BRDG-259).
  const sprintStateMap = useMemo(() => {
    const map: Record<string, string> = {};
    sprints.forEach((s) => { map[s.id] = s.state; });
    return map;
  }, [sprints]);

  // Ticket actions hook (must be before useSprintBoardFilters which needs readinessMap)
  const ta = useTicketActions({ apiTickets, mutateTickets, activeListKey, showToast });
  const { poStatuses, readinessMap, inflightKeys } = ta;
  // Stable useCallback refs from the actions hook, aliased so the local bulk
  // wrappers below can depend on them directly. Depending on `ta` itself would
  // re-run those hooks every render, since `ta` is a fresh object each time.
  const {
    syncFromApiTickets,
    handleBulkSetReadiness: taBulkSetReadiness,
    handleBulkSetStatus: taBulkSetStatus,
    handleBulkSetEpic: taBulkSetEpic,
    handleBulkMoveSprint: taBulkMoveSprint,
    handleBulkUpdateAssignee: taBulkUpdateAssignee,
    handleBulkUpdateLabels: taBulkUpdateLabels,
    handleBulkSetFlagged: taBulkSetFlagged,
  } = ta;

  const { visible: columnVisible, toggleColumn, applyVisible, resetToDefaults } = useColumnConfig();
  const f = useSprintBoardFilters(allTickets, readinessMap, isAllView, poPriorityOrder, columnVisible, applyVisible, sprintNameMap, sprintStateMap);
  // Surface "Overall refinement" as a built-in preset filter (sprint-scoped) in the
  // saved-views menu rather than as a sprint pill. Synthetic, never persisted/deleted.
  const presetViews = useMemo<SavedView[]>(() => {
    if (!overallRefinementSprint) return f.savedViews;
    const preset: SavedView = {
      id: "__preset:overall-refinement__",
      title: "Overall refinement",
      filters: { status: [], epic: [], assignee: [], readiness: [], editState: [], sprint: [overallRefinementSprint.id] },
      sort: { field: "rank", direction: "asc" },
    };
    return [preset, ...f.savedViews];
  }, [overallRefinementSprint, f.savedViews]);
  const tickets = f.sortedTickets;
  const activeFilterCount = useMemo(() =>
    [f.statusFilter, f.epicFilter, f.assigneeFilter, f.readinessFilter, f.editStateFilter, f.issueTypeFilter, f.gapsFilter, f.teamFilter].filter((s) => s.size > 0).length + (f.searchQuery ? 1 : 0),
  [f.statusFilter, f.epicFilter, f.assigneeFilter, f.readinessFilter, f.editStateFilter, f.issueTypeFilter, f.gapsFilter, f.teamFilter, f.searchQuery]);
  const { groupBy, setGroupBy, collapsedGroups, toggleCollapse, allCollapsed, toggleAllGroups, groups } = useGroupBy(tickets, sprints, sprintNameMap, isAllView, slotSprints, f.includeClosedSprints, f.forceShowSprintIds);
  // When grouping by epic, the epic chip is redundant on every row (the group header
  // already names it), so suppress it. Other groupings keep the chip (BRDG-239).
  const hideEpicChip = groupBy === "epic";
  // Show the sprint name per row only when several sprints can be visible at once
  // (All view or a saved view) and they aren't already grouped by sprint (BRDG-239).
  const showSprintOnRow = (isAllView || !!f.activeViewId) && groupBy !== "sprint";

  const activeSprint = isAllView ? null : sprints.find((s) => s.id === activeSprintId) ?? null;

  // Warning filter mode (BRDG-313): a transient lens over the flat single-sprint view.
  // It never mutates the persistent filters, so toggling it off restores the prior view
  // exactly. The header (singleSprintHeader) only renders in this flat view, so the lens
  // can only be toggled there; the grouped view drives its own per-group warning narrowing.
  const [warningLensActive, setWarningLensActive] = useState(false);
  const isFlatView = groups.length === 0 && !isAllView && !f.activeViewId;
  // Only the unpointed problem depends on the sprint being active (others always apply).
  const flatIsActiveSprint = activeSprintId !== "__backlog__" && activeSprint?.state === "active";
  const displayTickets = useMemo(
    () => (isFlatView && warningLensActive ? tickets.filter((t) => matchesWarningFilter(t, !!flatIsActiveSprint)) : tickets),
    [isFlatView, warningLensActive, tickets, flatIsActiveSprint],
  );
  // A change to any persistent filter, the search query, or the active view/sprint exits the
  // lens so it never narrows onto a stale set (req 3). Same signature feeds the grouped view.
  const { currentFiltersSnapshot, searchQuery: fSearchQuery, activeViewId } = f;
  const filterSignature = useMemo(
    () => `${JSON.stringify(currentFiltersSnapshot())}|${fSearchQuery}|${activeSprintId}|${isAllView}|${activeViewId ?? ""}`,
    [currentFiltersSnapshot, fSearchQuery, activeSprintId, isAllView, activeViewId],
  );
  useEffect(() => {
    setWarningLensActive(false);
  }, [filterSignature]);

  // Modal targets: an explicit group-row choice (All view) takes precedence over the active sprint.
  // In the All view allTickets spans every sprint, so narrow to the target sprint's tickets.
  const editSprint = editSprintId ? sprints.find((s) => s.id === editSprintId) ?? null : activeSprint;
  const finishSprint = finishSprintId ? sprints.find((s) => s.id === finishSprintId) ?? null : activeSprint;
  // Membership match: a multi-sprint ticket counts towards every sprint it belongs to.
  const inSprint = (t: Ticket, id: string) => (t.sprintIds && t.sprintIds.length > 0 ? t.sprintIds.includes(id) : t.sprintId === id);
  const editSprintTickets = editSprintId ? allTickets.filter((t) => inSprint(t, editSprintId)) : allTickets;
  const finishSprintTickets = finishSprintId ? allTickets.filter((t) => inSprint(t, finishSprintId)) : allTickets;
  const stats = useMemo(() => computeSprintStats(allTickets), [allTickets]);
  const sprintWorkDays = useMemo(() => computeSprintWorkDays(activeSprint), [activeSprint]);
  const pageTitle = usePageTitle(isAllView ? "Sprint Board - All" : activeSprint ? `${activeSprint.name} - Sprint Board` : "Sprint Board");

  // The flat (ungrouped) list creates into one concrete target: the open sprint, or
  // the backlog. Suppressed for the All view and saved views, where the flat list spans
  // multiple sprints (those create per group instead), and for closed sprints Jira rejects.
  const flatCreateTarget = useMemo((): { sprintId: string | null } | undefined => {
    if (isAllView || activeSprintId === "__all__" || f.activeViewId) return undefined;
    if (activeSprintId === "__backlog__") return { sprintId: null };
    if (activeSprint && activeSprint.state !== "closed") return { sprintId: activeSprintId };
    return undefined;
  }, [isAllView, activeSprintId, f.activeViewId, activeSprint]);

  // The single-sprint create row is hidden until the header "+" opens it (BRDG-315), mirroring
  // the per-group "+" on the grouped/All view. Close it when the create target disappears (e.g.
  // switching to a closed sprint or the All view) so it never lingers on a list that cannot create.
  const [flatComposerOpen, setFlatComposerOpen] = useState(false);
  useEffect(() => { if (!flatCreateTarget) setFlatComposerOpen(false); }, [flatCreateTarget]);
  const closeFlatComposer = useCallback(() => setFlatComposerOpen(false), []);

  // Optimistically add the new ticket to the active list, then reconcile with the
  // created Jira key. Caches are patched client-side rather than via the POST route's
  // cache.invalidate, which is unreliable across routes in next dev (see [[project_turbopack_cache_invalidate]]).
  const handleCreateTicket = useCallback((sprintId: string | null, title: string, jiraType: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const placeholderKey = `pending-${Date.now()}`;
    // Land the new ticket at the bottom of its sprint but above the trailing done/deprecated block,
    // and have it appear there instantly with no resort/jump: pick a jiraRank between the two
    // neighbours at the insertion point so the rank sort keeps it in place (BRDG-315).
    const sprintTickets = displayTickets.filter((t) =>
      sprintId === null ? t.sprintId == null : t.sprintId === sprintId,
    );
    const insertIdx = trailingDoneDepStart(sprintTickets);
    const placeholderRank = interpolateRank(
      sprintTickets[insertIdx - 1]?.jiraRank,
      sprintTickets[insertIdx]?.jiraRank,
    );
    const placeholder: Ticket = {
      key: placeholderKey,
      title: trimmed,
      type: jiraType.toLowerCase() as IssueType,
      epic: null,
      epicKey: null,
      jiraStatus: "TO DO",
      storyPoints: null,
      assignee: null,
      reporter: null,
      flagged: false,
      readiness: "drafting",
      poStatus: null,
      qualityScore: null,
      businessValue: null,
      editState: "clean",
      notes: "",
      jiraRank: placeholderRank,
      sprintId: sprintId ?? undefined,
      sprintDisplayName: null,
      jiraUpdatedAt: null,
      removedFromJiraAt: null,
      openSubtaskCount: 0,
      totalSubtaskCount: 0,
    };
    mutateTickets((data) => [...(data ?? []), placeholder], { revalidate: false });
    ticketsApi
      .createTicket({ title: trimmed, issueType: jiraType, ...(sprintId ? { sprintId } : {}) })
      .then((created) => {
        mutateTickets(
          (data) => data?.map((t) => (t.key === placeholderKey ? { ...placeholder, key: created.key } : t)),
          { revalidate: false },
        );
        showToast(`${created.key} created`);
      })
      .catch(() => {
        mutateTickets((data) => data?.filter((t) => t.key !== placeholderKey), { revalidate: false });
        showToast("Failed to create story");
      });
  }, [mutateTickets, showToast, displayTickets]);

  // Sync PO data from API
  useEffect(() => { if (apiTickets && apiTickets.length > 0) syncFromApiTickets(apiTickets); }, [apiTickets, syncFromApiTickets]);

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

  const selected = tickets.find((t) => t.key === selectedTicket);
  // Deep-link fallback (BRDG-270): a ticket in the URL that is not in the loaded
  // view (e.g. a different sprint) still opens the panel by fetching it directly.
  const fallbackTicket = useTicketDetail(selectedTicket && !selected ? selectedTicket : null);
  // Gate on selectedTicket: SWR's global keepPreviousData retains the fallback's
  // last detail after its key goes null, so without this the panel would stay open
  // for a fallback-opened ticket (e.g. an epic) after closing (BRDG-131).
  const panelTicket = selectedTicket ? (selected ?? fallbackTicket.data ?? null) : null;
  const allChecked = checkedTickets.size === tickets.length && tickets.length > 0;
  const someChecked = checkedTickets.size > 0;

  // Navigation handlers
  const navigateToSprint = useCallback((sprintId: string) => {
    // Clear only the sprint working set; the All view keeps its remembered filters so returning
    // to All restores the PO's last team/sprint selection (BRDG-281).
    f.resetSprintViewFilters();
    if (f.activeViewId) { f.setSortField("rank"); f.setSortDir("asc"); resetToDefaults(); }
    // Switching sprint replaces the path (no history entry) and drops any open
    // ticket and saved view (BRDG-270).
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("view");
    sp.delete("sprint"); // legacy param now lives in the path
    const slug = sprintToSlug(sprintId, sprints);
    router.replace(buildBoardUrl(slug, null, sp.toString()), { scroll: false });
  }, [f, searchParams, router, resetToDefaults, sprints]);
  const setActiveSlot = useCallback((slot: number) => { const id = slotSprints[slot]; if (id) { setEphemeralSprintId(null); navigateToSprint(id); } }, [slotSprints, navigateToSprint]);
  const handleAllClick = useCallback(() => { setEphemeralSprintId(null); navigateToSprint("__all__"); }, [navigateToSprint]);
  const handleSprintListSelect = useCallback((id: string) => { setEphemeralSprintId(id); navigateToSprint(id); }, [navigateToSprint]);
  const handleEphemeralClick = useCallback(() => { if (ephemeralSprintId) navigateToSprint(ephemeralSprintId); }, [ephemeralSprintId, navigateToSprint]);
  const handleSlotEdit = useCallback((i: number) => { setEditingSlot((prev) => (prev === i ? null : i)); }, []);
  const handleSprintSelect = useCallback((id: string) => { if (editingSlot !== null) { setSlotSprints((prev) => { const next = [...prev]; next[editingSlot] = id; saveSprintSlots(next, sprints); return next; }); } }, [editingSlot, sprints]);
  const handleAddSlotWithSprint = useCallback((id: string) => {
    setSlotSprints((prev) => { if (prev.includes(id)) { const next = prev.filter((x) => x !== id); saveSprintSlots(next, sprints); return next; } if (prev.length >= 8) return prev; const next = [...prev, id]; saveSprintSlots(next, sprints); return next; });
  }, [sprints]);
  const handleSprintCreated = useCallback((sprint: { id: number }) => {
    const id = String(sprint.id);
    setSlotSprints((prev) => { if (prev.length >= 8 || prev.includes(id)) return prev; const next = [...prev, id]; saveSprintSlots(next, sprints); return next; });
    navigateToSprint(id); setCreateSprintModalOpen(false);
  }, [sprints, navigateToSprint]);
  const openFinishModal = useCallback((early: boolean) => { setFinishEarlyClose(early); setFinishModalOpen(true); }, []);
  // Edit goal/dates or close a sprint from a group row's "..." menu in the All view.
  const handleEditSprintFromGroup = useCallback((sprintId: string) => {
    setEditSprintId(sprintId);
    setEditModalOpen(true);
  }, []);
  const handleCloseSprintFromGroup = useCallback((sprintId: string) => {
    const target = sprints.find((s) => s.id === sprintId) ?? null;
    const workDays = computeSprintWorkDays(target);
    const endReached = workDays.remaining !== null && workDays.remaining <= 0;
    setFinishSprintId(sprintId);
    setFinishEarlyClose(!endReached);
    setFinishModalOpen(true);
  }, [sprints]);
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
    // Clear the previously selected row so only the context-menu target stays
    // highlighted, but keep the side panel open when right-clicking the row
    // that is already active.
    if (key !== selectedTicket) setSelectedTicket(null);
    setRowMenu({ x: e.clientX, y: e.clientY, targets });
  }, [checkedTickets, selectedTicket, setSelectedTicket]);
  const handleReorder = useCallback((activeKey: string, overKey: string) => {
    const order = poPriorityOrder ?? tickets.map((t) => t.key); const oi = order.indexOf(activeKey); const ni = order.indexOf(overKey);
    if (oi === -1 || ni === -1) return; const next = [...order]; next.splice(oi, 1); next.splice(ni, 0, activeKey); setPoPriorityOrder(next);
  }, [poPriorityOrder, tickets, setPoPriorityOrder]);

  // Bulk actions. Each accepts an explicit target set (defaulting to the current
  // checkbox selection) so the same handlers serve both the toolbar and the
  // right-click row context menu.
  const handleBulkSetReadiness = useCallback(async (readiness: Parameters<typeof taBulkSetReadiness>[0], targets: Set<string> = checkedTickets) => { await taBulkSetReadiness(readiness, targets); }, [taBulkSetReadiness, checkedTickets]);
  const handleBulkRefresh = useCallback(async () => { setBulkRefreshing(true); try { await jira.syncTickets({ sprintId: slotSprints[activeSlot] }); showToast(`Refreshed ${checkedTickets.size} ticket${checkedTickets.size === 1 ? "" : "s"} from Jira`); } finally { setBulkRefreshing(false); } }, [slotSprints, activeSlot, checkedTickets.size, showToast]);
  const handleBulkReviewStory = useCallback(async (targets: Set<string> = checkedTickets) => { const keys = Array.from(targets); showToast(`Reviewing ${keys.length} ticket${keys.length === 1 ? "" : "s"}...`); await bulkReviewStories(keys); mutateTickets(); showToast(`Reviewed ${keys.length} ticket${keys.length === 1 ? "" : "s"}`); }, [checkedTickets, showToast, mutateTickets]);
  const handleCopyToClipboard = useCallback(() => { const sel = tickets.filter((t) => checkedTickets.has(t.key)); navigator.clipboard.writeText(sel.map((t) => `${t.title} - ${getJiraUrl(t.key)}`).join("\n")).then(() => showToast(`Copied ${sel.length} ticket${sel.length === 1 ? "" : "s"} to clipboard`)).catch(() => showToast("Failed to copy to clipboard")); }, [tickets, checkedTickets, showToast]);
  const handleExportForStakeholders = useCallback(async () => { const sel = tickets.filter((t) => checkedTickets.has(t.key)); if (!sel.length) return; await exportTask.startExport({ sprintName: activeSprint?.name ?? "Selected work", tickets: JSON.stringify(sel.map((t) => ({ key: t.key, summary: t.title, points: t.storyPoints ?? null, epic: t.epic ?? null }))) }); }, [tickets, checkedTickets, activeSprint, exportTask]);
  const openRefine = useCallback((keys: string[]) => { if (keys.length > 0) { setRefineKeys(keys); setRefineModalOpen(true); } }, []);
  // Gem hover card (BRDG-265): jump to a session, or remove a ticket from one.
  const handleViewRefinement = useCallback((sessionId: string) => { router.push(`/refinement/${sessionId}`); }, [router]);
  const handleRemoveFromRefinement = useCallback(async (sessionId: string, ticketKey: string) => {
    const session = refinementSessionList.find((s) => s.id === sessionId);
    if (!session) return;
    const nextKeys = session.ticketKeys.filter((k) => k !== ticketKey);
    const optimistic = refinementSessionList.map((s) =>
      s.id === sessionId ? { ...s, ticketKeys: nextKeys, ticketCount: nextKeys.length } : s,
    );
    try {
      await mutateRefinementSessions(
        async () => {
          await refinementSessionsApi.update(sessionId, { ticketKeys: nextKeys });
          return refinementSessionsApi.list();
        },
        { optimisticData: optimistic, rollbackOnError: true, revalidate: true },
      );
    } catch {
      showToast(`Couldn't remove ${ticketKey} from "${session.name}"`);
    }
  }, [refinementSessionList, mutateRefinementSessions, showToast]);
  const handleRefineSelected = useCallback(() => { openRefine(Array.from(checkedTickets)); }, [checkedTickets, openRefine]);
  const handleBulkSetStatus = useCallback(async (status: Parameters<typeof taBulkSetStatus>[0], targets: Set<string> = checkedTickets) => { await taBulkSetStatus(status, targets); }, [taBulkSetStatus, checkedTickets]);
  const handleBulkSetEpic = useCallback(async (epicKey: string | null, targets: Set<string> = checkedTickets) => { await taBulkSetEpic(epicKey, targets); }, [taBulkSetEpic, checkedTickets]);
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
    const { ok } = await taBulkMoveSprint(sprintId, targets);
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
  }, [taBulkMoveSprint, checkedTickets, sprintNameMap, handleSprintListSelect, showToast, dismissToast]);
  const handleBulkUpdateAssignee = useCallback(async (accountId: string | null, name: string | null, targets: Set<string> = checkedTickets) => { await taBulkUpdateAssignee(accountId, name, targets); }, [taBulkUpdateAssignee, checkedTickets]);
  const handleBulkUpdateLabels = useCallback(async (labels: string[], mode: "add" | "set", targets: Set<string> = checkedTickets) => { await taBulkUpdateLabels(labels, mode, targets); }, [taBulkUpdateLabels, checkedTickets]);
  const handleBulkGenerateSubtasks = useCallback(async (targets: Set<string> = checkedTickets) => { const keys = Array.from(targets); setBulkGenerating(true); showToast(`Generating subtasks for ${keys.length} ticket${keys.length === 1 ? "" : "s"}...`); try { const { succeeded, failed } = await bulkGenerateSubtasks(keys); if (failed > 0) { showToast(`Generated subtasks for ${succeeded} ticket${succeeded === 1 ? "" : "s"}, ${failed} failed`); } else { showToast(`Subtask suggestions sent for ${succeeded} ticket${succeeded === 1 ? "" : "s"}`); } mutateTickets(); } finally { setBulkGenerating(false); } }, [checkedTickets, showToast, mutateTickets]);
  // Flag: "Flag" opens a reason dialog (reason synced to Jira as a comment); "Remove flag" is immediate.
  const handleSetFlagged = useCallback((flagged: boolean, targets: Set<string> = checkedTickets) => {
    if (targets.size === 0) return;
    if (flagged) { setFlagReason(""); setFlagDialog({ targets }); }
    else { void taBulkSetFlagged(false, null, targets); }
  }, [taBulkSetFlagged, checkedTickets]);
  const computeFlagState = useCallback((keys: Set<string>): FlagState => {
    const sel = tickets.filter((t) => keys.has(t.key));
    if (sel.length === 0) return "mixed";
    const flaggedCount = sel.filter((t) => t.flagged).length;
    if (flaggedCount === 0) return "unflagged";
    if (flaggedCount === sel.length) return "flagged";
    return "mixed";
  }, [tickets]);
  const handleSyncGroup = useCallback(async (target: GroupSyncTarget, onProgress: (p: GroupSyncProgress) => void) => {
    try {
      const result = await syncGroupInTranches(target, onProgress);
      mutateTickets();
      const removedSuffix = result.removed > 0 ? `, ${result.removed} moved out` : "";
      showToast(`Synced ${result.synced} ticket${result.synced === 1 ? "" : "s"} in ${target.label}${removedSuffix}`);
      return result;
    } catch (err) {
      showToast(`Failed to sync ${target.label}`);
      throw err;
    }
  }, [mutateTickets, showToast]);

  // Single-sprint / backlog view (not All, not a saved view, not already grouped):
  // render the same stat header as the grouped view, but at the top of the FLAT card
  // so the proven flat row rendering (clicks, dnd, virtualization) stays intact.
  const { activeViewId: fActiveViewId, statusFilter: fStatusFilter, setStatusFilter: fSetStatusFilter } = f;
  const singleSprintHeader = useMemo<ReactNode>(() => {
    if (isAllView || fActiveViewId || groups.length > 0) return undefined;
    const isBacklog = activeSprintId === "__backlog__";
    if (!isBacklog && !activeSprint) return undefined;
    const label = isBacklog ? "Backlog" : activeSprint!.name;
    const key = isBacklog ? "__backlog__" : activeSprint!.id;
    const CRIT_TO_STATUS: Record<string, string> = { todo: "TO DO", "in-progress": "IN PROGRESS", test: "TEST", done: "DONE" };
    const STATUS_TO_CRIT: Record<string, StatCriterion> = { "TO DO": "todo", "IN PROGRESS": "in-progress", TEST: "test", DONE: "done" };
    const onlyStatus = fStatusFilter.size === 1 ? [...fStatusFilter][0] : null;
    const activeCriterion: StatCriterion | null = warningLensActive
      ? "unpointed"
      : onlyStatus ? (STATUS_TO_CRIT[onlyStatus] ?? null) : null;
    // The "+" lives in the header next to "...", matching the grouped/All view's per-group create
    // button. Jira rejects creating into a closed sprint, so it only shows where creation is allowed.
    const canCreate = isBacklog || activeSprint?.state !== "closed";
    const createAction = canCreate ? (
      <button
        type="button"
        aria-label="Create story in this sprint"
        onClick={(e) => { e.stopPropagation(); setFlatComposerOpen((v) => !v); }}
        className={`flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] [transition:background-color_.12s_ease,color_.12s_ease] ${
          flatComposerOpen
            ? "bg-overlay-strong text-text-secondary"
            : "text-text-muted hover:bg-overlay-default hover:text-text-secondary"
        }`}
      >
        <Plus size={14} strokeWidth={2} aria-hidden />
      </button>
    ) : undefined;
    return (
      <GroupStatBar
        createAction={createAction}
        // Use the unfiltered sprint set so the status breakdown always shows every
        // pill — otherwise filtering down to one status hides the others and you
        // can no longer click to toggle the filter back off.
        tickets={allTickets}
        label={label}
        labelWidthClass=""
        isActive={!isBacklog && activeSprint?.state === "active"}
        leadingIcon={isBacklog ? <Inbox className="h-3.5 w-3.5" strokeWidth={1.5} /> : undefined}
        activeCriterion={activeCriterion}
        onFilterChange={(crit) => {
          if (crit === null) {
            // GroupStatBar collapses a re-click of the active pill to null. While the lens
            // is on it is the active pill, so null here means "turn the warning lens off"
            // (BRDG-313, req 2); otherwise it clears the status filter.
            if (warningLensActive) { setWarningLensActive(false); return; }
            fSetStatusFilter(new Set());
            return;
          }
          if (crit === "unpointed") {
            // Enter the transient warning lens; never mutate the persistent filters, so
            // turning it off restores the prior view exactly (BRDG-313, req 1/2).
            setWarningLensActive(true);
            return;
          }
          const status = CRIT_TO_STATUS[crit];
          if (!status) return;
          fSetStatusFilter(activeCriterion === crit ? new Set() : new Set([status]));
        }}
        {...(!isBacklog && activeSprint
          ? {
              onPin: () => handleAddSlotWithSprint(key),
              isPinned: slotSprintsSet.has(key),
              pinDisabled: slotSprintsSet.size >= 8,
              sprint: activeSprint,
              onEditSprintDetails: () => handleEditSprintFromGroup(key),
              onCloseSprint: activeSprint.state === "active" ? () => handleCloseSprintFromGroup(key) : undefined,
              // Start happens inside the edit modal (date validation + Start button live there).
              onStartSprint: activeSprint.state === "future" ? () => handleEditSprintFromGroup(key) : undefined,
              onSync: (onProgress: (p: GroupSyncProgress) => void) => handleSyncGroup({ kind: "sprint", id: key, label }, onProgress),
              syncKind: "sprint" as const,
            }
          : {})}
        {...(!isBacklog && activeSprint && planningVisible
          ? {
              planningOn: true,
              pencilCapacity: pencilCapacityMap[key] ?? null,
              onPencilCapacityChange: (v: number | null) => setPencilCapacity(key, v),
            }
          : {})}
      />
    );
  }, [isAllView, fActiveViewId, fStatusFilter, fSetStatusFilter, warningLensActive, groups.length, activeSprintId, activeSprint, allTickets, slotSprintsSet, handleAddSlotWithSprint, handleEditSprintFromGroup, handleCloseSprintFromGroup, handleSyncGroup, flatComposerOpen, planningVisible, pencilCapacityMap, setPencilCapacity]);

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

  // Epic filter actions surfaced from the epic side panel (BRDG-131). The board
  // epic filter matches on epic name (not key), so these take the epic's title.
  // "Show only" filters the current view and closes the panel so the result is
  // visible; "across all sprints" switches to All (which drops the open ticket).
  const handleFilterByEpic = useCallback((epicName: string) => {
    f.setEpicFilter(new Set([epicName]));
    setSelectedTicket(null);
  }, [f, setSelectedTicket]);
  const handleShowEpicAcrossAllSprints = useCallback((epicName: string) => {
    f.showOnlyEpicInAllView(epicName);
    handleAllClick();
  }, [f, handleAllClick]);
  const handleClearEpicFilter = useCallback(() => {
    f.setEpicFilter(new Set());
  }, [f]);

  // Shared board content rendered once, conditionally wrapped in DndContext.
  // The list would otherwise span the full viewport, stranding the right-hand metadata far from
  // the title on wide screens (BRDG-315). Cap the inner content of the toolbar, the filter bar,
  // and the list to one shared centred width so all three stay aligned; the section backgrounds
  // still span full width behind them.
  const boardMaxW = "mx-auto w-full max-w-[1280px]";
  const boardContent = (
    <>
      <div className={`${dnd.jiraRankDndEnabled ? "relative " : ""}bg-[var(--color-surface-toolbar)]`}>
        <SprintSlots slotSprints={slotSprints} pillSlotSprints={pillSlotSprints} activeSprintId={activeSprintId} allActive={isAllView && !f.activeViewId} sprints={sprints} backlogCount={backlogCount} backlogSprints={backlogSprints} activeBacklogId={activeBacklog?.id ?? null} onBacklogSelect={handleSprintListSelect} onSlotClick={setActiveSlot} onAllClick={handleAllClick} editingSlot={editingSlot} onSlotEdit={handleSlotEdit} onSprintSelect={handleSprintSelect} onEditClose={() => setEditingSlot(null)} onReorderSlots={handleReorderSlots} ephemeralSprintId={ephemeralSprintId} ephemeralIsActive={ephemeralIsActive} onEphemeralClick={handleEphemeralClick} filtersCollapsed={barsCollapsed} activeFilterCount={activeFilterCount} onToggleFilters={() => setBarsCollapsed((v) => !v)} savedViews={presetViews} activeViewId={f.activeViewId} onViewClick={f.handleViewClick} onSaveCurrentView={f.handleSaveView} sortField={f.sortField} sortDir={f.sortDir} onSortChange={sortChange} columnVisible={f.visibleTags} onColumnToggle={toggleColumn} onColumnReset={resetToDefaults} groupBy={groupBy} onGroupByChange={setGroupBy} onCreateSprint={() => setCreateSprintModalOpen(true)} onOpenSprintList={() => setBarSprintListOpen(true)} groupCount={groups.length} allGroupsCollapsed={allCollapsed} onToggleCollapseAll={toggleAllGroups} />
        {dnd.jiraRankDndEnabled && dnd.boardActiveDragId && <SprintDropZoneBar sprints={sprints} slotSprints={slotSprints} activeSprintId={activeSprintId} />}
      </div>
      {!barsCollapsed && (
        <div className="border-b border-border-default bg-[var(--color-surface-toolbar)]">
          <FilterBar statusFilter={f.statusFilter} epicFilter={f.epicFilter} assigneeFilter={f.assigneeFilter} readinessFilter={f.readinessFilter} editStateFilter={f.editStateFilter} issueTypeFilter={f.issueTypeFilter} onStatusFilterChange={f.setStatusFilter} onEpicFilterChange={f.setEpicFilter} onAssigneeFilterChange={f.setAssigneeFilter} onReadinessFilterChange={f.setReadinessFilter} onEditStateFilterChange={f.setEditStateFilter} onIssueTypeFilterChange={f.setIssueTypeFilter} gapsFilter={f.gapsFilter} onGapsFilterChange={f.setGapsFilter} statusOptions={f.statusOptions} epicOptions={f.epicOptions} assigneeOptions={f.assigneeOptions} issueTypeOptions={f.issueTypeOptions} teamFilter={f.teamFilter} onTeamFilterChange={f.setTeamFilter} teamOptions={f.teamOptions} {... (isAllView ? { sprintFilter: f.sprintFilter, onSprintFilterChange: f.setSprintFilter, sprintOptions: f.sprintOptions, sprintNameMap } : {})} noBorder searchQuery={f.searchQuery} onSearchChange={f.setSearchQuery} onSaveView={f.handleSaveView} onDeleteView={f.activeViewId && !f.activeViewId.startsWith("__preset:") ? () => f.handleDeleteView(f.activeViewId!) : undefined} activeView={f.activeView} />
        </div>
      )}
      <div ref={contentScrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {!ticketsLoading && analyticsVisible && <SprintAnalytics tickets={allTickets} onClose={() => setAnalyticsVisible(false)} sprintId={activeSprintId} />}
        {ticketsLoading && <LoadingState variant="spinner" label="Loading tickets..." className="min-h-[200px]" />}
        {!ticketsLoading && (
          // The list sits on a white surface; TicketTable renders the bordered card(s) itself —
          // one card when ungrouped, one per group when grouped (BRDG-239, BRDG-267).
          <div className="min-h-full bg-[var(--color-surface-elevated)] px-4 pb-20 pt-3">
          <div className={boardMaxW}>
          <TicketTable tickets={displayTickets} warningLensActive={warningLensActive} warningLensActiveSprint={!!flatIsActiveSprint} filterSignature={filterSignature} checkedTickets={checkedTickets} selectedTicket={selectedTicket} focusedTicketIdx={focusedTicketIdx} someChecked={someChecked} allChecked={allChecked} visibleTags={f.visibleTags} hideEpic={hideEpicChip} showSprint={showSprintOnRow} sprintNameMap={sprintNameMap} poStatuses={poStatuses} readinessMap={readinessMap} inflightKeys={inflightKeys} onToggleCheck={toggleCheck} onRangeCheck={handleRangeCheck} onToggleAll={toggleAll} onSelectTicket={setSelectedTicket} onRowContextMenu={handleRowContextMenu} contextMenuKeys={rowMenu?.targets} onPoStatusChange={ta.handlePoStatusChange} onReadinessChange={ta.handleReadinessChange} onBusinessValueChange={ta.handleBusinessValueChange} onStoryPointsChange={ta.handleStoryPointsChange} planningOn={planningVisible} onGuestimationChange={ta.handleGuestimationChange} pencilCapacityMap={pencilCapacityMap} onPencilCapacityChange={setPencilCapacity} onJiraStatusChange={ta.handleJiraStatusChange} onIssueTypeChange={ta.handleIssueTypeChange} onTitleChange={ta.handleTitleChange} onAssigneeChange={ta.handleAssigneeChange} onEpicChange={ta.handleEpicChange} onSprintChange={ta.handleSprintChange} sprints={sprints} onCloseSubtasks={ta.handleCloseSubtasks} onTableKeyDown={handleTableKeyDown} onRunReview={(key) => handleBulkReviewStory(new Set([key]))} sortField={f.sortField} sortDir={f.sortDir} groups={groups} flatHeader={singleSprintHeader} collapsedGroups={collapsedGroups} onToggleCollapse={toggleCollapse} groupBy={groupBy} pinnedSprintIds={slotSprintsSet} onPinSprint={handleAddSlotWithSprint} onEditSprint={handleEditSprintFromGroup} onCloseSprint={handleCloseSprintFromGroup} onSyncGroup={handleSyncGroup} onCreateTicket={handleCreateTicket} flatCreateTarget={flatCreateTarget} flatComposerOpen={flatComposerOpen} onCloseFlatComposer={closeFlatComposer} scrollContainerRef={contentScrollRef} refinementSessionMap={ticketSessionMap} onRemoveFromRefinement={handleRemoveFromRefinement} onViewRefinement={handleViewRefinement} {...(dnd.jiraRankDndEnabled ? { externalDnd: true as const, externalActiveDragId: dnd.boardActiveDragId, dragOverKey: dnd.boardOverId } : { onReorder: f.sortField === "rank" && !f.activeViewId ? handleReorder : undefined })} />
          </div>
          </div>
        )}
      </div>
    </>
  );

  // Rendered full-width below both list and side panel so its actions never
  // overflow over the panel when the list column is narrowed.
  const bulkActionBar = someChecked && (() => {
    const sel = tickets.filter((t) => checkedTickets.has(t.key));
    return <BulkActionBar floating count={checkedTickets.size} totalCount={tickets.length} selectedPoints={sel.reduce((s, t) => s + (t.storyPoints ?? 0), 0)} selectedBV={sel.reduce((s, t) => s + (t.businessValue ?? 0), 0)} allChecked={allChecked} onToggleAll={toggleAll} onClear={() => setCheckedTickets(new Set())} onSetReadiness={handleBulkSetReadiness} onSetStatus={handleBulkSetStatus} onSetEpic={handleBulkSetEpic} onMoveSprint={handleBulkMoveSprint} onUpdateAssignee={handleBulkUpdateAssignee} onUpdateLabel={handleBulkUpdateLabels} onSetFlagged={(flagged) => handleSetFlagged(flagged)} flagState={computeFlagState(checkedTickets)} sprints={sprints} pinnedSprintIds={slotSprints} onRefreshFromJira={handleBulkRefresh} onReviewStory={handleBulkReviewStory} onCopyToClipboard={handleCopyToClipboard} onExportForStakeholders={handleExportForStakeholders} isRefreshing={bulkRefreshing} isExporting={exportTask.isActive} onGenerateSubtasks={handleBulkGenerateSubtasks} isGeneratingSubtasks={bulkGenerating} onRefine={handleRefineSelected} />;
  })();

  return (
    <>
      {pageTitle}
      <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="flex min-w-0 min-h-0 flex-1 flex-col overflow-hidden">
        <SprintBoardHeader
          isAllView={isAllView} activeSprint={activeSprint} activeSprintId={activeSprintId}
          allTickets={allTickets} tickets={tickets} ticketsLoading={ticketsLoading}
          stats={stats} sprintWorkDays={sprintWorkDays} slotSprints={slotSprints} activeSlot={activeSlot}
          showToast={showToast} activeView={f.activeView} sortField={f.sortField} sortDir={f.sortDir}
          filters={{ statusFilter: f.statusFilter, setStatusFilter: f.setStatusFilter, gapsFilter: f.gapsFilter, setGapsFilter: f.setGapsFilter, hasActiveFilters: f.hasActiveFilters, resetFilters: f.resetFilters, setIssueTypeFilter: f.setIssueTypeFilter, setEpicFilter: f.setEpicFilter }}
          analyticsVisible={analyticsVisible} setAnalyticsVisible={setAnalyticsVisible}
          planningVisible={planningVisible} setPlanningVisible={setPlanningVisible}
          setSearchModalOpen={setSearchModalOpen}
          setEditModalOpen={setEditModalOpen} setCreateSprintModalOpen={setCreateSprintModalOpen}
          handleSprintListSelect={handleSprintListSelect} handleAddSlotWithSprint={handleAddSlotWithSprint}
          onFinishSprint={openFinishModal}
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

      {panelTicket && (() => {
        const idx = tickets.findIndex((t) => t.key === panelTicket.key);
        const adjacentKeys = { prev: idx > 0 ? tickets[idx - 1].key : null, next: idx >= 0 && idx < tickets.length - 1 ? tickets[idx + 1].key : null };
        return <SidePanel key={panelTicket.key} ticket={panelTicket} poStatus={poStatuses[panelTicket.key] ?? null} readiness={readinessMap[panelTicket.key] ?? null} onPoStatusChange={(v) => ta.handlePoStatusChange(panelTicket.key, v)} onReadinessChange={(v) => ta.handleReadinessChange(panelTicket.key, v)} onNotesChange={(notes) => { saveTicketMetadata(panelTicket.key, { poNotes: notes }, activeListKey); }} onClose={() => setSelectedTicket(null)} onShowToast={showToast} onMutate={mutateTickets} onSelectTicket={setSelectedTicket} adjacentKeys={adjacentKeys} epicActions={{ onShowOnly: handleFilterByEpic, onShowAcrossAllSprints: handleShowEpicAcrossAllSprints, onClear: handleClearEpicFilter, isFiltered: f.epicFilter.size > 0 }} />;
      })()}
      </div>
      {bulkActionBar && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center pb-2 pl-20 pr-2 sm:pl-24 sm:pr-4">
          <div className="pointer-events-auto w-full max-w-5xl px-3 sm:px-4">
            {bulkActionBar}
          </div>
        </div>
      )}

      <Toast toast={toast} loading={toastLoading} onDismiss={dismissToast} />

      <ExportToasts status={exportTask.status} output={exportTask.output} error={exportTask.error} conversationId={exportTask.conversationId} dismiss={exportTask.dismiss} showToast={showToast} />

      <SearchModal open={searchModalOpen} initialQuery={f.searchQuery} onClose={() => setSearchModalOpen(false)} onSelectTicket={(key: string) => setSelectedTicket(key)} sprintNameMap={sprintNameMap} />
      {editModalOpen && editSprint && <SprintEditModal sprint={editSprint} tickets={editSprintTickets} onClose={() => { setEditModalOpen(false); setAutoSuggest(false); setEditSprintId(null); }} showToast={showToast} autoSuggest={autoSuggest} />}
      {createSprintModalOpen && <CreateSprintModal onClose={() => setCreateSprintModalOpen(false)} onCreated={handleSprintCreated} showToast={showToast} suggestedName={suggestedSprintName} suggestedStartDate={suggestedSprintStartDate} previousSprintName={latestRegular?.sprint.name} previousSprintEndIso={latestRegular?.sprint.endDate ?? null} />}
      {barSprintListOpen && <SprintListModal onClose={() => setBarSprintListOpen(false)} onSelect={handleSprintListSelect} onPin={handleAddSlotWithSprint} pinnedIds={slotSprintsSet} />}
      {finishModalOpen && finishSprint && (
        <FinishSprintModal
          sprint={finishSprint}
          tickets={finishSprintTickets}
          earlyClose={finishEarlyClose}
          onClose={() => { setFinishModalOpen(false); setFinishSprintId(null); }}
          onCloseAllSubtasks={ta.handleCloseSubtasks}
          onRefreshTickets={mutateTickets}
          showToast={showToast}
          onFinished={() => { mutateTickets(); }}
        />
      )}
      <AddToRefinementModal open={refineModalOpen} onClose={() => { setRefineModalOpen(false); setRefineKeys(null); }} ticketKeys={refineKeys ?? Array.from(checkedTickets)} onAdded={(id, name) => showToast(<span>Added to &ldquo;{name}&rdquo;{" "}<a href={`/refinement/${id}`} onClick={(e) => { e.preventDefault(); router.push(`/refinement/${id}`); }} className="font-medium text-[var(--color-brand-400)] underline underline-offset-2 hover:text-[var(--color-brand-300)]">Open refinement</a></span>, 5000)} />

      {rowMenu && (
        <CursorMenu x={rowMenu.x} y={rowMenu.y} onClose={() => setRowMenu(null)}>
          <TicketActionMenuContent
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
