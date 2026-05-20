"use client";

import { useState, useCallback, useMemo } from "react";
import type { Ticket, TicketReadiness } from "@/types/ticket";
import type { SortField, SortDir, ColumnId, SavedView } from "@/components/sprint-board/FilterBar";
import { DEFAULT_VISIBLE } from "@/components/sprint-board/FilterBar";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useSearchParams, useRouter } from "next/navigation";
import { extractTeamPrefix } from "@/lib/sprint-utils";

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

export function useSprintBoardFilters(
  allTickets: Ticket[],
  readinessMap: Record<string, TicketReadiness | null>,
  isAllView: boolean,
  poPriorityOrder: string[] | null,
  externalVisible?: Set<ColumnId>,
  externalOrder?: ColumnId[],
  onApplyColumnConfig?: (visible: ColumnId[], order: ColumnId[]) => void,
  sprintNameMap?: Record<string, string>,
) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [storedFilters, setStoredFilters] = useLocalStorage<StoredFilters>("sprint-board-filters", defaultFilters);
  const [storedSort, setStoredSort] = useLocalStorage<StoredSort>("sprint-board-sort", { field: "rank", direction: "asc" });
  const [storedColumns, setStoredColumns] = useLocalStorage<ColumnId[]>("sprint-board-columns", [...DEFAULT_VISIBLE]);
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

  const visibleColumns = useMemo(() => externalVisible ?? new Set(storedColumns), [externalVisible, storedColumns]);
  const setVisibleColumns = useCallback((updater: (prev: Set<ColumnId>) => Set<ColumnId>) => {
    setStoredColumns((prev) => [...updater(new Set(prev))]);
  }, [setStoredColumns]);

  const statusOptions = useMemo(() => [...new Set(allTickets.map((t) => t.jiraStatus))], [allTickets]);
  const epicOptions = useMemo(() => [...new Set(allTickets.map((t) => t.epic).filter(Boolean) as string[])], [allTickets]);
  const assigneeOptions = useMemo(() => [...new Set(allTickets.map((t) => t.assignee?.name).filter(Boolean) as string[])], [allTickets]);
  const sprintOptions = useMemo(
    () => [...new Set(allTickets.map((t) => t.sprintId).filter(Boolean) as string[])],
    [allTickets],
  );
  const issueTypeOptions = useMemo(() => [...new Set(allTickets.map((t) => t.type))], [allTickets]);

  const teamOptions = useMemo(() => {
    if (!sprintNameMap) return [];
    const prefixes = new Set<string>();
    for (const t of allTickets) {
      if (!t.sprintId) continue;
      const name = sprintNameMap[t.sprintId];
      if (!name) continue;
      const prefix = extractTeamPrefix(name);
      if (prefix) prefixes.add(prefix);
    }
    return [...prefixes].sort();
  }, [allTickets, sprintNameMap]);

  const filteredTickets = useMemo(() => {
    const showRemoved = editStateFilter.has("removed");
    return allTickets.filter((t) => {
      const isRemoved = Boolean(t.removedFromJiraAt);

      // Deleted tickets always pass through (shown with DELETED badge);
      // when the "removed" filter is active exclusively, hide non-removed tickets
      if (!isRemoved && editStateFilter.size === 1 && showRemoved) return false;

      if (statusFilter.size > 0 && !statusFilter.has(t.jiraStatus)) return false;
      if (epicFilter.size > 0 && (!t.epic || !epicFilter.has(t.epic))) return false;
      if (assigneeFilter.size > 0) {
        const name = t.assignee?.name;
        if (!name || !assigneeFilter.has(name)) return false;
      }
      if (readinessFilter.size > 0) {
        const current = readinessMap[t.key] ?? null;
        const matches = current === null ? readinessFilter.has("none") : readinessFilter.has(current);
        if (!matches) return false;
      }
      if (editStateFilter.size > 0) {
        const effectiveState = isRemoved ? "removed" : t.editState;
        if (!editStateFilter.has(effectiveState)) return false;
      }
      if (issueTypeFilter.size > 0 && !issueTypeFilter.has(t.type)) return false;
      if (gapsFilter.size > 0) {
        if (gapsFilter.has("no_points") && (t.storyPoints != null || t.jiraStatus === "DEPRECATED" || t.type === "spike")) return false;
        if (gapsFilter.has("no_bv") && t.businessValue != null && t.businessValue >= 1) return false;
      }
      if (isAllView && sprintFilter.size > 0 && !sprintFilter.has(t.sprintId ?? "")) return false;
      if (teamFilter.size > 0) {
        const sprintName = t.sprintId ? sprintNameMap?.[t.sprintId] : undefined;
        const prefix = sprintName ? extractTeamPrefix(sprintName) : null;
        if (!prefix || !teamFilter.has(prefix)) return false;
      }
      if (searchQuery.trim().length >= 2) {
        const q = searchQuery.toLowerCase();
        const matchesKey = t.key.toLowerCase().includes(q);
        const matchesTitle = t.title.toLowerCase().includes(q);
        const matchesAssignee = t.assignee?.name?.toLowerCase().includes(q) ?? false;
        if (!matchesKey && !matchesTitle && !matchesAssignee) return false;
      }
      return true;
    });
  }, [allTickets, statusFilter, epicFilter, assigneeFilter, readinessFilter, editStateFilter, issueTypeFilter, readinessMap, isAllView, sprintFilter, teamFilter, sprintNameMap, searchQuery, gapsFilter]);

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

  const handleColumnToggle = useCallback((id: ColumnId, show: boolean) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (show) next.add(id);
      else next.delete(id);
      return next;
    });
  }, [setVisibleColumns]);

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

  const handleSaveView = useCallback((title: string) => {
    const columnConfig = externalVisible && externalOrder
      ? { visible: [...externalVisible], order: [...externalOrder] }
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
      const params = new URLSearchParams(searchParams.toString());
      params.set("view", id);
      router.replace(`?${params.toString()}`, { scroll: false });
    }
  }, [activeViewId, currentFiltersSnapshot, sortField, sortDir, externalVisible, externalOrder, setSavedViews, searchParams, router]);

  const handleViewClick = useCallback((view: SavedView) => {
    setStoredFilters({
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
      onApplyColumnConfig(view.columnConfig.visible, view.columnConfig.order);
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", view.id);
    params.delete("sprint");
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [setStoredFilters, setStoredSort, onApplyColumnConfig, searchParams, router]);

  const handleDeleteView = useCallback((id: string) => {
    setSavedViews((prev) => prev.filter((v) => v.id !== id));
    if (activeViewId === id) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("view");
      router.replace(`?${params.toString()}`, { scroll: false });
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
    visibleColumns,
    setVisibleColumns,
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
    handleSaveView,
    handleViewClick,
    handleDeleteView,
  };
}
