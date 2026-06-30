"use client";

import { useState, useRef, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { mutate as globalMutate } from "swr";
import { Inbox, Plus, Bell, BellDot } from "lucide-react";
import { trailingDoneDepStart, interpolateRank, spliceKeyIntoOrder } from "@/lib/sprint-insert-position";
import { GroupStatBar, type StatCriterion } from "@/components/sprint-board/GroupStatBar";
import { matchesWarningFilter } from "@/components/sprint-board/warning-filter";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import type { Sprint, Ticket, IssueType, PlaceholderTicket, TicketReadiness, JiraStatus } from "@/types/ticket";
import { SprintSlots } from "@/components/sprint-board/SprintSlots";
import type { FilterControlsPanelProps } from "@/components/sprint-board/FilterControlsPanel";
import { TicketTable } from "@/components/sprint-board/TicketTable";
import { BulkActionBar } from "@/components/sprint-board/BulkActionBar";
import { CursorMenu, TicketActionMenuContent } from "@/components/sprint-board/ticket-action-menu";
import type { EpicOption } from "@/components/shared/EpicPicker";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { SidePanel } from "@/components/sprint-board/SidePanel";
import { SprintAnalytics } from "@/components/sprint-board/SprintAnalytics";
import dynamic from "next/dynamic";
const SearchModal = dynamic(() => import("@/components/sprint-board/SearchModal").then((m) => ({ default: m.SearchModal })), { ssr: false });
const AddToRefinementModal = dynamic(() => import("@/components/refinement-session/AddToRefinementModal").then((m) => ({ default: m.AddToRefinementModal })), { ssr: false });
import { useJiraSprints, useTickets, useTicketDetail } from "@/hooks/useSprintBoard";
import { useBacklogDropTarget } from "@/hooks/useBacklogDropTarget";
import { useTicketSessionMap } from "@/hooks/useTicketSessionMap";
import { sessionLabel, compareSessions } from "@/components/refinement-session/refinement-utils";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useMigratedAccountSetting } from "@/hooks/useMigratedAccountSetting";
import { usePencilCapacity } from "@/hooks/usePencilCapacity";
import { useSprintUsedPoints } from "@/hooks/useSprintUsedPoints";
import { usePlaceholders } from "@/hooks/usePlaceholders";
import { useExportTask } from "@/hooks/useExportTask";
import { usePageTitle } from "@/hooks/usePageTitle";
import { mapJiraSprints, saveSprintSlots, saveTicketMetadata, bulkReviewStories, bulkGenerateSubtasks, computeSprintStats, computeSprintWorkDays, scopePlaceholdersToSprintFilter } from "@/components/sprint-board/sprint-board-utils";
import { sprintToSlug, slugToSprintId, buildBoardUrl, nextSprintName, latestRegularSprint, isBacklogSprintName, isOverallRefinementSprint } from "@/lib/sprint-utils";
import type { SavedView, InlineTagId } from "@/components/sprint-board/filter-bar-types";
import { cycleMetricSort, DEFAULT_SORT } from "@/components/sprint-board/filter-bar-types";
import { startDateFromPreviousEnd } from "@/lib/sprint-dates";
import { BOARD_CONTENT_MAX } from "@/lib/layout";
import { prefetchTicketList, setRouterPrefetch } from "@/lib/prefetch";
import { apiFetch, jira, tickets as ticketsApi, refinementSessions as refinementSessionsApi } from "@/lib/api-client";
import { syncGroupInTranches, type GroupSyncTarget, type GroupSyncProgress } from "@/lib/group-sync";
import { useSprintBoardFilters } from "@/components/sprint-board/useSprintBoardFilters";
import { useGroupBy } from "@/components/sprint-board/useGroupBy";
import { useSprintBoardDragDrop } from "@/components/sprint-board/useSprintBoardDragDrop";
import { usePendingSprintMoves, applyPendingMoves, clearPendingMove } from "@/components/sprint-board/pendingSprintMoves";
import { usePendingTicketEdits, applyPendingEdits, clearPendingEdit, valuesMatch } from "@/components/sprint-board/pendingTicketEdits";
import { sprintMoveToastContent } from "@/components/sprint-board/sprintMoveToast";
import { useSprintBoardShortcuts } from "@/components/sprint-board/useSprintBoardShortcuts";
import { useTicketActions } from "@/components/sprint-board/useTicketActions";
import { makeBoardAdapter, makeBoardDispatchAdapter } from "@/components/sprint-board/row-actions/adapter";
import { useRowActions } from "@/components/sprint-board/row-actions/useRowActions";
import { pruneSelectionToVisible } from "@/components/sprint-board/row-actions/prune-selection";
import { SprintBoardHeader } from "@/components/sprint-board/SprintBoardHeader";
import { DragGhostOverlay } from "@/components/sprint-board/DragGhostOverlay";
import { SprintDropZoneBar, snapToPointer, boardCollisionDetection } from "@/components/sprint-board/SprintBoardDragDrop";
import { ExportToasts } from "@/components/sprint-board/ExportToasts";
import { Toast } from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";
import { DndContext, DragOverlay, MeasuringStrategy } from "@dnd-kit/core";
const SprintEditModal = dynamic(() => import("@/components/sprint-board/SprintEditModal").then((m) => ({ default: m.SprintEditModal })), { ssr: false });
const CreateSprintModal = dynamic(() => import("@/components/sprint-board/CreateSprintModal").then((m) => ({ default: m.CreateSprintModal })), { ssr: false });
import type { CreatedSprint } from "@/components/sprint-board/CreateSprintModal";
const SprintListModal = dynamic(() => import("@/components/sprint-board/SprintListModal").then((m) => ({ default: m.SprintListModal })), { ssr: false });
const FinishSprintModal = dynamic(() => import("@/components/sprint-board/FinishSprintModal").then((m) => ({ default: m.FinishSprintModal })), { ssr: false });
import { LoadingState } from "@/components/shared/LoadingState";
import { DataErrorState } from "@/components/shared/DataErrorState";
import { useColumnConfig } from "@/hooks/useColumnConfig";
import { useTicketEventsStream } from "@/hooks/useTicketEventsStream";
import { useStatusChanges } from "@/hooks/useStatusChanges";
import type { StatusChangeItem } from "@/lib/status-changes-query";

// Stable default so the account-setting SWR fallback never churns identity (BRDG-343).
const EMPTY_PO_PRIORITY: Record<string, string[]> = {};
// Stable empty array so the status-change hook's SWR key stays null off the active sprint.
const EMPTY_STATUS_CHANGE_KEYS: string[] = [];
// Stable empty map for when the PO has closed the status-update lines on the board.
const EMPTY_STATUS_CHANGE_MAP = new Map<string, StatusChangeItem>();

