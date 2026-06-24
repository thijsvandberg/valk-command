"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { mutate as globalMutate } from "swr";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import type { TicketDetail, JiraStatus, TicketReadiness, Subtask, EpicChild, IssueType, PlaceholderTicket, Ticket } from "@/types/ticket";
import { usePlaceholders } from "@/hooks/usePlaceholders";
import { EstimatePicker } from "@/components/shared/EstimatePicker";
import { BusinessValuePicker } from "@/components/shared/BusinessValuePicker";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { SubtaskCountBadge } from "@/components/shared/IssueMetaBadges";
import { HoverRevealSlot } from "@/components/shared/HoverRevealSlot";
import { Avatar } from "@/components/shared/Avatar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Tooltip } from "@/components/shared/Tooltip";
import { Toast } from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";
import { ChildIssueRow } from "./ChildIssueRow";
import { ChildIssueComposer } from "./ChildIssueComposer";
import { ChildIssueListHeader, type ChildIssueViewMode } from "./ChildIssueListHeader";
import { EpicProgressToolbar } from "./EpicProgressToolbar";
import { EpicChildrenBySprint, type ChildReorder, type ChildMoveToPosition } from "./EpicChildrenBySprint";
import type { StatusFilter } from "./FieldFilterPopover";
import { BulkActionBar } from "@/components/sprint-board/BulkActionBar";
import { CursorMenu, TicketActionMenuContent } from "@/components/sprint-board/ticket-action-menu";
import { CreateSprintModal, type CreatedSprint } from "@/components/sprint-board/CreateSprintModal";
import { useRowActions } from "@/components/sprint-board/row-actions/useRowActions";
import { makeEpicDispatchAdapter, type RowDataAdapter } from "@/components/sprint-board/row-actions/adapter";
import { AddToRefinementModal } from "@/components/refinement-session/AddToRefinementModal";
import { nextSprintName, latestRegularSprint } from "@/lib/sprint-utils";
import { startDateFromPreviousEnd } from "@/lib/sprint-dates";
import { useSectionVisibility } from "@/hooks/useSectionVisibility";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useMigratedAccountSetting } from "@/hooks/useMigratedAccountSetting";
import { usePencilCapacity } from "@/hooks/usePencilCapacity";
import { useSprintUsedPoints } from "@/hooks/useSprintUsedPoints";
import { useJiraSprints, useSprintSlots } from "@/hooks/useSprintBoard";
import { mapJiraSprints } from "@/components/sprint-board/sprint-board-utils";
import { tickets, jira, ApiError } from "@/lib/api-client";
import { applyLocalMoves, sprintNameForTarget } from "@/lib/epic-children-move";
import { placementForMove } from "@/lib/sprint-placement";
import { useBacklogDropTarget } from "@/hooks/useBacklogDropTarget";
import { applyLocalOrder } from "@/lib/epic-children-reorder";
import { groupChildrenBySprint, isEpicChild } from "@/lib/epic-children-grouping";
import { Loader2, Search, AlertTriangle } from "lucide-react";

const EPIC_CHILD_FIELDS = [
  { id: "checkboxes", label: "checkboxes" },
  { id: "issueKey", label: "issue keys" },
  { id: "assignee", label: "assignees" },
  { id: "status", label: "status" },
  { id: "storyPoints", label: "story points" },
  { id: "businessValue", label: "business value" },
  { id: "sprint", label: "sprint" },
  { id: "subtaskCount", label: "subtask count" },
];

const DEFAULT_VISIBLE = ["checkboxes", "issueKey", "status", "storyPoints", "businessValue", "sprint", "subtaskCount"];

interface SearchResult {
  key: string;
  title: string;
  type: string;
  status: string;
  source?: "local" | "jira" | "recent";
}

interface EpicChildrenSectionProps {
  items: TicketDetail["epicChildren"];
  ticketKey: string;
  onMutate: () => void;
  // Optimistically patch a child row in the epic's detail cache so status/readiness
  // changes show instantly instead of waiting on a revalidation of the cached epic.
  onChildOptimistic?: (childKey: string, patch: Partial<EpicChild>) => void;
  onSelectTicket?: (key: string) => void;
  /** Child currently open in the SidePanel; its row renders as active (BRDG board parity). */
  activeChildKey?: string | null;
  /** Render the read-only epic roll-up (count / status distribution / SP progress)
      above the list. Used by the side panel's epic view (BRDG-131). */
  showStatsSummary?: boolean;
}

