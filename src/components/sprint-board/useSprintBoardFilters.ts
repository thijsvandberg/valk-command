"use client";

import { useState, useCallback, useMemo } from "react";
import type { Ticket, TicketReadiness } from "@/types/ticket";
import type { SortField, SortDir, InlineTagId, SavedView } from "@/components/sprint-board/FilterBar";
import { DEFAULT_VISIBLE_TAGS, columnsToTags } from "@/components/sprint-board/FilterBar";
import { SPRINT_STATE_FILTER_PREFIX, SPRINT_STATE_CLOSED, isSprintStateFilter } from "@/components/sprint-board/filter-bar-types";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useSearchParams, useRouter } from "next/navigation";
import { extractTeamPrefix, buildBoardUrl, ALL_SPRINT_SLUG } from "@/lib/sprint-utils";

export interface StoredFilters {
  status: string[];
  epic: string[];
  assignee: string[];
  readiness: string[];
  editState: string[];
  issueType: string[];
  gaps: string[];
  team: string[];
  sprint: string[];
}

export interface StoredSort {
  field: SortField;
  direction: SortDir;
}

const defaultFilters: StoredFilters = { status: [], epic: [], assignee: [], readiness: [], editState: [], issueType: [], gaps: [], team: [], sprint: [] };

// Every sprint a ticket belongs to. A multi-sprint ticket matches a sprint filter
// or team filter when ANY of its sprints qualifies. Falls back to the single
// primary sprint for tickets synced before sprint_ids existed.
function ticketSprintIds(t: Ticket): string[] {
  if (t.sprintIds && t.sprintIds.length > 0) return t.sprintIds;
  return t.sprintId ? [t.sprintId] : [];
}

