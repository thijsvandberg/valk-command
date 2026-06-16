"use client";

import { useCallback, useMemo, useState } from "react";
import { useMigratedAccountSetting } from "@/hooks/useMigratedAccountSetting";
import { extractTeamPrefix } from "@/lib/sprint-utils";
import type { NewStoryRow } from "@/lib/new-stories-types";
import type { FilterControlsPanelProps } from "@/components/sprint-board/FilterControlsPanel";
import {
  INBOX_DEFAULT_VISIBLE_TAGS,
  INBOX_DEFAULT_SORT,
  type InlineTagId,
  type SortField,
  type SortDir,
} from "@/components/sprint-board/filter-bar-types";

// Stored inbox filter set (BRDG-357). Only the inbox whitelist categories; no
// readiness/editState/gaps, which the inbox does not surface.
export interface StoredInboxFilters {
  status: string[];
  epic: string[];
  assignee: string[];
  issueType: string[];
  team: string[];
  sprint: string[];
}

const DEFAULT_FILTERS: StoredInboxFilters = { status: [], epic: [], assignee: [], issueType: [], team: [], sprint: [] };
const DEFAULT_TAGS: InlineTagId[] = [...INBOX_DEFAULT_VISIBLE_TAGS];

// The inbox filter categories, in display order. Drives the FilterControlsPanel
// whitelist so Readiness/Changes/Gaps never appear.
const INBOX_CATEGORIES = ["status", "epic", "assignee", "type", "team", "sprint"];

function uniqueSorted(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))].sort((a, b) => a.localeCompare(b));
}

/**
 * Filter/sort/search + display state for the New story inbox (BRDG-357). Reuses
 * the board's filter UI primitives but persists under inbox-specific settings
 * keys, so the board's filters/display/sort are never touched. Operates on the
 * lighter NewStoryRow, with no sprint-state/rank/quality machinery.
 */