// One unified SP + guess chip per child row (BRDG-323). Holds the same slot-freeze
// as the board: while the popover is open the chip stays in its slot (placeholder
// vs inline value) so picking a guess does not remount and close the dropdown
// before you can commit.
function ChildEstimateCell({
  storyPoints,
  guestimation,
  onStoryPointsChange,
  onGuestimationChange,
  planningMode,
}: {
  storyPoints: number | null;
  guestimation: number | null;
  onStoryPointsChange: (v: number | null) => void;
  onGuestimationChange: (v: number | null) => void;
  planningMode: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [frozen, setFrozen] = useState<null | "value" | "placeholder">(null);
  const spEmpty = storyPoints == null || storyPoints === 0;
  const guessEmpty = guestimation == null || guestimation === 0;
  const estimateSet = !spEmpty || (planningMode && !guessEmpty);
  const inValue = frozen ? frozen === "value" : estimateSet;

  const picker = (
    <EstimatePicker
      storyPoints={storyPoints}
      guestimation={guestimation}
      onStoryPointsChange={onStoryPointsChange}
      onGuestimationChange={onGuestimationChange}
      planningMode={planningMode}
      onOpenChange={(o) => {
        setOpen(o);
        setFrozen(o ? (estimateSet ? "value" : "placeholder") : null);
      }}
      dense
      showMetricIcon
      richTooltip
    />
  );

  if (inValue) {
    return (
      <span className="shrink-0" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
        {picker}
      </span>
    );
  }
  return <HoverRevealSlot forceOpen={open}>{picker}</HoverRevealSlot>;
}

export function EpicChildrenSection({
  items,
  ticketKey,
  onMutate,
  onChildOptimistic,
  onSelectTicket,
  activeChildKey,
  showStatsSummary = false,
}: EpicChildrenSectionProps) {
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [error, setError] = useState<string | null>(null);
  const [jiraWarning, setJiraWarning] = useState<string | null>(null);
  const [locallyAdded, setLocallyAdded] = useState<(Subtask | EpicChild)[]>([]);
  // Optimistic sprint reassignments (childKey -> new sprint name, or null for backlog),
  // applied to the by-sprint view until the refetched children reflect the move.
  const [localMoves, setLocalMoves] = useState<Record<string, string | null>>({});
  // Optimistic within-group reorders (group bucket key -> ordered child keys),
  // applied until the refetched children's rank order confirms the new sequence.
  const [localOrder, setLocalOrder] = useState<Record<string, string[]>>({});
  // Optimistic SP/BV edits (childKey -> overridden metrics), applied immediately so
  // the badge appears on click instead of waiting for the refetch round-trip.
  const [localMetrics, setLocalMetrics] = useState<
    Record<string, { storyPoints?: number | null; businessValue?: number | null; guestimation?: number | null }>
  >({});
  // Multiselect: checked child keys for the bulk-action toolbar.
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());
  const lastCheckedRef = useRef<string | null>(null);

  // Search existing state
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchHighlight, setSearchHighlight] = useState(-1);
  const [searching, setSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // The inline create-child composer is hidden until the header "+" opens it (BRDG-315),
  // mirroring the sprint board's single-sprint create row.
  const [createOpen, setCreateOpen] = useState(false);
  const handleToggleCreate = useCallback(() => {
    setCreateOpen((v) => !v);
    setSearchMode(false);
  }, []);
  const closeCreate = useCallback(() => {
    setCreateOpen(false);
    setSearchMode(false);
  }, []);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const { visible: visibleFields, toggleField } = useSectionVisibility("epic-children", DEFAULT_VISIBLE);
  const [summaryHidden, setSummaryHidden] = useLocalStorage<boolean>("epic-stats-summary-hidden", false);
  const { value: viewMode, setValue: setViewMode } = useMigratedAccountSetting<ChildIssueViewMode>(
    "/api/settings/epic-children-view",
    "epic-children-view",
    "list",
  );
  // Forward-planning mode (BRDG-303): per-view toggle, independent from the sprint
  // board's. Off by default; reveals guestimation pickers and the fullness meter.
  const [planningOn, setPlanningOn] = useLocalStorage<boolean>("epic-children-planning-visible", false);
  const { capacityMap: pencilCapacityMap, setCapacity: setPencilCapacity } = usePencilCapacity(planningOn);
  const sprintUsedMap = useSprintUsedPoints(planningOn);
  const [hideDeprecated, setHideDeprecated] = useLocalStorage<boolean>("epic-children-hide-deprecated", true);
  const { toast, toastLoading, showToast, dismissToast } = useToast();

  // Forward-planning placeholders for this epic (BRDG-304), fetched only while
  // planning mode is on. Created placeholders carry this epic's key so they stay
  // scoped to it. Promote/edit/delete revalidate the server-computed fullness meter.
  const {
    placeholders: epicPlaceholders,
    create: createPlaceholderApi,
    update: updatePlaceholderApi,
    remove: removePlaceholderApi,
    promote: promotePlaceholderApi,
    reorder: reorderPlaceholdersApi,
  } = usePlaceholders(planningOn, { epicKey: ticketKey });
  const refreshMeter = useCallback(() => { globalMutate("/api/sprints/used-points"); }, []);
  const handlePlaceholderUpdate = useCallback((id: string, patch: Partial<PlaceholderTicket>) => {
    updatePlaceholderApi(id, patch).then(refreshMeter).catch(() => showToast("Failed to update placeholder"));
  }, [updatePlaceholderApi, refreshMeter, showToast]);
  const handlePlaceholderDelete = useCallback((id: string) => {
    removePlaceholderApi(id).then(refreshMeter).catch(() => showToast("Failed to delete placeholder"));
  }, [removePlaceholderApi, refreshMeter, showToast]);
  const handlePlaceholderCreate = useCallback((sprintId: string | null, title: string) => {
    createPlaceholderApi({ title, sprintId, epicKey: ticketKey })
      .then(refreshMeter)
      .catch(() => showToast("Failed to create placeholder"));
  }, [createPlaceholderApi, refreshMeter, showToast, ticketKey]);
  const handlePlaceholderPromote = useCallback((id: string) => {
    promotePlaceholderApi(id)
      .then((r) => { onMutate(); refreshMeter(); showToast(`Promoted to ${r.key}`); })
      .catch(() => showToast("Failed to promote placeholder"));
  }, [promotePlaceholderApi, onMutate, refreshMeter, showToast]);
  const handlePlaceholderReorder = useCallback((orderedIds: string[]) => {
    reorderPlaceholdersApi(orderedIds).then(refreshMeter).catch(() => showToast("Failed to reorder placeholder"));
  }, [reorderPlaceholdersApi, refreshMeter, showToast]);

  const { sprints: rawSprints, mutate: mutateSprints } = useJiraSprints();
  const sprints = useMemo(() => mapJiraSprints(rawSprints), [rawSprints]);
  const { backlogTargetName } = useBacklogDropTarget();
  // Prediction props for the BRDG-309 create-the-next-sprint flow, mirroring SprintBoard.
  const latestRegular = useMemo(() => latestRegularSprint(sprints), [sprints]);
  const suggestedSprintName = useMemo(() => nextSprintName(sprints), [sprints]);
  // The child stashed when the create zone is dropped on; while set, the Create
  // Sprint modal is open and its onCreated moves this child into the new sprint.
  // pendingPlanSprintName is the name the create zone predicted (the team's next
  // sprint), used to prefill the modal so it matches the zone.
  const [pendingPlanChildKey, setPendingPlanChildKey] = useState<string | null>(null);
  const [pendingPlanSprintName, setPendingPlanSprintName] = useState<string | null>(null);
  // The sprint the planned one follows: the latest existing sprint of the predicted
  // name's team, so the modal's date prediction matches the team being planned for.
  const planPrevSprint = useMemo(() => {
    if (!pendingPlanSprintName) return latestRegular;
    const team = pendingPlanSprintName.split(":")[0]?.trim();
    if (!team) return latestRegular;
    return latestRegularSprint(sprints.filter((s) => s.name.split(":")[0]?.trim() === team)) ?? latestRegular;
  }, [pendingPlanSprintName, sprints, latestRegular]);
  const { data: sprintSlots } = useSprintSlots();
  const pinnedSprintIds = useMemo(
    () => [...(sprintSlots ?? [])].sort((a, b) => a.slotIndex - b.slotIndex).map((s) => s.sprintId),
    [sprintSlots],
  );

  const mergedItems: (EpicChild | Subtask)[] = [
    ...items,
    ...locallyAdded.filter((la) => !items.some((i) => i.key === la.key)),
  ].map((item) => {
    const override = localMetrics[item.key];
    return override ? ({ ...item, ...override } as EpicChild | Subtask) : item;
  });

  // Deprecated items are treated as noise (already excluded from progress/velocity),
  // so they are hidden by default and can be revealed via the filter toggle.
  const deprecatedCount = mergedItems.filter((i) => i.jiraStatus === "DEPRECATED").length;
  const visibleItems = hideDeprecated
    ? mergedItems.filter((i) => i.jiraStatus !== "DEPRECATED")
    : mergedItems;

  const filtered = filter === "all"
    ? visibleItems
    : visibleItems.filter((i) => i.jiraStatus === filter);

  const statusCounts = {
    all: visibleItems.length,
    "TO DO": visibleItems.filter((i) => i.jiraStatus === "TO DO").length,
    "IN PROGRESS": visibleItems.filter((i) => i.jiraStatus === "IN PROGRESS").length,
    DONE: visibleItems.filter((i) => i.jiraStatus === "DONE").length,
  };

  const isFiltered = filter !== "all" || (hideDeprecated && deprecatedCount > 0);

  // Breakdown behind the "X of Y items" count badge, surfaced in its tooltip: how many
  // children the status filter hides vs. how many are hidden because deprecated.
  const deprecatedHiddenCount = hideDeprecated ? deprecatedCount : 0;
  const statusHiddenCount = visibleItems.length - filtered.length;

  // The count badge toggles the child set: from any filtered view it shows everything;
  // clicking again restores the default view (deprecated hidden, no status filter).
  const showingAll = filter === "all" && !hideDeprecated;
  const handleToggleFilter = useCallback(() => {
    setFilter("all");
    setHideDeprecated(showingAll);
  }, [showingAll, setHideDeprecated]);

  // --- Create child issue ---

  // Create a child issue, optionally targeted at a sprint. The optimistic placeholder
  // carries the group's sprintName so the new row lands in the right sprint card
  // immediately (the API returns a bare Subtask), and the sprintId is forwarded so
  // Jira assigns the issue to that sprint. New children start at readiness "drafting"
  // (set server-side too), so the pill shows up the moment the row appears.
  const handleCreate = useCallback(
    (title: string, jiraType: string, target?: { sprintId: string | null; sprintName: string | null }) => {
      const trimmed = title.trim();
      if (!trimmed) return;

      const type = jiraType.toLowerCase() as IssueType;
      const placeholderKey = `pending-${Date.now()}`;
      const placeholder: EpicChild = {
        key: placeholderKey,
        title: trimmed,
        type,
        jiraStatus: "TO DO",
        assignee: null,
        flagged: false,
        sprintName: target?.sprintName ?? null,
        storyPoints: null,
        businessValue: null,
        subtaskCount: 0,
        readiness: "drafting",
        jiraRank: null,
      };
      setLocallyAdded((prev) => [...prev, placeholder]);
      setError(null);

      const sprintId = target?.sprintId ?? undefined;
      tickets.createChildIssue(ticketKey, { title: trimmed, issueType: jiraType, ...(sprintId ? { sprintId } : {}) })
        .then((created) => {
          setLocallyAdded((prev) =>
            prev.map((i) =>
              i.key === placeholderKey
                ? ({ ...created, sprintName: target?.sprintName ?? null, storyPoints: null, businessValue: null, subtaskCount: 0, readiness: "drafting", jiraRank: null } as EpicChild)
                : i,
            ),
          );
          showToast(`${created.key} created`);
          onMutate();
        })
        .catch((err) => {
          setLocallyAdded((prev) => prev.filter((i) => i.key !== placeholderKey));
          const detail = err instanceof ApiError ? err.message : "Jira API error";
          setError(`Failed to create child issue: ${detail}`);
          console.error("Failed to create child issue:", err);
        });
    },
    [ticketKey, onMutate, showToast],
  );

  // --- Search existing ---

  const existingKeys = useMemo(() => new Set(mergedItems.map((i) => i.key)), [mergedItems]);
  // Child key -> current sprint NAME (local-move overlay wins over the server value),
  // for the BRDG-369 quick-move options.
  const sprintNameByKey = useMemo(() => {
    const map: Record<string, string | null> = {};
    mergedItems.forEach((i) => {
      map[i.key] = i.key in localMoves ? localMoves[i.key] : (isEpicChild(i) ? i.sprintName : null);
    });
    return map;
  }, [mergedItems, localMoves]);

  const doSearch = useCallback((q: string) => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchAbortRef.current?.abort();

    if (q.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    searchDebounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      searchAbortRef.current = controller;
      try {
        const { results: data } = await tickets.searchForLink(q, ticketKey, undefined, controller.signal);
        const filtered = data.filter((r: SearchResult) => r.key !== ticketKey && !existingKeys.has(r.key));
        setSearchResults(filtered);
        setSearchHighlight(-1);
        setSearching(false);

        if (filtered.length < 5) {
          setTimeout(async () => {
            try {
              const { results: fullData } = await tickets.searchForLinkWithJira(q, ticketKey, undefined, controller.signal);
              setSearchResults(fullData.filter((r: SearchResult) => r.key !== ticketKey && !existingKeys.has(r.key)));
            } catch { /* ignore aborted */ }
          }, 300);
        }
      } catch {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 250);
  }, [ticketKey, existingKeys]);

  const handleSearchChange = useCallback((value: string) => {
    const urlMatch = value.match(/atlassian\.net\/browse\/([A-Z][A-Z0-9]+-\d+)/i);
    const cleaned = urlMatch ? urlMatch[1].toUpperCase() : value;
    setSearchQuery(cleaned);
    setError(null);
    doSearch(cleaned);
  }, [doSearch]);

  const handleLinkExisting = useCallback((result: SearchResult) => {
    const placeholder: Subtask = {
      key: result.key,
      title: result.title,
      type: (result.type || "task") as IssueType,
      jiraStatus: (result.status || "TO DO") as JiraStatus,
      assignee: null,
    };
    setLocallyAdded((prev) => [...prev, placeholder]);
    setSearchQuery("");
    setSearchResults([]);
    setSearchMode(false);
    setError(null);

    tickets.updateEpic(result.key, ticketKey)
      .then(() => {
        showToast(`${result.key} linked`);
        onMutate();
      })
      .catch((err) => {
        setLocallyAdded((prev) => prev.filter((i) => i.key !== result.key));
        const detail = err instanceof ApiError ? err.message : "Jira API error";
        setError(`Failed to link ${result.key}: ${detail}`);
        console.error("Failed to link existing issue:", err);
      });
  }, [ticketKey, onMutate, showToast]);

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSearchHighlight((h) => Math.min(h + 1, searchResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSearchHighlight((h) => Math.max(h - 1, -1));
    } else if (e.key === "Enter" && searchHighlight >= 0 && searchResults[searchHighlight]) {
      e.preventDefault();
      handleLinkExisting(searchResults[searchHighlight]);
    } else if (e.key === "Escape") {
      setSearchQuery("");
      setSearchResults([]);
      setSearchMode(false);
    }
  }, [searchHighlight, searchResults, handleLinkExisting]);

  const closeSearch = useCallback(() => {
    setSearchMode(false);
    setSearchQuery("");
    setSearchResults([]);
    setSearchHighlight(-1);
  }, []);

  useOutsideClick(searchContainerRef, closeSearch, { enabled: searchMode, escapeClose: false });

  useEffect(() => {
    if (searchMode) searchInputRef.current?.focus();
  }, [searchMode]);

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      searchAbortRef.current?.abort();
    };
  }, []);

  const handleJiraStatusChange = useCallback(async (childKey: string, status: JiraStatus) => {
    setJiraWarning(null);
    // Patch the child row optimistically: the status write hits the child's own
    // endpoint, and a bare revalidation can still return the cached epic detail.
    onChildOptimistic?.(childKey, { jiraStatus: status });
    try {
      const res = await fetch(`/api/tickets/${encodeURIComponent(childKey)}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) {
        setJiraWarning(data.error ?? "Failed to update status");
        onMutate(); // revalidate to roll back the optimistic patch
        return;
      }
      if (data.jiraWarning) {
        setJiraWarning(`${childKey}: status updated locally, but Jira sync failed`);
      }
      if (!onChildOptimistic) onMutate();
    } catch (err) {
      console.error("Failed to update status:", err);
      setJiraWarning("Failed to update status");
      onMutate(); // revalidate to roll back the optimistic patch
    }
  }, [onMutate, onChildOptimistic]);

  const handleReadinessChange = useCallback(async (childKey: string, readiness: TicketReadiness | null) => {
    onChildOptimistic?.(childKey, { readiness });
    try {
      await tickets.updateMetadata(childKey, { readiness });
      if (!onChildOptimistic) onMutate();
    } catch (err) {
      console.error("Failed to update readiness:", err);
      onMutate(); // revalidate to roll back the optimistic patch
    }
  }, [onMutate, onChildOptimistic]);

  // Drop one optimistic metric override, removing the child entry when empty.
  const revertLocalMetric = useCallback((childKey: string, field: "storyPoints" | "businessValue" | "guestimation") => {
    setLocalMetrics((prev) => {
      const entry = prev[childKey];
      if (!entry || !(field in entry)) return prev;
      const next = { ...prev };
      const updated = { ...entry };
      delete updated[field];
      if (Object.keys(updated).length === 0) delete next[childKey];
      else next[childKey] = updated;
      return next;
    });
  }, []);

  const handleStoryPointsChange = useCallback(async (childKey: string, value: number | null) => {
    setJiraWarning(null);
    setLocalMetrics((prev) => ({ ...prev, [childKey]: { ...prev[childKey], storyPoints: value } }));
    try {
      await tickets.updateStoryPoints(childKey, value);
      onMutate();
      // The fullness meter's sprint total is a separate server read; revalidate it so
      // the count (and over-capacity colour) reflects the new points without a refresh.
      refreshMeter();
    } catch (err) {
      console.error("Failed to update story points:", err);
      revertLocalMetric(childKey, "storyPoints");
      setJiraWarning(`Failed to update story points for ${childKey}`);
    }
  }, [onMutate, revertLocalMetric, refreshMeter]);

  const handleBusinessValueChange = useCallback(async (childKey: string, value: number | null) => {
    setLocalMetrics((prev) => ({ ...prev, [childKey]: { ...prev[childKey], businessValue: value } }));
    try {
      await tickets.updateMetadata(childKey, { businessValue: value });
      onMutate();
    } catch (err) {
      console.error("Failed to update business value:", err);
      revertLocalMetric(childKey, "businessValue");
      setJiraWarning(`Failed to update business value for ${childKey}`);
    }
  }, [onMutate, revertLocalMetric]);

  const handleGuestimationChange = useCallback(async (childKey: string, value: number | null) => {
    setLocalMetrics((prev) => ({ ...prev, [childKey]: { ...prev[childKey], guestimation: value } }));
    try {
      await tickets.updateMetadata(childKey, { guestimation: value });
      onMutate();
      // See handleStoryPointsChange: keep the fullness meter's sprint total in sync.
      refreshMeter();
    } catch (err) {
      console.error("Failed to update guestimation:", err);
      revertLocalMetric(childKey, "guestimation");
      setJiraWarning(`Failed to update guestimation for ${childKey}`);
    }
  }, [onMutate, revertLocalMetric, refreshMeter]);

  // Move a child to another sprint (drag-drop or context menu). Optimistically
  // re-groups the row, then reverts and warns if the Jira round-trip fails.
  const handleMoveChild = useCallback((childKey: string, targetSprintId: string) => {
    const newName = sprintNameForTarget(targetSprintId, sprints);
    setJiraWarning(null);
    setLocalMoves((prev) => ({ ...prev, [childKey]: newName }));
    // Placement rule (BRDG-370): backlog / in-flight -> top, regular sprint -> bottom.
    const position = placementForMove(newName);
    jira.moveSprint({ issueKeys: [childKey], targetSprintId, position })
      .then(() => onMutate())
      .catch((err) => {
        setLocalMoves((prev) => {
          const next = { ...prev };
          delete next[childKey];
          return next;
        });
        const detail = err instanceof ApiError ? err.message : "Jira API error";
        setJiraWarning(`Failed to move ${childKey} to sprint: ${detail}`);
        console.error("Failed to move child to sprint:", err);
      });
  }, [sprints, onMutate]);

  // BRDG-309: dropping onto the create zone stashes the child (and the predicted
  // sprint name) and opens the Create Sprint modal. Cancelling clears the stash.
  const handlePlanNextSprint = useCallback((childKey: string, suggestedName?: string) => {
    setPendingPlanChildKey(childKey);
    setPendingPlanSprintName(suggestedName ?? null);
  }, []);

  // The modal created the sprint. Move the stashed child into it, then refetch +
  // confirm. The created sprint's name comes straight from the modal (not a list
  // refetch), so the optimistic re-group and toast work even though the shared
  // sprint cache lags in dev (see project_turbopack_cache_invalidate). We also patch
  // the sprint-list cache so the new sprint renders with metadata and BRDG-306 takes
  // over for later drags. If the move fails after the create, it is reported honestly.
  const handlePlanSprintCreated = useCallback(
    async (sprint: CreatedSprint) => {
      const childKey = pendingPlanChildKey;
      setPendingPlanChildKey(null);
      setPendingPlanSprintName(null);
      if (!childKey) return;
      setJiraWarning(null);

      // Inject the just-created sprint into the cached list so its group has dates/state.
      void mutateSprints(
        (cur) =>
          cur && !cur.sprints.some((s) => s.id === sprint.id)
            ? { ...cur, sprints: [...cur.sprints, { id: sprint.id, name: sprint.name, state: sprint.state, startDate: sprint.startDate, endDate: sprint.endDate, goal: sprint.goal }] }
            : cur,
        { revalidate: false },
      );

      // Optimistically re-group the child under the new sprint's name right away.
      setLocalMoves((prev) => ({ ...prev, [childKey]: sprint.name }));
      try {
        await jira.moveSprint({ issueKeys: [childKey], targetSprintId: String(sprint.id) });
        onMutate();
        showToast(`Moved ${childKey} into ${sprint.name}`);
      } catch (err) {
        setLocalMoves((prev) => {
          const next = { ...prev };
          delete next[childKey];
          return next;
        });
        const detail = err instanceof ApiError ? err.message : "Jira API error";
        setJiraWarning(`Sprint created, but moving ${childKey} into it failed: ${detail}`);
        console.error("Failed to move child into the newly created sprint:", err);
      }
    },
    [pendingPlanChildKey, mutateSprints, onMutate, showToast],
  );

  // Reorder a child within its sprint group via Jira rank (drag-to-reorder).
  // Optimistically applies the new within-group order, then reverts and warns if
  // the Jira round-trip fails. The sprint id (resolved from the group's name) lets
  // the rank route refresh local ranks; it is omitted for the Unscheduled group.
  const handleReorderChild = useCallback(
    ({ activeKey, groupKey, sprintName, newOrder, rankBeforeKey, rankAfterKey }: ChildReorder) => {
      setJiraWarning(null);
      setLocalOrder((prev) => ({ ...prev, [groupKey]: newOrder }));
      const sprintId = sprintName === null ? undefined : sprints.find((s) => s.name === sprintName)?.id;
      jira.rank({ issueKeys: [activeKey], rankBeforeKey, rankAfterKey, ...(sprintId ? { sprintId } : {}) })
        .then(() => onMutate())
        .catch((err) => {
          setLocalOrder((prev) => {
            const next = { ...prev };
            delete next[groupKey];
            return next;
          });
          const detail = err instanceof ApiError ? err.message : "Jira API error";
          setJiraWarning(`Failed to reorder ${activeKey}: ${detail}`);
          console.error("Failed to reorder child:", err);
        });
    },
    [sprints, onMutate],
  );

  // Move a child into another sprint AND land it at a specific position in one drop.
  // Dropped onto a row -> rank relative to that row. Dropped onto a sprint/backlog zone
  // or header (toTop) -> the server ranks it to the very top, so no row anchor is sent.
  // Optimistically re-groups the row and sets the target group's order, reverting on error.
  const handleMoveChildToPosition = useCallback(
    ({ activeKey, targetSprintId, targetGroupKey, targetSprintName, newOrder, rankBeforeKey, rankAfterKey, toTop }: ChildMoveToPosition) => {
      setJiraWarning(null);
      setLocalMoves((prev) => ({ ...prev, [activeKey]: targetSprintName }));
      setLocalOrder((prev) => ({ ...prev, [targetGroupKey]: newOrder }));
      // The backlog has no sprint id to refresh local ranks against, so omit it there.
      const rankSprintId = targetSprintName === null ? undefined : targetSprintId;
      // Dropped onto a zone/header (toTop): the placement rule decides the edge
      // (BRDG-370) - backlog / in-flight to the top, a regular sprint to the bottom.
      // Dropped onto a specific row: rank relative to that row (explicit position).
      const persist = toTop
        ? jira.moveSprint({ issueKeys: [activeKey], targetSprintId, position: placementForMove(targetSprintName) })
        : jira.moveSprint({ issueKeys: [activeKey], targetSprintId })
            .then(() => jira.rank({ issueKeys: [activeKey], rankBeforeKey, rankAfterKey, ...(rankSprintId ? { sprintId: rankSprintId } : {}) }));
      persist
        .then(() => onMutate())
        .catch((err) => {
          setLocalMoves((prev) => {
            const next = { ...prev };
            delete next[activeKey];
            return next;
          });
          setLocalOrder((prev) => {
            const next = { ...prev };
            delete next[targetGroupKey];
            return next;
          });
          const detail = err instanceof ApiError ? err.message : "Jira API error";
          setJiraWarning(`Failed to move ${activeKey} to sprint: ${detail}`);
          console.error("Failed to move child to position:", err);
        });
    },
    [onMutate],
  );

  // Drop optimistic overrides once the refetched children confirm the new sprint,
  // so a stale override never masks server truth on later syncs.
  useEffect(() => {
    // Reconciles the optimistic overlay against freshly-refetched server data; a
    // genuine external-data sync, not a render-derivable reset (BRDG-374).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalMoves((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      let changed = false;
      const next = { ...prev };
      for (const item of items) {
        if (item.key in next) {
          const serverName = isEpicChild(item) ? item.sprintName : null;
          if (serverName === next[item.key]) {
            delete next[item.key];
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [items]);

  // Drop a reorder override once the refetched children's rank order matches it for
  // that group, so a stale override never masks server truth on later syncs.
  useEffect(() => {
    // Reconciles the optimistic reorder against refetched rank order (external sync).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalOrder((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      const serverGroups = groupChildrenBySprint(items, sprints);
      let changed = false;
      const next = { ...prev };
      for (const [groupKey, order] of Object.entries(prev)) {
        const group = serverGroups.find((g) => g.key === groupKey);
        if (!group) continue;
        const serverKeys = group.items.filter((i) => !i.key.startsWith("pending-")).map((i) => i.key);
        if (serverKeys.length === order.length && serverKeys.every((k, i) => k === order[i])) {
          delete next[groupKey];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [items, sprints]);

  // Drop optimistic SP/BV overrides once the refetched children confirm the value,
  // so a stale override never masks server truth on later syncs.
  useEffect(() => {
    // Reconciles the optimistic SP/BV overrides against refetched values (external sync).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalMetrics((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      let changed = false;
      const next = { ...prev };
      for (const item of items) {
        const entry = next[item.key];
        if (!entry || !isEpicChild(item)) continue;
        const updated = { ...entry };
        if ("storyPoints" in updated && item.storyPoints === updated.storyPoints) {
          delete updated.storyPoints;
          changed = true;
        }
        if ("businessValue" in updated && item.businessValue === updated.businessValue) {
          delete updated.businessValue;
          changed = true;
        }
        if (Object.keys(updated).length === 0) delete next[item.key];
        else next[item.key] = updated;
      }
      return changed ? next : prev;
    });
  }, [items]);

  // --- Multiselect (bulk actions) ---
  // The visible order differs between views (groups reorder rows), so range-select
  // walks the rendered order of the active view.
  const orderedVisibleKeys = useMemo(() => {
    const base = applyLocalOrder(applyLocalMoves(filtered, localMoves), localOrder).filter((i) => !i.key.startsWith("pending-"));
    if (viewMode === "sprint") {
      return groupChildrenBySprint(base, sprints).flatMap((g) => g.items.map((i) => i.key));
    }
    return base.map((i) => i.key);
  }, [filtered, localMoves, localOrder, viewMode, sprints]);

  // The selection-checkbox column is itself a toggleable "field"; when hidden,
  // rows lose their checkbox and bulk selection is suppressed.
  const selectionEnabled = visibleFields.has("checkboxes");
  const someChecked = selectionEnabled && checkedKeys.size > 0;
  const allChecked = orderedVisibleKeys.length > 0 && orderedVisibleKeys.every((k) => checkedKeys.has(k));

  const handleCheckboxClick = useCallback((key: string, e: React.MouseEvent) => {
    if (e.shiftKey && lastCheckedRef.current) {
      const a = orderedVisibleKeys.indexOf(lastCheckedRef.current);
      const b = orderedVisibleKeys.indexOf(key);
      if (a !== -1 && b !== -1) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        const range = orderedVisibleKeys.slice(lo, hi + 1);
        setCheckedKeys((prev) => { const next = new Set(prev); range.forEach((k) => next.add(k)); return next; });
        lastCheckedRef.current = key;
        return;
      }
    }
    setCheckedKeys((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
    lastCheckedRef.current = key;
  }, [orderedVisibleKeys]);

  const toggleAll = useCallback(() => {
    setCheckedKeys(allChecked ? new Set() : new Set(orderedVisibleKeys));
  }, [allChecked, orderedVisibleKeys]);

  // Select-all-in-sprint: add or remove an entire sprint group's keys at once. Anchors
  // the next shift-click to the last key touched so range-select continues naturally.
  const selectGroup = useCallback((keys: string[], select: boolean) => {
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      if (select) keys.forEach((k) => next.add(k));
      else keys.forEach((k) => next.delete(k));
      return next;
    });
    if (select && keys.length > 0) lastCheckedRef.current = keys[keys.length - 1];
  }, []);

  const clearSelection = useCallback(() => {
    setCheckedKeys(new Set());
    lastCheckedRef.current = null;
  }, []);

  const checkedItems = mergedItems.filter((i) => checkedKeys.has(i.key));
  const selectedPoints = checkedItems.reduce((s, i) => s + (isEpicChild(i) ? (i.storyPoints ?? 0) : 0), 0);
  const selectedBV = checkedItems.reduce((s, i) => s + (isEpicChild(i) ? (i.businessValue ?? 0) : 0), 0);

  // Shared row-actions dispatch (BRDG-374). The epic adapter reflects status/readiness
  // through onChildOptimistic and overlays sprint moves on the by-sprint grouping
  // (localMoves), confirming or rolling them back on the closing revalidation. DnD
  // moves/reorders and the create-zone plan-sprint flow stay in this host.
  const adapter = useMemo(() => {
    const ticketFor = (item: EpicChild | Subtask): Ticket => ({
      key: item.key,
      title: item.title,
      type: item.type,
      jiraStatus: item.jiraStatus,
      flagged: isEpicChild(item) ? Boolean(item.flagged) : false,
      sprintId: (sprintNameByKey[item.key] ?? null) ?? undefined,
      epic: null,
      epicKey: null,
      storyPoints: isEpicChild(item) ? (item.storyPoints ?? null) : null,
      businessValue: null,
      assignee: item.assignee ?? null,
      qualityScore: null,
      readiness: isEpicChild(item) ? (item.readiness ?? null) : null,
      poStatus: null,
      editState: "clean",
      notes: "",
    } as Ticket);
    const data: RowDataAdapter = {
      getTicket: (key) => { const i = mergedItems.find((x) => x.key === key); return i ? ticketFor(i) : undefined; },
      getTickets: () => mergedItems.map(ticketFor),
      mutate: onMutate,
      activeListKey: null,
      sprintNameMap: {},
    };
    return makeEpicDispatchAdapter(data, { setLocalMoves }, onChildOptimistic);
  }, [mergedItems, sprintNameByKey, onMutate, onChildOptimistic]);

  const ra = useRowActions({
    adapter,
    selectedKeys: checkedKeys,
    sprints,
    pinnedSprintIds,
    backlogTargetName,
    showToast,
    flagSource: "ticket",
    currentSprintName: (key) => sprintNameByKey[key] ?? null,
    onMoveError: setJiraWarning,
    injectSprint: (sprint) =>
      mutateSprints(
        (cur) =>
          cur && !cur.sprints.some((s) => s.id === sprint.id)
            ? { ...cur, sprints: [...cur.sprints, { id: sprint.id, name: sprint.name, state: sprint.state, startDate: sprint.startDate, endDate: sprint.endDate, goal: sprint.goal }] }
            : cur,
        { revalidate: false },
      ),
  });
  const { rowMenu } = ra;

  // --- Render metadata slot for a child issue ---
  // hideSprint drops the sprint pill where the surrounding group already names the
  // sprint (the by-sprint view), avoiding a redundant per-row badge.
  function renderMetadata(child: EpicChild | Subtask, hideSprint = false) {
    const epic = isEpicChild(child) ? child : null;
    // SP/BV placement (BRDG-310): metrics keep their natural order (SP then BV). An
    // empty metric reserves no space and surfaces only on row hover (HoverRevealSlot);
    // a set value renders inline in the same slot.
    const bvPicker = epic && (
      <BusinessValuePicker
        value={epic.businessValue}
        onChange={(v) => handleBusinessValueChange(child.key, v)}
        dense
        showMetricIcon
        richTooltip
      />
    );
    const metricCell = (node: React.ReactNode) => (
      <span
        className="shrink-0"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {node}
      </span>
    );
    return (
      <>
        {/* Estimate (SP + guess) as ONE chip, then BV (BRDG-323). Empty -> hover-reveal
            slot, set -> inline. N/A (value 0) is treated like unset so the resting list
            stays calm; only real estimates keep an inline badge (BRDG-310). */}
        {visibleFields.has("storyPoints") && epic && (
          <ChildEstimateCell
            storyPoints={epic.storyPoints}
            guestimation={epic.guestimation ?? null}
            onStoryPointsChange={(v) => handleStoryPointsChange(child.key, v)}
            onGuestimationChange={(v) => handleGuestimationChange(child.key, v)}
            planningMode={planningOn}
          />
        )}
        {visibleFields.has("businessValue") && epic && (
          epic.businessValue == null || epic.businessValue === 0 ? <HoverRevealSlot>{bvPicker}</HoverRevealSlot> : metricCell(bvPicker)
        )}
        {visibleFields.has("subtaskCount") && epic && (
          <SubtaskCountBadge open={epic.openSubtaskCount ?? 0} total={epic.totalSubtaskCount ?? epic.subtaskCount} />
        )}
        {!hideSprint && visibleFields.has("sprint") && epic?.sprintName && (
          <Tooltip content={epic.sprintName}>
            <span className="shrink-0 max-w-[100px] truncate rounded-md bg-overlay-subtle px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
              {epic.sprintName}
            </span>
          </Tooltip>
        )}
        {visibleFields.has("assignee") && <Avatar assignee={child.assignee} size={24} />}
      </>
    );
  }

  const childRows = filtered.map((child, idx) => {
    const epic = isEpicChild(child) ? child : null;
    const isPending = child.key.startsWith("pending-");
    return (
      <ChildIssueRow
        key={child.key}
        item={child}
        isLast={idx === filtered.length - 1}
        isPending={isPending}
        showTypeIcon
        showKey={visibleFields.has("issueKey")}
        showStatus={visibleFields.has("status")}
        readiness={epic?.readiness}
        editState={epic?.editState}
        onJiraStatusChange={(s) => handleJiraStatusChange(child.key, s)}
        onReadinessChange={(r) => handleReadinessChange(child.key, r)}
        onSelect={onSelectTicket}
        onContextMenu={isPending ? undefined : (e) => { e.preventDefault(); ra.handleRowContextMenu(child.key, e); }}
        selectable={selectionEnabled}
        isChecked={checkedKeys.has(child.key)}
        isActive={child.key === activeChildKey}
        flagged={!!epic?.flagged}
        someChecked={someChecked}
        onCheckboxClick={(e) => handleCheckboxClick(child.key, e)}
        metadataSlot={renderMetadata(child)}
      />
    );
  });

  // Inline input row: search mode swaps the whole row for the search field; create
  // mode delegates to the shared ChildIssueComposer (no sprint target here).
  const borderTopClass = viewMode === "list" && filtered.length > 0 ? "border-t border-border-subtle" : "";
  const inlineInput = searchMode ? (
    <div
      ref={searchContainerRef}
      className={`relative flex items-center gap-3 px-3 py-2 ${borderTopClass}`}
      onClick={(e) => e.stopPropagation()}
    >
      <Search size={14} className="shrink-0 text-text-muted" />
      <input
        ref={searchInputRef}
        type="text"
        value={searchQuery}
        onChange={(e) => handleSearchChange(e.target.value)}
        onKeyDown={handleSearchKeyDown}
        placeholder="Search by key or title..."
        className="min-w-0 flex-1 bg-transparent text-body-lg text-text-primary placeholder:text-text-muted outline-none"
      />
      {searching && <Loader2 size={14} className="shrink-0 animate-spin text-text-muted" />}
      <button
        type="button"
        onClick={closeSearch}
        className="cursor-pointer text-body-sm text-text-muted transition-colors duration-150 hover:text-text-secondary"
      >
        Cancel
      </button>

      {searchResults.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border border-border-default bg-[var(--color-surface-elevated)] shadow-[0_4px_12px_rgba(0,0,0,0.12),0_1px_3px_rgba(0,0,0,0.08)]">
          {searchResults.map((r, idx) => (
            <button
              key={r.key}
              type="button"
              onClick={() => handleLinkExisting(r)}
              className={`flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition-colors duration-150 hover:bg-overlay-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:bg-overlay-subtle/80 ${
                idx === searchHighlight ? "bg-overlay-subtle" : ""
              } ${idx < searchResults.length - 1 ? "border-b border-border-subtle" : ""}`}
            >
              <IssueTypeIcon type={(r.type || "task") as IssueType} size={14} />
              <span className="font-mono text-body-sm text-[var(--color-brand-400)]">{r.key}</span>
              <span className="min-w-0 flex-1 truncate text-body-lg text-text-secondary">{r.title}</span>
              <StatusBadge status={(r.status || "TO DO") as JiraStatus} />
              {r.source === "jira" && (
                <span className="rounded bg-overlay-subtle px-1.5 py-0.5 text-[10px] font-medium text-text-muted">Jira</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  ) : (
    <ChildIssueComposer
      variant="bar"
      autoFocus
      onCreate={(title, jiraType) => handleCreate(title, jiraType)}
      onEscapeEmpty={closeCreate}
      placeholder="Create child issue..."
      trailing={
        <button
          type="button"
          onClick={() => setSearchMode(true)}
          className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-text-muted transition-colors duration-150 hover:bg-overlay-subtle hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
          title="Link existing issue"
        >
          <Search size={12} strokeWidth={1.5} />
          <span className="hidden text-body-sm font-medium sm:inline">Link existing</span>
        </button>
      }
    />
  );

  const listContent = (
    <div className="mt-3">
      {filtered.length > 0 && (
        <div className={`overflow-hidden rounded-lg border border-border-default ${createOpen ? "rounded-b-none border-b-0" : ""}`}>
          {childRows}
        </div>
      )}
      {createOpen && (
        <div className={`overflow-hidden rounded-lg border border-border-default ${filtered.length > 0 ? "rounded-t-none border-t-0" : ""}`}>
          {inlineInput}
        </div>
      )}
    </div>
  );

  const sprintContent = (
    <div className="mt-3 flex flex-col gap-3">
      <EpicChildrenBySprint
        items={applyLocalOrder(applyLocalMoves(filtered, localMoves), localOrder)}
        sprints={sprints}
        ticketKey={ticketKey}
        visibleFields={visibleFields}
        renderMetadata={renderMetadata}
        activeChildKey={activeChildKey}
        onJiraStatusChange={handleJiraStatusChange}
        onReadinessChange={handleReadinessChange}
        onSelect={onSelectTicket}
        onMoveChild={handleMoveChild}
        onRowContextMenu={ra.handleRowContextMenu}
        onReorderChild={handleReorderChild}
        onMoveChildToPosition={handleMoveChildToPosition}
        onMoveError={setJiraWarning}
        onPlanNextSprint={handlePlanNextSprint}
        onCreateChild={(target, title, jiraType) => handleCreate(title, jiraType, target)}
        checkedKeys={checkedKeys}
        someChecked={someChecked}
        onCheckboxClick={selectionEnabled ? handleCheckboxClick : undefined}
        onSelectGroup={selectionEnabled ? selectGroup : undefined}
        planningOn={planningOn}
        pencilCapacityMap={pencilCapacityMap}
        onPencilCapacityChange={setPencilCapacity}
        sprintUsedMap={sprintUsedMap}
        placeholders={epicPlaceholders}
        onPlaceholderUpdate={handlePlaceholderUpdate}
        onPlaceholderDelete={handlePlaceholderDelete}
        onPlaceholderPromote={handlePlaceholderPromote}
        onPlaceholderCreate={planningOn ? handlePlaceholderCreate : undefined}
        onPlaceholderReorder={handlePlaceholderReorder}
      />
      {createOpen && (
        <div className="overflow-hidden rounded-lg border border-border-default">
          {inlineInput}
        </div>
      )}
    </div>
  );

  const content = viewMode === "sprint" ? sprintContent : listContent;

  return (
    <div className="mt-8">
      <EpicProgressToolbar
        items={mergedItems}
        filteredCount={filtered.length}
        totalCount={mergedItems.length}
        isFiltered={isFiltered}
        statusHiddenCount={statusHiddenCount}
        deprecatedHiddenCount={deprecatedHiddenCount}
        deprecatedCount={deprecatedCount}
        onToggleFilter={handleToggleFilter}
        showStats={showStatsSummary}
        hidden={summaryHidden}
        actions={
          <ChildIssueListHeader
            isFiltered={isFiltered}
            filter={filter}
            setFilter={setFilter}
            statusCounts={statusCounts}
            fields={EPIC_CHILD_FIELDS}
            visibleFields={visibleFields}
            onToggleField={(id, show) => {
              toggleField(id, show);
              if (id === "checkboxes" && !show) setCheckedKeys(new Set());
            }}
            hideDeprecated={hideDeprecated}
            onToggleHideDeprecated={setHideDeprecated}
            deprecatedCount={deprecatedCount}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            summaryHidden={summaryHidden}
            onToggleSummary={showStatsSummary ? () => setSummaryHidden((v) => !v) : undefined}
            onToggleCreate={handleToggleCreate}
            createOpen={createOpen}
            planningOn={planningOn}
            onTogglePlanning={() => setPlanningOn((v) => !v)}
          />
        }
      />

      {error && (
        <p className="mt-2 text-body-sm text-red-400/80">{error}</p>
      )}

      {jiraWarning && (
        <div className="mt-2 flex items-center gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-body-sm text-amber-300/90">
          <AlertTriangle size={14} className="shrink-0" />
          <span className="flex-1">{jiraWarning}</span>
          <button type="button" onClick={() => setJiraWarning(null)} className="shrink-0 text-amber-400/60 hover:text-amber-300 cursor-pointer">
            &times;
          </button>
        </div>
      )}

      {filtered.length > 0 ? (
        content
      ) : mergedItems.length > 0 ? (
        <>
          <p className="mt-3 text-body-lg text-text-muted">No child issues matching this filter</p>
          {content}
        </>
      ) : (
        content
      )}

      {someChecked && (
        <BulkActionBar
          floating
          count={checkedKeys.size}
          totalCount={orderedVisibleKeys.length}
          selectedPoints={selectedPoints}
          selectedBV={selectedBV}
          allChecked={allChecked}
          onToggleAll={toggleAll}
          onClear={clearSelection}
          onSetStatus={ra.bulkSetStatus}
          onSetReadiness={ra.bulkSetReadiness}
          onSetEpic={(epicKey) => ra.bulkSetEpic(epicKey)}
          onMoveSprint={(sprintId) => ra.moveSprint(sprintId)}
          quickMoves={ra.quickMovesFor(checkedKeys)}
          currentSprintIds={ra.currentSprintIdsFor(checkedKeys)}
          onQuickMove={(opt) => ra.handleQuickMove(opt, checkedKeys)}
          onUpdateAssignee={ra.bulkUpdateAssignee}
          onUpdateLabel={ra.bulkUpdateLabels}
          onSetFlagged={(flagged) => ra.bulkSetFlagged(flagged, null)}
          flagState={ra.computeFlagState(checkedKeys)}
          sprints={sprints}
          pinnedSprintIds={pinnedSprintIds}
          onReviewStory={() => ra.handleBulkReview()}
          onGenerateSubtasks={() => ra.handleBulkGenerate()}
          isGeneratingSubtasks={ra.isGeneratingSubtasks}
          onCopyToClipboard={() => ra.copySelected()}
          onRefine={() => ra.openRefine([...checkedKeys])}
        />
      )}

      {rowMenu && (
        <CursorMenu x={rowMenu.x} y={rowMenu.y} onClose={() => ra.setRowMenu(null)}>
          <TicketActionMenuContent
            onSetStatus={(s) => ra.bulkSetStatus(s, rowMenu.targets)}
            onSetReadiness={(r) => ra.bulkSetReadiness(r, rowMenu.targets)}
            onSetEpic={(epicKey) => ra.bulkSetEpic(epicKey, null, rowMenu.targets)}
            epicSuggestTicketKey={rowMenu.targets.size === 1 ? [...rowMenu.targets][0] : undefined}
            epicClearable
            onMoveSprint={(sprintId) => ra.moveSprint(sprintId, rowMenu.targets)}
            quickMoves={ra.quickMovesFor(rowMenu.targets)}
            currentSprintIds={ra.currentSprintIdsFor(rowMenu.targets)}
            onQuickMove={(opt) => ra.handleQuickMove(opt, rowMenu.targets)}
            onUpdateAssignee={(accountId, name) => ra.bulkUpdateAssignee(accountId, name, rowMenu.targets)}
            onUpdateLabel={(labels, mode) => ra.bulkUpdateLabels(labels, mode, rowMenu.targets)}
            onSetFlagged={(flagged) => ra.bulkSetFlagged(flagged, null, rowMenu.targets)}
            flagState={ra.computeFlagState(rowMenu.targets)}
            onReviewStory={() => ra.handleBulkReview(rowMenu.targets)}
            onGenerateSubtasks={() => ra.handleBulkGenerate(rowMenu.targets)}
            onRefine={() => ra.openRefine([...rowMenu.targets])}
            sprints={sprints}
            pinnedSprintIds={pinnedSprintIds}
            close={() => ra.setRowMenu(null)}
          />
        </CursorMenu>
      )}

      <AddToRefinementModal
        open={ra.refineModalOpen}
        onClose={() => ra.setRefineModalOpen(false)}
        ticketKeys={ra.refineKeys}
        onAdded={(_id, name) => showToast(`Added ${ra.refineKeys.length} issue${ra.refineKeys.length === 1 ? "" : "s"} to "${name}"`)}
      />

      {pendingPlanChildKey && (
        <CreateSprintModal
          onClose={() => { setPendingPlanChildKey(null); setPendingPlanSprintName(null); }}
          onCreated={handlePlanSprintCreated}
          showToast={showToast}
          suggestedName={pendingPlanSprintName ?? suggestedSprintName}
          suggestedStartDate={startDateFromPreviousEnd(planPrevSprint?.sprint.endDate)}
          previousSprintName={planPrevSprint?.sprint.name}
          previousSprintEndIso={planPrevSprint?.sprint.endDate ?? null}
        />
      )}

      {ra.quickCreate && (
        <CreateSprintModal
          onClose={ra.closeQuickCreate}
          onCreated={ra.confirmQuickCreate}
          showToast={showToast}
          suggestedName={ra.quickCreate.name}
          suggestedStartDate={startDateFromPreviousEnd(ra.planPrevSprint?.endDate)}
          previousSprintName={ra.planPrevSprint?.name}
          previousSprintEndIso={ra.planPrevSprint?.endDate ?? null}
        />
      )}

      <Toast toast={toast} loading={toastLoading} onDismiss={dismissToast} />
    </div>
  );
}