export default function SprintBoard() {
  // BRDG-338: one multiplexed SSE connection keeps every rendered row live;
  // the 150s poll remains the fallback when the stream is down.
  useTicketEventsStream();

  const { sprints: rawJiraSprints, backlogCount, data: sprintsData, mutate: mutateJiraSprints } = useJiraSprints();
  const { backlogTargetName } = useBacklogDropTarget();
  const sprints = useMemo(() => {
    const mapped = mapJiraSprints(rawJiraSprints);
    mapped.push({ id: "__backlog__", name: "Backlog", dateRange: "", state: "backlog", ticketCount: backlogCount, startDate: null, endDate: null, goal: null });
    return mapped;
  }, [rawJiraSprints, backlogCount]);
  const { ticketSessionMap, sessions: refinementSessionList, mutate: mutateRefinementSessions } = useTicketSessionMap();
  const searchParams = useSearchParams();
  const router = useRouter();
  // Register the router-prefetch bridge in an effect, not in render: writing a new
  // closure into module state on every render is a render-time side effect the
  // compiler cannot reason about and that misbehaves under double/concurrent render
  // (BRDG-405).
  useEffect(() => {
    setRouterPrefetch((url) => router.prefetch(url));
  }, [router]);

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
  // True once the pinned slots have been fetched, so URL-driven ephemeral adoption
  // doesn't fire against the empty initial slots and double up a pinned sprint (BRDG-319).
  const [slotsLoaded, setSlotsLoaded] = useState(false);
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

  // Deep-link / refresh support (BRDG-319): when the URL resolves to a valid sprint
  // that is not pinned (e.g. opened from the sprint overview, then shared or reloaded),
  // adopt it as the ephemeral sprint so the board shows it instead of falling back to a
  // pinned slot. Non-backlog sprints then appear as the ephemeral tab; backlogs are
  // reflected by the Backlogs dropdown — either way the sprint actually opens.
  useEffect(() => {
    if (isAllView || !urlSprintId || urlSprintId === "__all__") return;
    if (!slotsLoaded) return; // wait until pins are known so a pinned sprint isn't doubled
    if (slotSprints.includes(urlSprintId)) {
      // The URL sprint is pinned: it renders as a pill, so drop any stale ephemeral on it.
      setEphemeralSprintId((prev) => (prev === urlSprintId ? null : prev));
      return;
    }
    if (!sprints.some((s) => s.id === urlSprintId)) return;
    setEphemeralSprintId((prev) => (prev === urlSprintId ? prev : urlSprintId));
  }, [urlSprintId, isAllView, slotSprints, sprints, slotsLoaded]);

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
  const { value: poPriorityMap, setValue: setPoPriorityMap } = useMigratedAccountSetting<Record<string, string[]>>(
    "/api/settings/sprint-board-po-priority",
    "sprint-board-po-priority-map",
    EMPTY_PO_PRIORITY,
  );
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [analyticsVisible, setAnalyticsVisible] = useLocalStorage("sprint-analytics-visible", false);
  // Forward-planning mode (BRDG-303): per-view toggle that reveals pencil capacity,
  // the fullness meter and guestimation pickers. Off by default; persisted per view.
  const [planningVisible, setPlanningVisible] = useLocalStorage("sprint-board-planning-visible", false);
  // The capacity meter is just committed-load noise once a sprint is running, so it's
  // hidden by default on active sprints. This per-sprint flag re-shows it from the
  // group's "..." menu. Keyed by sprint id; missing = hidden.
  const [capacityMeterShownMap, setCapacityMeterShownMap] = useLocalStorage<Record<string, boolean>>("sprint-board-capacity-meter-shown", {});
  // Pencil capacity is fetched only while planning mode is on, so the board makes no
  // extra request in the default (planning-off) state.
  const { capacityMap: pencilCapacityMap, setCapacity: setPencilCapacity } = usePencilCapacity(planningVisible);
  // The fullness meter must always reflect the WHOLE sprint, independent of any
  // active filter (BRDG-303), so it reads server-computed sprint totals rather
  // than the filtered group tickets.
  const sprintUsedMap = useSprintUsedPoints(planningVisible);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [autoSuggest, setAutoSuggest] = useState(false);
  const [createSprintModalOpen, setCreateSprintModalOpen] = useState(false);
  // Sprint overview opened from the views bar's overflow menu (BRDG-319); the header
  // keeps its own entry, so this is a separate instance with its own open state. The
  // anchor positions the popover beneath the overflow (⋯) button.
  const [barSprintListAnchor, setBarSprintListAnchor] = useState<{ top: number; left: number } | null>(null);
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

  const { data: apiTickets, isLoading: ticketsLoading, error: ticketsError, mutate: mutateTickets } = useTickets(activeSprintId || null);
  // In-flight sprint moves: keep a moved row visible in its destination list (and
  // out of its origin) until the slow Jira round-trip resolves and the server list
  // reflects it, so a mid-move revalidation does not make it flicker away.
  const pendingMoves = usePendingSprintMoves();
  // In-flight field edits (status, assignee, scores, ...): re-applied on top of the
  // list on every render so a refetch (poll/focus/sync) that returns pre-write data
  // cannot snap the row back. See docs/architecture/optimistic-updates.md (BRDG-357).
  const pendingEdits = usePendingTicketEdits();
  const allTickets = useMemo(
    () => applyPendingEdits(
      applyPendingMoves(apiTickets, activeSprintId || "__all__", pendingMoves, Date.now()),
      pendingEdits,
      Date.now(),
    ) ?? [],
    [apiTickets, activeSprintId, pendingMoves, pendingEdits],
  );
  // Drop a pending move once it is server-confirmed AND visible in the destination
  // data. Gating on `confirmed` (not just presence) is essential: the optimistic
  // cache patch makes the row "present" the moment you open the target, so clearing
  // on presence alone would drop the overlay before the slow Jira move lands, and an
  // in-flight revalidation would then make the row vanish until the move finished.
  useEffect(() => {
    if (!apiTickets) return;
    const present = new Set(apiTickets.map((t) => t.key));
    pendingMoves.forEach((m, key) => {
      if (m.confirmed && m.targetSprintId === activeSprintId && present.has(key)) clearPendingMove(key);
    });
  }, [apiTickets, activeSprintId, pendingMoves]);
  // Self-heal field edits: drop the overlay once the write is confirmed AND the
  // server list reflects the value (gating on confirmed, like sprint moves, so an
  // in-flight revalidation can't clear it before the write lands). A TTL inside the
  // store is the safety net if the server never catches up.
  useEffect(() => {
    if (!apiTickets) return;
    const byKey = new Map(apiTickets.map((t) => [t.key, t as unknown as Record<string, unknown>]));
    pendingEdits.forEach((edit) => {
      if (!edit.confirmed) return;
      const server = byKey.get(edit.key);
      if (server && valuesMatch(server[edit.field], edit.value)) clearPendingEdit(edit.key, edit.field);
    });
  }, [apiTickets, pendingEdits]);
  const activeListKey = useMemo(() => {
    if (!activeSprintId) return null;
    return activeSprintId === "__all__" ? "/api/tickets" : `/api/tickets?sprintId=${encodeURIComponent(activeSprintId)}`;
  }, [activeSprintId]);

  // Forward-planning placeholders (BRDG-304). Fetched only while planning mode is on.
  // The full active set is loaded once; the grouped view buckets by sprintId and the
  // flat view scopes to the open sprint. Promote/edit/delete revalidate the fullness
  // meter (a separate server-computed total) and, on promote, the ticket list.
  const {
    placeholders: allPlaceholders,
    create: createPlaceholderApi,
    update: updatePlaceholderApi,
    remove: removePlaceholderApi,
    promote: promotePlaceholderApi,
  } = usePlaceholders(planningVisible);
  const refreshMeter = useCallback(() => { globalMutate("/api/sprints/used-points"); }, []);
  const handlePlaceholderUpdate = useCallback((id: string, patch: Partial<PlaceholderTicket>) => {
    updatePlaceholderApi(id, patch).then(refreshMeter).catch(() => showToast("Failed to update placeholder"));
  }, [updatePlaceholderApi, refreshMeter, showToast]);
  const handlePlaceholderDelete = useCallback((id: string) => {
    removePlaceholderApi(id).then(refreshMeter).catch(() => showToast("Failed to delete placeholder"));
  }, [removePlaceholderApi, refreshMeter, showToast]);
  const handlePlaceholderCreate = useCallback((sprintId: string | null, title: string) => {
    createPlaceholderApi({ title, sprintId }).then(refreshMeter).catch(() => showToast("Failed to create placeholder"));
  }, [createPlaceholderApi, refreshMeter, showToast]);
  const handlePlaceholderPromote = useCallback((id: string) => {
    promotePlaceholderApi(id)
      .then((r) => { mutateTickets(); refreshMeter(); showToast(`Promoted to ${r.key}`); })
      .catch(() => showToast("Failed to promote placeholder"));
  }, [promotePlaceholderApi, mutateTickets, refreshMeter, showToast]);
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

  // Ticket actions hook (must be before useSprintBoardFilters which needs readinessMap).
  // useTicketActions keeps the per-row side-panel handlers (poStatus / story points /
  // single readiness / sync); the shared bulk dispatch lives in useRowActions (below),
  // driven by the board dispatch adapter so each edit still flows through the board's
  // pendingTicketEdits / pendingSprintMoves overlay + readiness map (BRDG-374).
  const boardAdapter = useMemo(
    () => makeBoardAdapter(apiTickets, mutateTickets, activeListKey, sprintNameMap),
    [apiTickets, mutateTickets, activeListKey, sprintNameMap],
  );
  const ta = useTicketActions({ adapter: boardAdapter, showToast });
  const { poStatuses, readinessMap, setReadinessMap, syncFromApiTickets } = ta;
  // Snapshot of pre-edit readiness values so a failed bulk write can restore the map.
  const prevReadinessRef = useRef<Record<string, TicketReadiness | null>>({});
  const boardDispatchAdapter = useMemo(
    () => makeBoardDispatchAdapter(boardAdapter, { setReadinessMap, prevRef: prevReadinessRef }),
    [boardAdapter, setReadinessMap],
  );

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
  // BRDG-415: keep the multi-select to the visible rows. Pruning during render (a
  // setState-in-effect is build-blocking) and only when a stale key is present (the
  // helper returns the same Set otherwise) keeps it from looping or churning renders.
  const visibleKeySet = useMemo(() => new Set(tickets.map((t) => t.key)), [tickets]);
  const prunedSelection = pruneSelectionToVisible(checkedTickets, visibleKeySet);
  if (prunedSelection !== checkedTickets) setCheckedTickets(prunedSelection);
  // Placeholders honour the active sprint scope exactly like tickets do (BRDG-304): when a
  // sprint filter is active in the All view, only placeholders whose sprint is in scope
  // surface. Without this a forward-planning placeholder from another sprint seeds a stray
  // group (e.g. opening the sprint-scoped "Overall refinement" preset still showed an
  // unrelated sprint group carrying that sprint's placeholder).
  const scopedPlaceholders = useMemo(
    () =>
      scopePlaceholdersToSprintFilter(allPlaceholders, {
        active: isAllView && f.sprintFilter.size > 0,
        selectedSprintIds: f.selectedSprintIds,
        selectedSprintStates: f.selectedSprintStates,
        sprintStateMap,
      }),
    [isAllView, f.sprintFilter, f.selectedSprintIds, f.selectedSprintStates, sprintStateMap, allPlaceholders],
  );
  // Sprint ids that carry placeholders, so the grouped view shows a group even for a
  // future sprint that has no real tickets yet.
  const placeholderSprintIds = useMemo(
    () => Array.from(new Set(scopedPlaceholders.map((p) => p.sprintId).filter((s): s is string => !!s))),
    [scopedPlaceholders],
  );
  // Search has its own segment in the unified cluster (BRDG-344), so the filter
  // badge counts active filter categories only -- not the search query.
  const activeFilterCount = useMemo(() =>
    [f.statusFilter, f.epicFilter, f.assigneeFilter, f.readinessFilter, f.editStateFilter, f.issueTypeFilter, f.gapsFilter, f.teamFilter, f.sprintFilter].filter((s) => s.size > 0).length,
  [f.statusFilter, f.epicFilter, f.assigneeFilter, f.readinessFilter, f.editStateFilter, f.issueTypeFilter, f.gapsFilter, f.teamFilter, f.sprintFilter]);
  const { groupBy, setGroupBy, collapsedGroups, toggleCollapse, allCollapsed, toggleAllGroups, groups } = useGroupBy(tickets, sprints, sprintNameMap, isAllView, slotSprints, f.includeClosedSprints, f.forceShowSprintIds, placeholderSprintIds);
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
  // Placeholders handed to the table (BRDG-304): the grouped view buckets the full
  // active set by sprintId; the flat single-sprint view shows only the open sprint's
  // (backlog == null). Undefined when planning mode is off so the table renders today's look.
  const placeholdersForTable = useMemo(() => {
    if (!planningVisible) return undefined;
    if (isFlatView) {
      const target = activeSprintId === "__backlog__" ? null : (activeSprintId ?? null);
      return allPlaceholders.filter((p) => (p.sprintId ?? null) === target);
    }
    return scopedPlaceholders;
  }, [planningVisible, isFlatView, activeSprintId, allPlaceholders, scopedPlaceholders]);
  // Only the unpointed problem depends on the sprint being active (others always apply).
  const flatIsActiveSprint = activeSprintId !== "__backlog__" && activeSprint?.state === "active";
  const displayTickets = useMemo(
    () => (isFlatView && warningLensActive ? tickets.filter((t) => matchesWarningFilter(t, !!flatIsActiveSprint)) : tickets),
    [isFlatView, warningLensActive, tickets, flatIsActiveSprint],
  );

  // BRDG-414: status-change review queue, scoped to the active sprint's tickets. Only the
  // single active-sprint view (not All / Backlog / a closed sprint) shows the queue.
  const statusChangeScopeKeys = useMemo(
    () =>
      !isAllView && activeSprintId !== "__all__" && activeSprintId !== "__backlog__" && activeSprint?.state === "active"
        ? allTickets.map((t) => t.key)
        : EMPTY_STATUS_CHANGE_KEYS,
    [isAllView, activeSprintId, activeSprint, allTickets],
  );
  const { byKey: statusChangeMap, markSeen: markStatusChangeSeen } = useStatusChanges(statusChangeScopeKeys);
  // Subtle header toggle to open/close all status-update lines on the board (BRDG-414).
  const [updatesOpen, setUpdatesOpen] = useState(true);
  const statusChangeMapForTable = updatesOpen ? statusChangeMap : EMPTY_STATUS_CHANGE_MAP;
  const handleStatusChangeMoveToBottom = useCallback(
    (item: StatusChangeItem) => {
      // File the ticket just above the trailing done/dep block via the manual PO order,
      // then mark the change seen in the same gesture. Reuses the create-flow splice rule;
      // the change is client-persisted (account setting), so it does not snap back on sync.
      const displayKeys = tickets.map((t) => t.key);
      const insertIdx = trailingDoneDepStart(tickets);
      const base = (poPriorityOrder ?? displayKeys).filter((k) => k !== item.ticketKey);
      setPoPriorityOrder(spliceKeyIntoOrder(base, displayKeys, insertIdx, item.ticketKey));
      markStatusChangeSeen(item);
    },
    [tickets, poPriorityOrder, setPoPriorityOrder, markStatusChangeSeen],
  );
  // Shared bulk dispatch (BRDG-374). The board keeps its own quick-move / create-sprint
  // (it pins + navigates) and flag dialog, so it consumes only the bulk handlers, which
  // flow through the board dispatch adapter's overlay optimism.
  // BRDG-415: host glue handed to the shared useRowActions so the board no longer keeps
  // its own copies of the context-menu / quick-move / create-sprint glue. The move and
  // create handlers are defined further down and reached here through refs, because
  // handleBulkMoveSprint itself calls ra.bulkMoveSprint (a cycle otherwise).
  const bulkMoveRef = useRef<((sprintId: string, targets: Set<string>) => void | Promise<void>) | null>(null);
  const sprintCreatedRef = useRef<((sprint: CreatedSprint) => void) | null>(null);
  // Overlay-aware current-sprint name so the shared quick-move options match the row chip.
  const currentSprintName = useCallback(
    (key: string): string | null => {
      const t = displayTickets.find((d) => d.key === key);
      return t?.sprintId ? (sprintNameMap[t.sprintId] ?? null) : null;
    },
    [displayTickets, sprintNameMap],
  );
  // Right-click clears the previously selected row so only the menu target stays
  // highlighted, but keeps the side panel open when right-clicking the active row.
  const handleContextMenuOpen = useCallback(
    (key: string) => { if (key !== selectedTicket) setSelectedTicket(null); },
    [selectedTicket, setSelectedTicket],
  );
  const handleBoardMove = useCallback(
    (sprintId: string, targets: Set<string>) => bulkMoveRef.current?.(sprintId, targets),
    [],
  );
  // Quick-move auto-create: the board pins + navigates rather than injecting into a cache.
  // Move first so the pending-move overlay keeps rows visible across the slot-add navigation.
  const handleConfirmQuickCreate = useCallback(
    (sprint: CreatedSprint, keys: Set<string>) => {
      void bulkMoveRef.current?.(String(sprint.id), keys);
      sprintCreatedRef.current?.(sprint);
    },
    [],
  );

  const ra = useRowActions({
    adapter: boardDispatchAdapter,
    selectedKeys: checkedTickets,
    sprints,
    pinnedSprintIds: slotSprints,
    backlogTargetName,
    showToast,
    flagSource: "ticket",
    currentSprintName,
    onMove: handleBoardMove,
    onContextMenuOpen: handleContextMenuOpen,
    onConfirmQuickCreate: handleConfirmQuickCreate,
  });
  // The board consumes the shared glue directly (BRDG-415); these are the hook's own
  // context-menu / quick-move / create-sprint / copy / refine exports, not board copies.
  const {
    inflightKeys, rowMenu, setRowMenu, quickMovesFor, currentSprintIdsFor,
    handleQuickMove, computeFlagState, openRefine, handleRowContextMenu, copySelected,
    refineModalOpen, setRefineModalOpen, refineKeys,
    quickCreate, closeQuickCreate, confirmQuickCreate, planPrevSprint,
  } = ra;
  const handleCopyToClipboard = useCallback(() => copySelected(checkedTickets), [copySelected, checkedTickets]);
  // The right-clicked row's current epic (single target only), read from the
  // overlay-aware list so the Set Epic panel's checkmark + Unlink match the chip.
  const rowMenuEpic = useMemo<EpicOption | null>(() => {
    if (!rowMenu || rowMenu.targets.size !== 1) return null;
    const t = displayTickets.find((d) => d.key === [...rowMenu.targets][0]);
    return t?.epic && t?.epicKey ? { key: t.epicKey, name: t.epic } : null;
  }, [rowMenu, displayTickets]);
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
  // BRDG-395: keys of stories created via the inline quick-add this session. Drives the
  // "Open in Story Writer" pill on the fresh row. Plain component state on purpose: it
  // survives SWR revalidation (incoming data never resets it) and clears on unmount /
  // reload. Never reset it from a revalidation-keyed effect.
  const [freshlyCreatedKeys, setFreshlyCreatedKeys] = useState<Set<string>>(() => new Set());
  useEffect(() => { if (!flatCreateTarget) setFlatComposerOpen(false); }, [flatCreateTarget]);
  const closeFlatComposer = useCallback(() => setFlatComposerOpen(false), []);

  // Optimistically add the new ticket to the active list, then reconcile with the
  // created Jira key. Caches are patched client-side rather than via the POST route's
  // cache.invalidate, which is unreliable across routes in next dev (see [[project_turbopack_cache_invalidate]]).
  const handleCreateTicket = useCallback((sprintId: string | null, title: string, jiraType: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const placeholderKey = `pending-${Date.now()}`;
    // Placement rule (BRDG-371): a backlog (the generic backlog, or a named one like
    // "BT: Backlog") lands the new story at the TOP; a regular sprint lands it at the
    // BOTTOM, above the trailing done/deprecated block. The optimistic row gets a
    // jiraRank that keeps it in that spot under the rank sort with no resort/jump.
    const sprintTickets = displayTickets.filter((t) =>
      sprintId === null ? t.sprintId == null : t.sprintId === sprintId,
    );
    const destName = sprintId == null ? null : (sprintNameMap[sprintId] ?? null);
    const isBacklogDest = sprintId == null || (destName != null && isBacklogSprintName(destName));
    // Insertion point among the destination sprint's displayed rows: the top for a
    // backlog, otherwise just above the trailing done/deprecated block.
    const insertIdx = isBacklogDest ? 0 : trailingDoneDepStart(sprintTickets);
    const placeholderRank = interpolateRank(
      isBacklogDest ? undefined : sprintTickets[insertIdx - 1]?.jiraRank,
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

    // When the active view carries a manual PO ordering, the rank sort orders by that
    // key list and ignores jiraRank, so a key missing from it falls to the bottom. Splice
    // the new key in at the same spot the rank rule lands it (above the trailing
    // done/deprecated block, or the top for a backlog).
    const destKeys = sprintTickets.map((t) => t.key);
    const updateOrder = (fn: (order: string[]) => string[]) => {
      if (!activeSprintId) return;
      setPoPriorityMap((prev) => {
        const order = prev[activeSprintId];
        if (!order || order.length === 0) return prev; // no manual order -> jiraRank sort applies
        return { ...prev, [activeSprintId]: fn(order) };
      });
    };
    updateOrder((order) => spliceKeyIntoOrder(order, destKeys, insertIdx, placeholderKey));

    ticketsApi
      .createTicket({ title: trimmed, issueType: jiraType, ...(sprintId ? { sprintId } : {}) })
      .then((created) => {
        mutateTickets(
          (data) => data?.map((t) => (t.key === placeholderKey ? { ...placeholder, key: created.key } : t)),
          { revalidate: false },
        );
        setFreshlyCreatedKeys((prev) => {
          const next = new Set(prev);
          next.add(created.key);
          return next;
        });
        updateOrder((order) => order.map((k) => (k === placeholderKey ? created.key : k)));
        showToast(`${created.key} created`);
      })
      .catch(() => {
        mutateTickets((data) => data?.filter((t) => t.key !== placeholderKey), { revalidate: false });
        updateOrder((order) => order.filter((k) => k !== placeholderKey));
        showToast("Failed to create story");
      });
  }, [mutateTickets, showToast, displayTickets, sprintNameMap, activeSprintId, setPoPriorityMap]);

  // Sync PO data from API
  useEffect(() => { if (apiTickets && apiTickets.length > 0) syncFromApiTickets(apiTickets); }, [apiTickets, syncFromApiTickets]);

  // Keyboard shortcuts
  const { handleTableKeyDown } = useSprintBoardShortcuts({
    tickets, focusedTicketIdx, setFocusedTicketIdx, setSelectedTicket,
    setSearchModalOpen, headerMenuRef, headerMenuOpen, setHeaderMenuOpen,
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
    if (f.activeViewId) { f.setStoredSort({ field: "rank", direction: "asc" }); resetToDefaults(); }
    // Switching sprint replaces the path (no history entry) and drops any open
    // ticket and saved view (BRDG-270).
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("view");
    sp.delete("sprint"); // legacy param now lives in the path
    const slug = sprintToSlug(sprintId, sprints);
    // Replace the path via the History API rather than router.replace: a router
    // navigation remounts the whole board, resetting the locally-held slotSprints
    // to [] until /api/sprint-slots refetches, which flashes the sprint pills away
    // and shifts the content. pushState/replaceState updates usePathname() without
    // a remount, so the pills persist while SWR refetches the tickets (mirrors the
    // selectTicket approach from BRDG-270).
    window.history.replaceState(null, "", buildBoardUrl(slug, null, sp.toString()));
  }, [f, searchParams, resetToDefaults, sprints]);
  const setActiveSlot = useCallback((slot: number) => { const id = slotSprints[slot]; if (id) { setEphemeralSprintId(null); navigateToSprint(id); } }, [slotSprints, navigateToSprint]);
  const handleAllClick = useCallback(() => { setEphemeralSprintId(null); navigateToSprint("__all__"); }, [navigateToSprint]);
  const handleSprintListSelect = useCallback((id: string) => { setEphemeralSprintId(id); navigateToSprint(id); }, [navigateToSprint]);

  // DnD (declared here so it can reuse handleSprintListSelect for the move toast's
  // "View on sprint board" link, matching the right-click/bulk move toast).
  const dnd = useSprintBoardDragDrop({
    activeSprintId, isAllView, groupBy, checkedTickets, setCheckedTickets,
    tickets, apiTickets, mutateTickets, sprintNameMap, showToast,
    setPoPriorityOrder, refreshMeter, sortField: f.sortField, activeViewId: f.activeViewId,
    onViewSprint: handleSprintListSelect, dismissToast,
  });

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
  const handleReorder = useCallback((activeKey: string, overKey: string) => {
    const order = poPriorityOrder ?? tickets.map((t) => t.key); const oi = order.indexOf(activeKey); const ni = order.indexOf(overKey);
    if (oi === -1 || ni === -1) return; const next = [...order]; next.splice(oi, 1); next.splice(ni, 0, activeKey); setPoPriorityOrder(next);
  }, [poPriorityOrder, tickets, setPoPriorityOrder]);

  // Move to top / bottom of the current sprint (whole sprint, filter-independent):
  // a one-click alternative to dragging across a 200+ list. Reuses the move-sprint
  // route with the active sprint as target + a position, and optimistically pins the
  // rows to the top/bottom of the full list (re-indexing jiraRank) so it shows at once.
  const handleRankToEdge = useCallback(async (targets: Set<string>, position: "top" | "bottom") => {
    const keys = [...targets];
    if (keys.length === 0 || !activeSprintId || activeSprintId === "__all__") return;
    mutateTickets((current) => {
      if (!current) return current;
      const movedSet = new Set(keys);
      const moved = current.filter((t) => movedSet.has(t.key));
      const rest = current.filter((t) => !movedSet.has(t.key));
      const reordered = position === "top" ? [...moved, ...rest] : [...rest, ...moved];
      return reordered.map((t, i) => ({ ...t, jiraRank: i }));
    }, { revalidate: false });
    setPoPriorityOrder(null);
    try {
      await jira.moveSprint({ issueKeys: keys, targetSprintId: activeSprintId, position });
      refreshMeter();
      const label = keys.length === 1 ? keys[0] : `${keys.length} tickets`;
      showToast(`Moved ${label} to ${position}`);
    } catch {
      mutateTickets();
      showToast(`Failed to move to ${position}. Reverted.`);
    }
  }, [activeSprintId, mutateTickets, setPoPriorityOrder, refreshMeter, showToast]);

  // Bulk actions. Each accepts an explicit target set (defaulting to the current
  // checkbox selection) so the same handlers serve both the toolbar and the
  // right-click row context menu.
  const handleBulkSetReadiness = useCallback(async (readiness: TicketReadiness | null, targets: Set<string> = checkedTickets) => { await ra.bulkSetReadiness(readiness, targets); }, [ra, checkedTickets]);
  const handleBulkRefresh = useCallback(async () => { setBulkRefreshing(true); try { await jira.syncTickets({ sprintId: slotSprints[activeSlot] }); showToast(`Refreshed ${checkedTickets.size} ticket${checkedTickets.size === 1 ? "" : "s"} from Jira`); } finally { setBulkRefreshing(false); } }, [slotSprints, activeSlot, checkedTickets.size, showToast]);
  const handleBulkReviewStory = useCallback(async (targets: Set<string> = checkedTickets) => { const keys = Array.from(targets); showToast(`Reviewing ${keys.length} ticket${keys.length === 1 ? "" : "s"}...`); await bulkReviewStories(keys); mutateTickets(); showToast(`Reviewed ${keys.length} ticket${keys.length === 1 ? "" : "s"}`); }, [checkedTickets, showToast, mutateTickets]);
  const handleExportForStakeholders = useCallback(async () => { const sel = tickets.filter((t) => checkedTickets.has(t.key)); if (!sel.length) return; await exportTask.startExport({ sprintName: activeSprint?.name ?? "Selected work", tickets: JSON.stringify(sel.map((t) => ({ key: t.key, summary: t.title, points: t.storyPoints ?? null, epic: t.epic ?? null }))) }); }, [tickets, checkedTickets, activeSprint, exportTask]);
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
  // Add targets straight into an existing refinement session (BRDG-374); "New refinement…"
  // still opens the create modal via openRefine.
  const handleAddToRefinement = useCallback(async (sessionId: string, targets: Set<string> = checkedTickets) => {
    const session = refinementSessionList.find((s) => s.id === sessionId);
    if (!session) return;
    const keys = [...targets];
    const nextKeys = [...new Set([...session.ticketKeys, ...keys])];
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
      showToast(`Added ${keys.length} ticket${keys.length === 1 ? "" : "s"} to "${session.name}"`);
    } catch {
      showToast(`Couldn't add to "${session.name}"`);
    }
  }, [refinementSessionList, checkedTickets, mutateRefinementSessions, showToast]);
  // Only offer not-yet-finished sessions in the "Add to refinement" picker; completed
  // refinements are done and would just clutter the list. Labelled, sorted and counted
  // exactly like /refinement (sessionLabel + compareSessions) so the two stay in sync.
  const refinementOptions = useMemo(
    () =>
      (refinementSessionList ?? [])
        .filter((s) => s.status !== "completed")
        .sort(compareSessions)
        .map((s) => ({ id: s.id, name: sessionLabel(s), count: s.ticketCount })),
    [refinementSessionList],
  );
  const handleBulkSetStatus = useCallback(async (status: JiraStatus, targets: Set<string> = checkedTickets) => { await ra.bulkSetStatus(status, targets); }, [ra, checkedTickets]);
  const handleBulkSetEpic = useCallback(async (epicKey: string | null, epicName: string | null, targets: Set<string> = checkedTickets) => { await ra.bulkSetEpic(epicKey, epicName, targets); }, [ra, checkedTickets]);
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
    const { ok } = await ra.bulkMoveSprint(sprintId, targets);
    if (!ok) { showToast("Failed to move tickets to sprint"); return; }
    // The capacity meter reads a separate server total; refresh it so used points
    // recompute for both source and destination sprint without a manual reload.
    refreshMeter();
    showToast(
      sprintMoveToastContent({
        count,
        destName: dest,
        isBacklog,
        onView: () => { handleSprintListSelect(sprintId); dismissToast(); },
      }),
      0,
    );
  }, [ra, checkedTickets, sprintNameMap, handleSprintListSelect, showToast, dismissToast, refreshMeter]);
  // Keep the refs the shared hook reaches through pointed at the latest move/create
  // handlers (declared above `ra` to break the dependency cycle).
  useEffect(() => {
    bulkMoveRef.current = handleBulkMoveSprint;
    sprintCreatedRef.current = handleSprintCreated;
  }, [handleBulkMoveSprint, handleSprintCreated]);
  const handleBulkUpdateAssignee = useCallback(async (accountId: string | null, name: string | null, avatar: string | null = null, targets: Set<string> = checkedTickets) => { await ra.bulkUpdateAssignee(accountId, name, avatar, targets); }, [ra, checkedTickets]);
  const handleBulkUpdateLabels = useCallback(async (labels: string[], mode: "add" | "set", targets: Set<string> = checkedTickets) => { await ra.bulkUpdateLabels(labels, mode, targets); }, [ra, checkedTickets]);
  const handleBulkGenerateSubtasks = useCallback(async (targets: Set<string> = checkedTickets) => { const keys = Array.from(targets); setBulkGenerating(true); showToast(`Generating subtasks for ${keys.length} ticket${keys.length === 1 ? "" : "s"}...`); try { const { succeeded, failed } = await bulkGenerateSubtasks(keys); if (failed > 0) { showToast(`Generated subtasks for ${succeeded} ticket${succeeded === 1 ? "" : "s"}, ${failed} failed`); } else { showToast(`Subtask suggestions sent for ${succeeded} ticket${succeeded === 1 ? "" : "s"}`); } mutateTickets(); } finally { setBulkGenerating(false); } }, [checkedTickets, showToast, mutateTickets]);
  // Flag: "Flag" opens a reason dialog (reason synced to Jira as a comment); "Remove flag" is immediate.
  const handleSetFlagged = useCallback((flagged: boolean, targets: Set<string> = checkedTickets) => {
    if (targets.size === 0) return;
    if (flagged) { setFlagReason(""); setFlagDialog({ targets }); }
    else { void ra.bulkSetFlagged(false, null, targets); }
  }, [ra, checkedTickets]);
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
  // Group-header SP/BV chip actions (image-1 chips). Single-click sorts the board by
  // that metric, flipping direction when it is already the active sort; both default
  // to descending (highest first) so the first click surfaces the heaviest work.
  // Clicking a hidden metric also reveals its per-row column, so a sort never points
  // at a column you cannot see.
  const handleMetricSort = useCallback((metric: "sp" | "bv") => {
    const field: typeof f.sortField = metric === "sp" ? "points" : "bv";
    const next = cycleMetricSort({ field: f.sortField, direction: f.sortDir }, field);
    // Write field + direction in one update: the account-setting setter resolves from a
    // ref that only refreshes between renders, so two back-to-back setters would make the
    // second clobber the first with a stale value (the metric sort would never land).
    f.setStoredSort({ field: next.field, direction: next.direction });
    // Reveal the metric's column only when the cycle actually lands on that sort, so the
    // third click (back to rank) never re-shows a column the PO may have hidden.
    if (next.field === field) {
      const tag: InlineTagId = metric === "sp" ? "storyPoints" : "businessValue";
      if (!f.visibleTags.has(tag)) toggleColumn(tag, true);
    }
  }, [f, toggleColumn]);

  // Double-click toggles the metric's per-row column on/off. It writes the same
  // visibility setting the column popout reads, so the checkbox there stays in sync.
  // A hidden column must never keep driving the order, so hiding the metric that
  // currently sorts the board also clears back to the default rank order.
  const handleMetricToggleColumn = useCallback((metric: "sp" | "bv") => {
    const tag: InlineTagId = metric === "sp" ? "storyPoints" : "businessValue";
    const willHide = f.visibleTags.has(tag);
    toggleColumn(tag, !willHide);
    if (willHide) {
      const field: typeof f.sortField = metric === "sp" ? "points" : "bv";
      if (f.sortField === field) f.setStoredSort({ field: DEFAULT_SORT.field, direction: DEFAULT_SORT.direction });
    }
  }, [f, toggleColumn]);

  const { activeViewId: fActiveViewId, statusFilter: fStatusFilter, setStatusFilter: fSetStatusFilter } = f;
  const singleSprintHeader = useMemo<ReactNode>(() => {
    if (isAllView || fActiveViewId || groups.length > 0) return undefined;
    const isBacklog = activeSprintId === "__backlog__";
    if (!isBacklog && !activeSprint) return undefined;
    const label = isBacklog ? "Backlog" : activeSprint!.name;
    const key = isBacklog ? "__backlog__" : activeSprint!.id;
    const CRIT_TO_STATUS: Record<string, string> = { todo: "TO DO", "in-progress": "IN PROGRESS", test: "TEST", done: "DONE" };
    const STATUS_TO_CRIT: Record<string, StatCriterion> = { "TO DO": "todo", "IN PROGRESS": "in-progress", TEST: "test", DONE: "done" };
    // Multi-select: every filtered status lights up its pill. The warning lens stays a
    // separate single criterion handled via activeCriterion.
    const activeCriteria = new Set<StatCriterion>(
      [...fStatusFilter].map((s) => STATUS_TO_CRIT[s]).filter(Boolean) as StatCriterion[],
    );
    const activeCriterion: StatCriterion | null = warningLensActive ? "unpointed" : null;
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
    // Subtle, icon-only open/close toggle for the status-update lines. Only shown when this
    // sprint actually has updates (BRDG-414).
    const updateCount = statusChangeMap.size;
    const updatesToggle = updateCount > 0 ? (
      <button
        type="button"
        aria-label={updatesOpen ? "Hide status updates" : "Show status updates"}
        aria-pressed={updatesOpen}
        title={updatesOpen ? "Hide status updates" : `Show ${updateCount} status update${updateCount === 1 ? "" : "s"}`}
        onClick={(e) => { e.stopPropagation(); setUpdatesOpen((v) => !v); }}
        className={`flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] [transition:background-color_.12s_ease,color_.12s_ease] ${
          updatesOpen
            ? "text-[var(--color-brand-400)] hover:bg-overlay-default"
            : "text-text-muted hover:bg-overlay-default hover:text-text-secondary"
        }`}
      >
        {updatesOpen ? <BellDot size={14} strokeWidth={2} aria-hidden /> : <Bell size={14} strokeWidth={2} aria-hidden />}
      </button>
    ) : undefined;
    return (
      <GroupStatBar
        createAction={createAction}
        updatesAction={updatesToggle}
        sortField={f.sortField}
        sortDir={f.sortDir}
        onMetricSort={handleMetricSort}
        onMetricToggleColumn={handleMetricToggleColumn}
        spColumnHidden={!f.visibleTags.has("storyPoints")}
        bvColumnHidden={!f.visibleTags.has("businessValue")}
        // Use the unfiltered sprint set so the status breakdown always shows every
        // pill — otherwise filtering down to one status hides the others and you
        // can no longer click to toggle the filter back off.
        tickets={allTickets}
        label={label}
        labelWidthClass=""
        isActive={!isBacklog && activeSprint?.state === "active"}
        leadingIcon={isBacklog ? <Inbox className="h-3.5 w-3.5" strokeWidth={1.5} /> : undefined}
        activeCriterion={activeCriterion}
        activeCriteria={activeCriteria}
        onFilterChange={(crit) => {
          if (crit === null) {
            // Only the warning lens emits null (a re-click of its active pill). While the
            // lens is on, null means "turn it off" (BRDG-313, req 2).
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
          // Toggle the status in/out of the filter set so clicks expand the filter
          // instead of replacing it. Activating a status leaves the warning lens.
          if (warningLensActive) setWarningLensActive(false);
          const next = new Set(fStatusFilter);
          if (next.has(status)) next.delete(status);
          else next.add(status);
          fSetStatusFilter(next);
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
              // Always the whole sprint, regardless of the active filter / warning lens.
              usedPointsOverride: sprintUsedMap[key] ?? 0,
              capacityMeterShown: capacityMeterShownMap[key] ?? false,
              onToggleCapacityMeter: () => setCapacityMeterShownMap((prev) => ({ ...prev, [key]: !(prev[key] ?? false) })),
            }
          : {})}
      />
    );
  }, [isAllView, fActiveViewId, fStatusFilter, fSetStatusFilter, warningLensActive, groups.length, activeSprintId, activeSprint, allTickets, slotSprintsSet, handleAddSlotWithSprint, handleEditSprintFromGroup, handleCloseSprintFromGroup, handleSyncGroup, flatComposerOpen, planningVisible, pencilCapacityMap, setPencilCapacity, sprintUsedMap, capacityMeterShownMap, setCapacityMeterShownMap, f.sortField, f.sortDir, f.visibleTags, handleMetricSort, handleMetricToggleColumn, statusChangeMap, updatesOpen]);

  useEffect(() => {
    if (slotsInitialized.current || !sprintsData) return; slotsInitialized.current = true;
    const fallback = () => { const fb = sprints.find((s) => s.state === "active") ?? sprints[0]; if (fb) setSlotSprints([fb.id]); setSlotsLoaded(true); };
    apiFetch<{ slotIndex: number; sprintId: string }[]>("/api/sprint-slots").then((saved) => {
      const ids = new Set(sprints.map((s) => s.id));
      if (Array.isArray(saved) && saved.length > 0) { const loaded = saved.sort((a, b) => a.slotIndex - b.slotIndex).map((s) => s.sprintId).filter((id) => ids.has(id)); if (loaded.length > 0) { setSlotSprints(loaded); if (loaded.length !== saved.length) saveSprintSlots(loaded, sprints); setSlotsLoaded(true); return; } }
      fallback();
    }).catch(fallback);
  }, [sprintsData, sprints]);

  const sortChange = (fld: typeof f.sortField, d: typeof f.sortDir) => { f.setStoredSort({ field: fld, direction: d }); };

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

  // Props for the unified controls' two-pane filter panel (BRDG-344). Sprint
  // filtering is only meaningful in the All view, so those props are spread in
  // there, mirroring the old FilterBar wiring. Clear-all clears the filter sets
  // only; the panel's Display view drives field visibility independently.
  const filterControlsProps: FilterControlsPanelProps = {
    statusFilter: f.statusFilter,
    epicFilter: f.epicFilter,
    assigneeFilter: f.assigneeFilter,
    readinessFilter: f.readinessFilter,
    editStateFilter: f.editStateFilter,
    issueTypeFilter: f.issueTypeFilter,
    gapsFilter: f.gapsFilter,
    teamFilter: f.teamFilter,
    onStatusFilterChange: f.setStatusFilter,
    onEpicFilterChange: f.setEpicFilter,
    onAssigneeFilterChange: f.setAssigneeFilter,
    onReadinessFilterChange: f.setReadinessFilter,
    onEditStateFilterChange: f.setEditStateFilter,
    onIssueTypeFilterChange: f.setIssueTypeFilter,
    onGapsFilterChange: f.setGapsFilter,
    onTeamFilterChange: f.setTeamFilter,
    statusOptions: f.statusOptions,
    epicOptions: f.epicOptions,
    assigneeOptions: f.assigneeOptions,
    assigneeLabelMap: f.assigneeLabelMap,
    issueTypeOptions: f.issueTypeOptions,
    teamOptions: f.teamOptions,
    onClearAll: f.resetFilters,
    columnVisible: f.visibleTags,
    onColumnToggle: toggleColumn,
    onColumnReset: resetToDefaults,
    ...(isAllView
      ? {
          sprintFilter: f.sprintFilter,
          onSprintFilterChange: f.setSprintFilter,
          sprintOptions: f.sprintOptions,
          sprintNameMap,
        }
      : {}),
  };

  // Shared board content rendered once, conditionally wrapped in DndContext.
  // The list would otherwise span the full viewport, stranding the right-hand metadata far from
  // the title on wide screens (BRDG-315). Cap the inner content of the toolbar, the filter bar,
  // and the list to one shared centred width so all three stay aligned; the section backgrounds
  // still span full width behind them.
  const boardMaxW = BOARD_CONTENT_MAX;
  const boardContent = (
    <>
      {/* The views bar shares the header's chrome tint so the two rows read as one
          continuous console, joined only by the header's faint seam (BRDG-344). */}
      <div className={`${dnd.jiraRankDndEnabled ? "relative " : ""}bg-surface-chrome`}>
        {/* During a ticket drag the real bar is hidden and the (transparent) drop
            overlay takes over, so the drop tiles sit on the page background —
            matching the refinement bar's in-place drag treatment. */}
        <div className={dnd.boardActiveDragId ? "invisible" : ""}>
        <SprintSlots slotSprints={slotSprints} pillSlotSprints={pillSlotSprints} activeSprintId={activeSprintId} allActive={isAllView && !f.activeViewId} sprints={sprints} backlogCount={backlogCount} backlogSprints={backlogSprints} activeBacklogId={activeBacklog?.id ?? null} onBacklogSelect={handleSprintListSelect} onSlotClick={setActiveSlot} onAllClick={handleAllClick} editingSlot={editingSlot} onSlotEdit={handleSlotEdit} onSprintSelect={handleSprintSelect} onEditClose={() => setEditingSlot(null)} onReorderSlots={handleReorderSlots} ephemeralSprintId={ephemeralSprintId} ephemeralIsActive={ephemeralIsActive} onEphemeralClick={handleEphemeralClick} activeFilterCount={activeFilterCount} savedViews={presetViews} activeViewId={f.activeViewId} onViewClick={f.handleViewClick} onSaveCurrentView={f.handleSaveView} sortField={f.sortField} sortDir={f.sortDir} onSortChange={sortChange} searchQuery={f.searchQuery} onSearchChange={f.setSearchQuery} searchCount={f.searchQuery.trim().length >= 2 ? { matched: f.searchResultCount, total: f.searchScopeCount } : undefined} filterProps={filterControlsProps} groupBy={groupBy} onGroupByChange={setGroupBy} onCreateSprint={() => setCreateSprintModalOpen(true)} onOpenSprintList={(anchor) => setBarSprintListAnchor(anchor)} groupCount={groups.length} allGroupsCollapsed={allCollapsed} onToggleCollapseAll={toggleAllGroups} />
        </div>
        {dnd.jiraRankDndEnabled && dnd.boardActiveDragId && <SprintDropZoneBar sprints={sprints} pillSlotSprints={pillSlotSprints} activeSprintId={activeSprintId} allActive={isAllView && !f.activeViewId} backlogTargetName={backlogTargetName} />}
      </div>
      <div ref={contentScrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {/* A failed ticket fetch is otherwise invisible (SWR does not throw): the
            board would just show a stale or empty list. Surface it as an inline,
            retryable banner above the still-visible content (BRDG-423). */}
        {ticketsError && !ticketsLoading && (
          <div className="px-4 pt-3">
            <div className={boardMaxW}>
              <DataErrorState error={ticketsError} onRetry={() => mutateTickets()} />
            </div>
          </div>
        )}
        {!ticketsLoading && analyticsVisible && <SprintAnalytics tickets={allTickets} onClose={() => setAnalyticsVisible(false)} sprintId={activeSprintId} />}
        {ticketsLoading && <LoadingState variant="spinner" label="Loading tickets..." className="min-h-[200px]" />}
        {!ticketsLoading && (
          // The list sits on a white surface; TicketTable renders the bordered card(s) itself —
          // one card when ungrouped, one per group when grouped (BRDG-239, BRDG-267).
          <div className="min-h-full bg-surface-elevated px-4 pb-20 pt-3">
          <div className={boardMaxW}>
          <TicketTable tickets={displayTickets} hideRowAccent warningLensActive={warningLensActive} warningLensActiveSprint={!!flatIsActiveSprint} filterSignature={filterSignature} searchActive={f.searchQuery.trim().length >= 2} checkedTickets={checkedTickets} selectedTicket={selectedTicket} focusedTicketIdx={focusedTicketIdx} someChecked={someChecked} allChecked={allChecked} visibleTags={f.visibleTags} hideEpic={hideEpicChip} showSprint={showSprintOnRow} sprintNameMap={sprintNameMap} poStatuses={poStatuses} readinessMap={readinessMap} inflightKeys={inflightKeys} onToggleCheck={toggleCheck} onRangeCheck={handleRangeCheck} onToggleAll={toggleAll} onSelectTicket={setSelectedTicket} onRowContextMenu={handleRowContextMenu} contextMenuKeys={rowMenu?.targets} onPoStatusChange={ta.handlePoStatusChange} onReadinessChange={ta.handleReadinessChange} onBusinessValueChange={ta.handleBusinessValueChange} onStoryPointsChange={ta.handleStoryPointsChange} planningOn={planningVisible} onGuestimationChange={ta.handleGuestimationChange} pencilCapacityMap={pencilCapacityMap} onPencilCapacityChange={setPencilCapacity} sprintUsedMap={sprintUsedMap} onJiraStatusChange={ta.handleJiraStatusChange} onIssueTypeChange={ta.handleIssueTypeChange} onTitleChange={ta.handleTitleChange} onAssigneeChange={ta.handleAssigneeChange} onEpicChange={ta.handleEpicChange} onSprintChange={ta.handleSprintChange} sprints={sprints} onCloseSubtasks={ta.handleCloseSubtasks} onSubtasksAdded={ta.handleSubtasksAdded} onTableKeyDown={handleTableKeyDown} onRunReview={(key) => handleBulkReviewStory(new Set([key]))} sortField={f.sortField} sortDir={f.sortDir} onMetricSort={handleMetricSort} onMetricToggleColumn={handleMetricToggleColumn} groups={groups} flatHeader={singleSprintHeader} collapsedGroups={collapsedGroups} onToggleCollapse={toggleCollapse} groupBy={groupBy} pinnedSprintIds={slotSprintsSet} onPinSprint={handleAddSlotWithSprint} onEditSprint={handleEditSprintFromGroup} onCloseSprint={handleCloseSprintFromGroup} onSyncGroup={handleSyncGroup} onCreateTicket={handleCreateTicket} freshlyCreatedKeys={freshlyCreatedKeys} statusChangeMap={statusChangeMapForTable} onStatusChangeSeen={markStatusChangeSeen} onStatusChangeMoveToBottom={handleStatusChangeMoveToBottom} showFinishedDivider={!!flatIsActiveSprint} flatCreateTarget={flatCreateTarget} flatComposerOpen={flatComposerOpen} onCloseFlatComposer={closeFlatComposer} scrollContainerRef={contentScrollRef} refinementSessionMap={ticketSessionMap} onRemoveFromRefinement={handleRemoveFromRefinement} onViewRefinement={handleViewRefinement} placeholders={placeholdersForTable} onPlaceholderUpdate={handlePlaceholderUpdate} onPlaceholderDelete={handlePlaceholderDelete} onPlaceholderPromote={handlePlaceholderPromote} onPlaceholderCreate={planningVisible ? handlePlaceholderCreate : undefined} {...(dnd.jiraRankDndEnabled ? { externalDnd: true as const, externalActiveDragId: dnd.boardActiveDragId, dragOverKey: dnd.boardOverId } : { onReorder: f.sortField === "rank" && !f.activeViewId ? handleReorder : undefined })} />
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
    return <BulkActionBar floating count={checkedTickets.size} totalCount={tickets.length} selectedPoints={sel.reduce((s, t) => s + (t.storyPoints ?? 0), 0)} selectedBV={sel.reduce((s, t) => s + (t.businessValue ?? 0), 0)} allChecked={allChecked} onToggleAll={toggleAll} onClear={() => setCheckedTickets(new Set())} onSetReadiness={handleBulkSetReadiness} onSetStatus={handleBulkSetStatus} onSetEpic={handleBulkSetEpic} onMoveSprint={handleBulkMoveSprint} quickMoves={quickMovesFor(checkedTickets)} currentSprintIds={currentSprintIdsFor(checkedTickets)} onQuickMove={(opt) => handleQuickMove(opt, checkedTickets)} onUpdateAssignee={handleBulkUpdateAssignee} onUpdateLabel={handleBulkUpdateLabels} onSetFlagged={(flagged) => handleSetFlagged(flagged)} flagState={computeFlagState(checkedTickets)} sprints={sprints} pinnedSprintIds={slotSprints} onRefreshFromJira={handleBulkRefresh} onReviewStory={handleBulkReviewStory} onCopyToClipboard={handleCopyToClipboard} onExportForStakeholders={handleExportForStakeholders} isRefreshing={bulkRefreshing} isExporting={exportTask.isActive} onGenerateSubtasks={handleBulkGenerateSubtasks} isGeneratingSubtasks={bulkGenerating} onRefine={handleRefineSelected} refinements={refinementOptions} onAddToRefinement={(id) => handleAddToRefinement(id, checkedTickets)} />;
  })();

  return (
    <>
      {pageTitle}
      <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="relative flex min-w-0 min-h-0 flex-1 flex-col overflow-hidden">
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
          <DndContext sensors={dnd.boardSensors} collisionDetection={boardCollisionDetection} measuring={{ droppable: { strategy: MeasuringStrategy.Always } }} autoScroll={{ acceleration: 25, threshold: { x: 0, y: 0.2 } }} onDragStart={dnd.handleBoardDragStart} onDragOver={dnd.handleBoardDragOver} onDragEnd={dnd.handleBoardDragEnd}>
            {boardContent}
            <DragOverlay dropAnimation={null} modifiers={[snapToPointer]}>
              {dnd.boardActiveDragTicket && <DragGhostOverlay dragTicket={dnd.boardActiveDragTicket} draggedKeys={dnd.boardDraggedKeys} tickets={tickets} targetSprintId={dnd.boardDragTargetSprintId} sprintNameMap={sprintNameMap} />}
            </DragOverlay>
          </DndContext>
        ) : boardContent}

        {/* Bulk bar: anchored to the list column (not the viewport) so it stays centered
            in the list and never overlaps the ticket detail pane when it is open. */}
        {bulkActionBar && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-50 flex justify-center pb-5 pl-20 pr-2 sm:pl-24 sm:pr-4">
            <div className="pointer-events-auto px-3 sm:px-4">{bulkActionBar}</div>
          </div>
        )}
      </div>

      {panelTicket && (() => {
        const idx = tickets.findIndex((t) => t.key === panelTicket.key);
        const adjacentKeys = { prev: idx > 0 ? tickets[idx - 1].key : null, next: idx >= 0 && idx < tickets.length - 1 ? tickets[idx + 1].key : null };
        return <SidePanel key={panelTicket.key} ticket={panelTicket} poStatus={poStatuses[panelTicket.key] ?? null} readiness={readinessMap[panelTicket.key] ?? null} onPoStatusChange={(v) => ta.handlePoStatusChange(panelTicket.key, v)} onReadinessChange={(v) => ta.handleReadinessChange(panelTicket.key, v)} onNotesChange={(notes) => { saveTicketMetadata(panelTicket.key, { poNotes: notes }, activeListKey); }} onClose={() => setSelectedTicket(null)} onShowToast={showToast} onMutate={mutateTickets} onSelectTicket={setSelectedTicket} adjacentKeys={adjacentKeys} epicActions={{ onShowOnly: handleFilterByEpic, onShowAcrossAllSprints: handleShowEpicAcrossAllSprints, onClear: handleClearEpicFilter, isFiltered: f.epicFilter.size > 0 }} />;
      })()}
      </div>

      <Toast toast={toast} loading={toastLoading} onDismiss={dismissToast} />

      <ExportToasts status={exportTask.status} output={exportTask.output} error={exportTask.error} conversationId={exportTask.conversationId} dismiss={exportTask.dismiss} showToast={showToast} />

      <SearchModal open={searchModalOpen} initialQuery={f.searchQuery} onClose={() => setSearchModalOpen(false)} onSelectTicket={(key: string) => setSelectedTicket(key)} sprintNameMap={sprintNameMap} />
      {editModalOpen && editSprint && <SprintEditModal sprint={editSprint} tickets={editSprintTickets} onClose={() => { setEditModalOpen(false); setAutoSuggest(false); setEditSprintId(null); }} showToast={showToast} autoSuggest={autoSuggest} />}
      {createSprintModalOpen && <CreateSprintModal onClose={() => setCreateSprintModalOpen(false)} onCreated={handleSprintCreated} showToast={showToast} suggestedName={suggestedSprintName} suggestedStartDate={suggestedSprintStartDate} previousSprintName={latestRegular?.sprint.name} previousSprintEndIso={latestRegular?.sprint.endDate ?? null} />}
      {quickCreate && (
        <CreateSprintModal
          onClose={closeQuickCreate}
          onCreated={confirmQuickCreate}
          showToast={showToast}
          suggestedName={quickCreate.name}
          suggestedStartDate={startDateFromPreviousEnd(planPrevSprint?.endDate)}
          previousSprintName={planPrevSprint?.name}
          previousSprintEndIso={planPrevSprint?.endDate ?? null}
        />
      )}
      {barSprintListAnchor && <SprintListModal onClose={() => setBarSprintListAnchor(null)} onSelect={handleSprintListSelect} onPin={handleAddSlotWithSprint} pinnedIds={slotSprintsSet} portalAnchor={barSprintListAnchor} />}
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
      <AddToRefinementModal open={refineModalOpen} onClose={() => setRefineModalOpen(false)} ticketKeys={refineKeys.length ? refineKeys : Array.from(checkedTickets)} onAdded={(id, name) => showToast(<span>Added to &ldquo;{name}&rdquo;{" "}<a href={`/refinement/${id}`} onClick={(e) => { e.preventDefault(); router.push(`/refinement/${id}`); }} className="font-medium text-[var(--color-brand-400)] underline underline-offset-2 hover:text-[var(--color-brand-300)]">Open refinement</a></span>, 5000)} />

      {rowMenu && (
        <CursorMenu x={rowMenu.x} y={rowMenu.y} onClose={() => setRowMenu(null)}>
          <TicketActionMenuContent
            onSetStatus={(s) => handleBulkSetStatus(s, rowMenu.targets)}
            onSetReadiness={(r) => handleBulkSetReadiness(r, rowMenu.targets)}
            onSetEpic={(epicKey, epicName) => handleBulkSetEpic(epicKey, epicName, rowMenu.targets)}
            epicValue={rowMenuEpic}
            epicSuggestTicketKey={rowMenu.targets.size === 1 ? Array.from(rowMenu.targets)[0] : undefined}
            epicClearable={rowMenu.targets.size > 1}
            onMoveSprint={(sprintId) => handleBulkMoveSprint(sprintId, rowMenu.targets)}
            quickMoves={quickMovesFor(rowMenu.targets)}
            currentSprintIds={currentSprintIdsFor(rowMenu.targets)}
            onQuickMove={(opt) => handleQuickMove(opt, rowMenu.targets)}
            onMoveToTop={!isAllView && f.sortField === "rank" ? () => handleRankToEdge(rowMenu.targets, "top") : undefined}
            onMoveToBottom={!isAllView && f.sortField === "rank" ? () => handleRankToEdge(rowMenu.targets, "bottom") : undefined}
            onUpdateAssignee={(accountId, name, avatar) => handleBulkUpdateAssignee(accountId, name, avatar, rowMenu.targets)}
            onUpdateLabel={(labels, mode) => handleBulkUpdateLabels(labels, mode, rowMenu.targets)}
            onSetFlagged={(flagged) => handleSetFlagged(flagged, rowMenu.targets)}
            flagState={computeFlagState(rowMenu.targets)}
            onReviewStory={() => handleBulkReviewStory(rowMenu.targets)}
            onGenerateSubtasks={() => handleBulkGenerateSubtasks(rowMenu.targets)}
            onRefine={() => openRefine(Array.from(rowMenu.targets))}
            refinements={refinementOptions}
            onAddToRefinement={(id) => handleAddToRefinement(id, rowMenu.targets)}
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
        onConfirm={() => { if (flagDialog) void ra.bulkSetFlagged(true, flagReason.trim() || null, flagDialog.targets); setFlagDialog(null); setFlagReason(""); }}
        extra={
          <textarea
            value={flagReason}
            onChange={(e) => setFlagReason(e.target.value)}
            placeholder="Reason (optional)..."
            rows={3}
            maxLength={2000}
            className="w-full resize-none rounded-lg border border-border-default bg-surface-base px-3 py-2 text-body-sm leading-relaxed text-text-primary placeholder:text-text-muted focus:border-[var(--color-brand-400)] focus:outline-none"
          />
        }
      />
    </div>
    </>
  );
}