export function useInboxFilters(rows: NewStoryRow[]) {
  const { value: stored, setValue: setStored } = useMigratedAccountSetting<StoredInboxFilters>(
    "/api/settings/inbox-filters",
    "inbox-filters",
    DEFAULT_FILTERS,
  );
  const { value: storedTags, setValue: setStoredTags } = useMigratedAccountSetting<InlineTagId[]>(
    "/api/settings/inbox-row-fields",
    "inbox-row-fields",
    DEFAULT_TAGS,
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>(INBOX_DEFAULT_SORT.field);
  const [sortDir, setSortDir] = useState<SortDir>(INBOX_DEFAULT_SORT.direction);

  const statusFilter = useMemo(() => new Set(stored.status), [stored.status]);
  const epicFilter = useMemo(() => new Set(stored.epic), [stored.epic]);
  const assigneeFilter = useMemo(() => new Set(stored.assignee), [stored.assignee]);
  const issueTypeFilter = useMemo(() => new Set(stored.issueType), [stored.issueType]);
  const teamFilter = useMemo(() => new Set(stored.team), [stored.team]);
  const sprintFilter = useMemo(() => new Set(stored.sprint), [stored.sprint]);

  const setStatusFilter = useCallback((v: Set<string>) => setStored((p) => ({ ...p, status: [...v] })), [setStored]);
  const setEpicFilter = useCallback((v: Set<string>) => setStored((p) => ({ ...p, epic: [...v] })), [setStored]);
  const setAssigneeFilter = useCallback((v: Set<string>) => setStored((p) => ({ ...p, assignee: [...v] })), [setStored]);
  const setIssueTypeFilter = useCallback((v: Set<string>) => setStored((p) => ({ ...p, issueType: [...v] })), [setStored]);
  const setTeamFilter = useCallback((v: Set<string>) => setStored((p) => ({ ...p, team: [...v] })), [setStored]);
  const setSprintFilter = useCallback((v: Set<string>) => setStored((p) => ({ ...p, sprint: [...v] })), [setStored]);

  const visibleTags = useMemo(() => new Set(storedTags), [storedTags]);
  const handleColumnToggle = useCallback((id: InlineTagId, show: boolean) => {
    setStoredTags((prev) => {
      const next = new Set(prev);
      if (show) next.add(id);
      else next.delete(id);
      return [...next];
    });
  }, [setStoredTags]);
  const resetColumns = useCallback(() => setStoredTags([...DEFAULT_TAGS]), [setStoredTags]);

  const statusOptions = useMemo(() => uniqueSorted(rows.map((r) => r.jiraStatus)), [rows]);
  const epicOptions = useMemo(() => uniqueSorted(rows.map((r) => r.epic)), [rows]);
  const assigneeOptions = useMemo(() => uniqueSorted(rows.map((r) => r.assignee?.name)), [rows]);
  const issueTypeOptions = useMemo(() => uniqueSorted(rows.map((r) => r.type)), [rows]);
  const teamOptions = useMemo(
    () => uniqueSorted(rows.map((r) => (r.sprintName ? extractTeamPrefix(r.sprintName) : null))),
    [rows],
  );
  const sprintOptions = useMemo(() => uniqueSorted(rows.map((r) => r.sprintName)), [rows]);
  // The inbox filters sprints by display name; an identity map satisfies the
  // panel's label/search contract without a separate id->name lookup.
  const sprintNameMap = useMemo(
    () => Object.fromEntries(sprintOptions.map((s) => [s, s])),
    [sprintOptions],
  );

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (statusFilter.size > 0 && !statusFilter.has(r.jiraStatus)) return false;
      if (epicFilter.size > 0 && (!r.epic || !epicFilter.has(r.epic))) return false;
      if (assigneeFilter.size > 0) {
        const name = r.assignee?.name;
        if (!name || !assigneeFilter.has(name)) return false;
      }
      if (issueTypeFilter.size > 0 && !issueTypeFilter.has(r.type)) return false;
      if (teamFilter.size > 0) {
        const prefix = r.sprintName ? extractTeamPrefix(r.sprintName) : null;
        if (!prefix || !teamFilter.has(prefix)) return false;
      }
      if (sprintFilter.size > 0 && (!r.sprintName || !sprintFilter.has(r.sprintName))) return false;
      if (q.length >= 1) {
        const haystack = `${r.key} ${r.title} ${r.assignee?.name ?? ""} ${r.epic ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    const dir = sortDir === "asc" ? 1 : -1;
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (sortField) {
        case "key":
          return a.key.localeCompare(b.key) * dir;
        case "title":
          return a.title.localeCompare(b.title) * dir;
        case "jiraStatus":
          return a.jiraStatus.localeCompare(b.jiraStatus) * dir;
        case "epic":
          return (a.epic ?? "").localeCompare(b.epic ?? "") * dir;
        case "assignee":
          return (a.assignee?.name ?? "").localeCompare(b.assignee?.name ?? "") * dir;
        case "points":
          return ((a.storyPoints ?? -1) - (b.storyPoints ?? -1)) * dir;
        case "created":
        default:
          return (a.jiraCreatedAt ?? "").localeCompare(b.jiraCreatedAt ?? "") * dir;
      }
    });
    return sorted;
  }, [rows, searchQuery, statusFilter, epicFilter, assigneeFilter, issueTypeFilter, teamFilter, sprintFilter, sortField, sortDir]);

  const activeFilterCount =
    statusFilter.size + epicFilter.size + assigneeFilter.size + issueTypeFilter.size + teamFilter.size + sprintFilter.size;

  const resetFilters = useCallback(() => setStored(DEFAULT_FILTERS), [setStored]);

  const onSortChange = useCallback((field: SortField, d: SortDir) => {
    setSortField(field);
    setSortDir(d);
  }, []);

  const noop = useCallback(() => {}, []);

  // A complete FilterControlsPanelProps, whitelisted to the inbox categories. The
  // readiness/editState slots are required by the shared type but never shown.
  const filterProps: FilterControlsPanelProps = useMemo(
    () => ({
      statusFilter,
      epicFilter,
      assigneeFilter,
      readinessFilter: new Set<string>(),
      editStateFilter: new Set<string>(),
      issueTypeFilter,
      teamFilter,
      sprintFilter,
      onStatusFilterChange: setStatusFilter,
      onEpicFilterChange: setEpicFilter,
      onAssigneeFilterChange: setAssigneeFilter,
      onReadinessFilterChange: noop,
      onEditStateFilterChange: noop,
      onIssueTypeFilterChange: setIssueTypeFilter,
      onTeamFilterChange: setTeamFilter,
      onSprintFilterChange: setSprintFilter,
      statusOptions,
      epicOptions,
      assigneeOptions,
      issueTypeOptions,
      teamOptions,
      sprintOptions,
      sprintNameMap,
      onClearAll: resetFilters,
      columnVisible: visibleTags,
      onColumnToggle: handleColumnToggle,
      onColumnReset: resetColumns,
      categoryWhitelist: INBOX_CATEGORIES,
      hideSprintStateOptions: true,
    }),
    [
      statusFilter, epicFilter, assigneeFilter, issueTypeFilter, teamFilter, sprintFilter,
      setStatusFilter, setEpicFilter, setAssigneeFilter, setIssueTypeFilter, setTeamFilter, setSprintFilter,
      statusOptions, epicOptions, assigneeOptions, issueTypeOptions, teamOptions, sprintOptions, sprintNameMap,
      resetFilters, visibleTags, handleColumnToggle, resetColumns, noop,
    ],
  );

  return {
    filteredRows,
    searchQuery,
    setSearchQuery,
    searchCount: { matched: filteredRows.length, total: rows.length },
    sortField,
    sortDir,
    onSortChange,
    activeFilterCount,
    visibleTags,
    filterProps,
    resetFilters,
  };
}