export function useSprintBoardFilters(
  allTickets: Ticket[],
  readinessMap: Record<string, TicketReadiness | null>,
  isAllView: boolean,
  poPriorityOrder: string[] | null,
  externalVisible?: Set<InlineTagId>,
  onApplyColumnConfig?: (visibleTags: InlineTagId[]) => void,
  sprintNameMap?: Record<string, string>,
  sprintStateMap?: Record<string, string>,
) {
  const searchParams = useSearchParams();
  const router = useRouter();

  // The All view keeps its own remembered filter set (team/sprint/status/etc.) so returning to
  // All restores the last selection across sessions, while sprint views share a working set that
  // is cleared on navigation. The active store is chosen by view, so all the getters/setters below
  // read and write the correct one transparently.
  const [sprintViewFilters, setSprintViewFilters] = useLocalStorage<StoredFilters>("sprint-board-filters", defaultFilters);
  const [allViewFilters, setAllViewFilters] = useLocalStorage<StoredFilters>("sprint-board-all-filters", defaultFilters);
  const storedFilters = isAllView ? allViewFilters : sprintViewFilters;
  const setStoredFilters = isAllView ? setAllViewFilters : setSprintViewFilters;
  const [storedSort, setStoredSort] = useLocalStorage<StoredSort>("sprint-board-sort", { field: "rank", direction: "asc" });
  const [storedColumns, setStoredColumns] = useLocalStorage<InlineTagId[]>("sprint-board-row-fields", [...DEFAULT_VISIBLE_TAGS]);
  const [savedViews, setSavedViews] = useLocalStorage<SavedView[]>("sprint-board-saved-views", []);
  const [searchQuery, setSearchQuery] = useState("");

  const statusFilter = useMemo(() => new Set(storedFilters.status), [storedFilters.status]);
  const epicFilter = useMemo(() => new Set(storedFilters.epic), [storedFilters.epic]);
  const assigneeFilter = useMemo(() => new Set(storedFilters.assignee), [storedFilters.assignee]);
  const readinessFilter = useMemo(() => new Set(storedFilters.readiness ?? []), [storedFilters.readiness]);
  const editStateFilter = useMemo(() => new Set(storedFilters.editState ?? []), [storedFilters.editState]);
  const issueTypeFilter = useMemo(() => new Set(storedFilters.issueType ?? []), [storedFilters.issueType]);
  const gapsFilter = useMemo(() => new Set(storedFilters.gaps ?? []), [storedFilters.gaps]);
  const teamFilter = useMemo(() => new Set(storedFilters.team ?? []), [storedFilters.team]);
  const sprintFilter = useMemo(() => new Set(storedFilters.sprint ?? []), [storedFilters.sprint]);

  const setStatusFilter = useCallback((v: Set<string>) => {
    setStoredFilters((prev) => ({ ...prev, status: [...v] }));
  }, [setStoredFilters]);
  const setEpicFilter = useCallback((v: Set<string>) => {
    setStoredFilters((prev) => ({ ...prev, epic: [...v] }));
  }, [setStoredFilters]);
  const setAssigneeFilter = useCallback((v: Set<string>) => {
    setStoredFilters((prev) => ({ ...prev, assignee: [...v] }));
  }, [setStoredFilters]);
  const setReadinessFilter = useCallback((v: Set<string>) => {
    setStoredFilters((prev) => ({ ...prev, readiness: [...v] }));
  }, [setStoredFilters]);
  const setEditStateFilter = useCallback((v: Set<string>) => {
    setStoredFilters((prev) => ({ ...prev, editState: [...v] }));
  }, [setStoredFilters]);
  const setIssueTypeFilter = useCallback((v: Set<string>) => {
    setStoredFilters((prev) => ({ ...prev, issueType: [...v] }));
  }, [setStoredFilters]);
  const setGapsFilter = useCallback((v: Set<string>) => {
    setStoredFilters((prev) => ({ ...prev, gaps: [...v] }));
  }, [setStoredFilters]);
  const setTeamFilter = useCallback((v: Set<string>) => {
    setStoredFilters((prev) => ({ ...prev, team: [...v] }));
  }, [setStoredFilters]);
  const setSprintFilter = useCallback((v: Set<string>) => {
    setStoredFilters((prev) => ({ ...prev, sprint: [...v] }));
  }, [setStoredFilters]);

  const activeViewId = searchParams.get("view");
  const activeView = activeViewId ? (savedViews.find((v) => v.id === activeViewId) ?? null) : null;

  const sortField = storedSort.field;
  const sortDir = storedSort.direction;
  const setSortField = useCallback((f: SortField) => {
    setStoredSort((prev) => ({ ...prev, field: f }));
  }, [setStoredSort]);
  const setSortDir = useCallback((d: SortDir) => {
    setStoredSort((prev) => ({ ...prev, direction: d }));
  }, [setStoredSort]);

  const visibleTags = useMemo(() => externalVisible ?? new Set(storedColumns), [externalVisible, storedColumns]);
  const setVisibleTags = useCallback((updater: (prev: Set<InlineTagId>) => Set<InlineTagId>) => {
    setStoredColumns((prev) => [...updater(new Set(prev))]);
  }, [setStoredColumns]);

  const statusOptions = useMemo(() => {
    const opts = [...new Set(allTickets.map((t) => t.jiraStatus))] as string[];
    // DELETED is not a real Jira status; surface it as a pseudo-status so the PO can
    // opt deleted tickets back into view (they are hidden by default, see coreFiltered).
    if (allTickets.some((t) => t.removedFromJiraAt)) opts.push("DELETED");
    return opts;
  }, [allTickets]);
  const epicOptions = useMemo(() => [...new Set(allTickets.map((t) => t.epic).filter(Boolean) as string[])], [allTickets]);
  const assigneeOptions = useMemo(() => [...new Set(allTickets.map((t) => t.assignee?.name).filter(Boolean) as string[])], [allTickets]);
  const sprintOptions = useMemo(
    () => [...new Set(allTickets.flatMap((t) => ticketSprintIds(t)))],
    [allTickets],
  );
  const issueTypeOptions = useMemo(() => [...new Set(allTickets.map((t) => t.type))], [allTickets]);

  const teamOptions = useMemo(() => {
    if (!sprintNameMap) return [];
    const prefixes = new Set<string>();
    for (const t of allTickets) {
      for (const sid of ticketSprintIds(t)) {
        const name = sprintNameMap[sid];
        if (!name) continue;
        const prefix = extractTeamPrefix(name);
        if (prefix) prefixes.add(prefix);
      }
    }
    return [...prefixes].sort();
  }, [allTickets, sprintNameMap]);

  // Layered filter memos: each stage only recalculates when its specific filter changes.
  // When only the search query changes, only the final search memo reruns.
  const coreFiltered = useMemo(() => {
    const showRemoved = editStateFilter.has("removed");
    const wantsDeleted = statusFilter.has("DELETED");
    return allTickets.filter((t) => {
      const isRemoved = Boolean(t.removedFromJiraAt);
      if (!isRemoved && editStateFilter.size === 1 && showRemoved) return false;
      // Deleted tickets are hidden by default. They reappear only when explicitly
      // requested, either via the DELETED status or the "Removed from Jira" change filter.
      if (isRemoved && !wantsDeleted && !showRemoved) return false;
      // A removed ticket's effective status is DELETED, overriding its stale Jira status.
      if (statusFilter.size > 0) {
        const effectiveStatus = isRemoved ? "DELETED" : t.jiraStatus;
        if (!statusFilter.has(effectiveStatus)) return false;
      }
      if (epicFilter.size > 0 && (!t.epic || !epicFilter.has(t.epic))) return false;
      if (assigneeFilter.size > 0) {
        const name = t.assignee?.name;
        if (!name || !assigneeFilter.has(name)) return false;
      }
      if (editStateFilter.size > 0) {
        const effectiveState = isRemoved ? "removed" : t.editState;
        if (!editStateFilter.has(effectiveState)) return false;
      }
      if (issueTypeFilter.size > 0 && !issueTypeFilter.has(t.type)) return false;
      return true;
    });
  }, [allTickets, statusFilter, epicFilter, assigneeFilter, editStateFilter, issueTypeFilter]);

  const metaFiltered = useMemo(() => {
    if (readinessFilter.size === 0 && gapsFilter.size === 0) return coreFiltered;
    return coreFiltered.filter((t) => {
      if (readinessFilter.size > 0) {
        const current = readinessMap[t.key] ?? null;
        const matches = current === null ? readinessFilter.has("none") : readinessFilter.has(current);
        if (!matches) return false;
      }
      if (gapsFilter.size > 0) {
        if (gapsFilter.has("no_points") && (t.storyPoints != null || t.jiraStatus === "DEPRECATED" || t.type === "spike")) return false;
        if (gapsFilter.has("no_bv") && t.businessValue != null && t.businessValue >= 1) return false;
      }
      return true;
    });
  }, [coreFiltered, readinessFilter, readinessMap, gapsFilter]);

  // The Sprint filter mixes two kinds of values: individual sprint ids and special
  // sprint-state buckets (active/future/closed, BRDG-259). A ticket is in scope when its
  // sprint is explicitly selected by id, OR its sprint's state matches a selected bucket.
  // The id and state selections are a union, so an explicitly chosen sprint is always shown
  // regardless of the state buckets.
  const selectedSprintStates = useMemo(
    () => new Set([...sprintFilter].filter(isSprintStateFilter).map((v) => v.slice(SPRINT_STATE_FILTER_PREFIX.length))),
    [sprintFilter],
  );
  const selectedSprintIds = useMemo(
    () => new Set([...sprintFilter].filter((v) => !isSprintStateFilter(v))),
    [sprintFilter],
  );

  const scopeFiltered = useMemo(() => {
    const sprintScopeActive = isAllView && sprintFilter.size > 0;
    if (!sprintScopeActive && teamFilter.size === 0) return metaFiltered;
    return metaFiltered.filter((t) => {
      const sprintIds = ticketSprintIds(t);
      if (sprintScopeActive) {
        // A multi-sprint ticket is in scope when ANY of its sprints is selected by id
        // or matches a selected state bucket. Cache-dropped sprints carry no state, so
        // they are treated as closed to match the grouped view (older sprints surface
        // only under the Closed bucket).
        const match = sprintIds.some((sid) => {
          const state = sprintStateMap?.[sid] ?? "closed";
          return selectedSprintIds.has(sid) || selectedSprintStates.has(state);
        });
        if (!match) return false;
      }
      if (teamFilter.size > 0) {
        const match = sprintIds.some((sid) => {
          const sprintName = sprintNameMap?.[sid];
          const prefix = sprintName ? extractTeamPrefix(sprintName) : null;
          return prefix ? teamFilter.has(prefix) : false;
        });
        if (!match) return false;
      }
      return true;
    });
  }, [metaFiltered, isAllView, sprintFilter, teamFilter, sprintNameMap, sprintStateMap, selectedSprintIds, selectedSprintStates]);

  // Grouped-view visibility (BRDG-259): closed sprint groups are hidden by default but
  // revealed when the Closed bucket is selected; explicitly selected sprint ids are always
  // shown even if closed (they survive the hide-closed default in the grouping layer).
  const includeClosedSprints = sprintFilter.has(SPRINT_STATE_CLOSED);
  const forceShowSprintIds = useMemo(() => [...selectedSprintIds], [selectedSprintIds]);

  const filteredTickets = useMemo(() => {
    if (searchQuery.trim().length < 2) return scopeFiltered;
    const q = searchQuery.toLowerCase();
    return scopeFiltered.filter((t) => {
      return t.key.toLowerCase().includes(q)
        || t.title.toLowerCase().includes(q)
        || (t.assignee?.name?.toLowerCase().includes(q) ?? false);
    });
  }, [scopeFiltered, searchQuery]);

  const sortedTickets = useMemo(() => {
    if (sortField === "rank") {
      if (poPriorityOrder && poPriorityOrder.length > 0) {
        const orderMap = new Map(poPriorityOrder.map((key, idx) => [key, idx]));
        const sorted = [...filteredTickets];
        sorted.sort((a, b) => {
          const aIdx = orderMap.get(a.key) ?? Infinity;
          const bIdx = orderMap.get(b.key) ?? Infinity;
          return aIdx - bIdx;
        });
        return sorted;
      }
      const sorted = [...filteredTickets];
      sorted.sort((a, b) => (a.jiraRank ?? Infinity) - (b.jiraRank ?? Infinity));
      return sorted;
    }
    const sorted = [...filteredTickets];
    const dir = sortDir === "asc" ? 1 : -1;

    sorted.sort((a, b) => {
      switch (sortField) {
        case "quality": {
          const aScore = a.qualityScore ?? -1;
          const bScore = b.qualityScore ?? -1;
          return (aScore - bScore) * dir;
        }
        case "bv": {
          const aBv = a.businessValue ?? -1;
          const bBv = b.businessValue ?? -1;
          return (aBv - bBv) * dir;
        }
        case "points": {
          const aPts = a.storyPoints ?? -1;
          const bPts = b.storyPoints ?? -1;
          return (aPts - bPts) * dir;
        }
        case "key":
          return a.key.localeCompare(b.key) * dir;
        case "title":
          return a.title.localeCompare(b.title) * dir;
        case "epic":
          return (a.epic ?? "").localeCompare(b.epic ?? "") * dir;
        case "jiraStatus":
          return a.jiraStatus.localeCompare(b.jiraStatus) * dir;
        case "assignee":
          return (a.assignee?.name ?? "").localeCompare(b.assignee?.name ?? "") * dir;
        case "readiness": {
          const aR = readinessMap[a.key] ?? "";
          const bR = readinessMap[b.key] ?? "";
          return aR.localeCompare(bR) * dir;
        }
        case "lastChanged": {
          const aDate = a.jiraUpdatedAt ?? "";
          const bDate = b.jiraUpdatedAt ?? "";
          return (aDate as string).localeCompare(bDate as string) * dir;
        }
        default:
          return 0;
      }
    });
    return sorted;
  }, [filteredTickets, sortField, sortDir, poPriorityOrder, readinessMap]);

  const hasActiveFilters = statusFilter.size > 0 || epicFilter.size > 0 || assigneeFilter.size > 0 || readinessFilter.size > 0 || editStateFilter.size > 0 || issueTypeFilter.size > 0 || sprintFilter.size > 0 || teamFilter.size > 0 || gapsFilter.size > 0;

  const handleColumnToggle = useCallback((id: InlineTagId, show: boolean) => {
    setVisibleTags((prev) => {
      const next = new Set(prev);
      if (show) next.add(id);
      else next.delete(id);
      return next;
    });
  }, [setVisibleTags]);

  const currentFiltersSnapshot = useCallback(() => ({
    status: [...statusFilter],
    epic: [...epicFilter],
    assignee: [...assigneeFilter],
    readiness: [...readinessFilter],
    editState: [...editStateFilter],
    issueType: [...issueTypeFilter],
    gaps: [...gapsFilter],
    team: [...teamFilter],
    sprint: [...sprintFilter],
  }), [statusFilter, epicFilter, assigneeFilter, readinessFilter, editStateFilter, issueTypeFilter, gapsFilter, teamFilter, sprintFilter]);

  const resetFilters = useCallback(() => {
    setStoredFilters({ status: [], epic: [], assignee: [], readiness: [], editState: [], issueType: [], gaps: [], team: [], sprint: [] });
  }, [setStoredFilters]);

  // Navigation clears only the sprint working set; the All view's remembered filters are left
  // untouched so they survive switching sprints and reopen when the PO returns to All.
  const resetSprintViewFilters = useCallback(() => {
    setSprintViewFilters({ status: [], epic: [], assignee: [], readiness: [], editState: [], issueType: [], gaps: [], team: [], sprint: [] });
  }, [setSprintViewFilters]);

  const handleSaveView = useCallback((title: string) => {
    const columnConfig = externalVisible
      ? { visibleTags: [...externalVisible] }
      : undefined;
    if (activeViewId) {
      setSavedViews((prev) => prev.map((v) =>
        v.id === activeViewId
          ? { ...v, title, filters: currentFiltersSnapshot(), sort: { field: sortField, direction: sortDir }, columnConfig }
          : v
      ));
    } else {
      const id = crypto.randomUUID();
      setSavedViews((prev) => [...prev, { id, title, filters: currentFiltersSnapshot(), sort: { field: sortField, direction: sortDir }, columnConfig }]);
      // A saved view is always an All-view-with-filters (activeSprintId resolves to
      // __all__ whenever `view` is set), so the sprint slug becomes `all` and any open
      // ticket is dropped from the path (BRDG-270).
      const params = new URLSearchParams(searchParams.toString());
      params.set("view", id);
      router.replace(buildBoardUrl(ALL_SPRINT_SLUG, null, params.toString()), { scroll: false });
    }
  }, [activeViewId, currentFiltersSnapshot, sortField, sortDir, externalVisible, setSavedViews, searchParams, router]);

  const handleViewClick = useCallback((view: SavedView) => {
    // A saved view always lands on the All view, so write straight to the All-view store
    // regardless of the current view (avoids depending on isAllView having flipped yet).
    setAllViewFilters({
      status: view.filters.status,
      epic: view.filters.epic,
      assignee: view.filters.assignee,
      // Support legacy saved views that stored poStatus before the rename.
      readiness: view.filters.readiness ?? view.filters.poStatus ?? [],
      editState: view.filters.editState ?? [],
      issueType: view.filters.issueType ?? [],
      gaps: view.filters.gaps ?? [],
      team: view.filters.team ?? [],
      sprint: view.filters.sprint ?? [],
    });
    setStoredSort({ field: view.sort.field, direction: view.sort.direction });
    if (view.columnConfig && onApplyColumnConfig) {
      const tags = view.columnConfig.visibleTags
        ?? (view.columnConfig.visible ? columnsToTags(view.columnConfig.visible) : undefined);
      if (tags) onApplyColumnConfig(tags);
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", view.id);
    router.replace(buildBoardUrl(ALL_SPRINT_SLUG, null, params.toString()), { scroll: false });
  }, [setAllViewFilters, setStoredSort, onApplyColumnConfig, searchParams, router]);

  const handleDeleteView = useCallback((id: string) => {
    setSavedViews((prev) => prev.filter((v) => v.id !== id));
    if (activeViewId === id) {
      // Drop back to the slugless board so it resolves to the default sprint.
      const params = new URLSearchParams(searchParams.toString());
      params.delete("view");
      router.replace(buildBoardUrl(null, null, params.toString()), { scroll: false });
    }
  }, [setSavedViews, activeViewId, searchParams, router]);

  return {
    storedFilters,
    setStoredFilters,
    storedSort,
    setStoredSort,
    statusFilter,
    epicFilter,
    assigneeFilter,
    readinessFilter,
    editStateFilter,
    issueTypeFilter,
    setStatusFilter,
    setEpicFilter,
    setAssigneeFilter,
    setReadinessFilter,
    setEditStateFilter,
    setIssueTypeFilter,
    sprintFilter,
    setSprintFilter,
    includeClosedSprints,
    forceShowSprintIds,
    teamFilter,
    setTeamFilter,
    teamOptions,
    searchQuery,
    setSearchQuery,
    gapsFilter,
    setGapsFilter,
    savedViews,
    setSavedViews,
    activeViewId,
    activeView,
    sortField,
    sortDir,
    setSortField,
    setSortDir,
    visibleTags,
    setVisibleTags,
    handleColumnToggle,
    statusOptions,
    epicOptions,
    assigneeOptions,
    sprintOptions,
    issueTypeOptions,
    filteredTickets,
    sortedTickets,
    hasActiveFilters,
    currentFiltersSnapshot,
    resetFilters,
    resetSprintViewFilters,
    handleSaveView,
    handleViewClick,
    handleDeleteView,
  };
}
