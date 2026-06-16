"use client";

import { useState, useRef, useMemo } from "react";
import useSWR from "swr";
import { Avatar } from "@/components/shared/Avatar";
import { userInitials, userColor, type AssignableUser } from "@/components/shared/AssigneePicker";
import { swrFetcher } from "@/lib/api-client";
import { IssueTypeOption } from "@/components/shared/IssueTypeOption";
import { StatusOption } from "@/components/shared/StatusOption";
import { ReadinessOption } from "@/components/shared/ReadinessOption";
import { X, Bookmark } from "lucide-react";
import { FilterDropdown } from "@/components/shared/FilterDropdown";
import { Button } from "@/components/ui/Button";
import { BarContainer, BarDivider } from "@/components/shared/BarContainer";
import { SaveViewPopover } from "@/components/sprint-board/SaveViewPopover";
import { ExpandableSearch } from "@/components/sprint-board/ExpandableSearch";

export { PO_STATUS_COLORS, EDIT_STATE_OPTIONS, SORT_OPTIONS, GAPS_OPTIONS, COLUMNS, DEFAULT_VISIBLE, COLUMN_PRESETS, ROW_FIELDS, DEFAULT_VISIBLE_TAGS, BADGE_DEFAULT_TAGS, COLUMN_TO_TAG, columnsToTags, isTagVisibility } from "@/components/sprint-board/filter-bar-types";
export type { SortField, SortDir, SavedView, ColumnId, ColumnPreset, InlineTagId } from "@/components/sprint-board/filter-bar-types";
export { SortDropdown } from "@/components/sprint-board/SortControls";
export { ColumnToggle } from "@/components/sprint-board/ColumnToggle";
export { BoardFieldToggle } from "@/components/sprint-board/BoardFieldToggle";

import { EDIT_STATE_OPTIONS, GAPS_OPTIONS, READINESS_OPTIONS, SPRINT_STATE_FILTER_OPTIONS, type SavedView } from "@/components/sprint-board/filter-bar-types";
import { EpicBadge } from "@/components/shared/IssueMetaBadges";

export function FilterBar({
  statusFilter,
  epicFilter,
  assigneeFilter,
  readinessFilter,
  editStateFilter,
  issueTypeFilter,
  gapsFilter,
  onStatusFilterChange,
  onEpicFilterChange,
  onAssigneeFilterChange,
  onReadinessFilterChange,
  onEditStateFilterChange,
  onIssueTypeFilterChange,
  onGapsFilterChange,
  statusOptions,
  epicOptions,
  assigneeOptions,
  assigneeLabelMap,
  issueTypeOptions,
  teamFilter,
  onTeamFilterChange,
  teamOptions,
  sprintFilter,
  onSprintFilterChange,
  sprintOptions,
  sprintNameMap,
  noBorder = false,
  searchQuery,
  onSearchChange,
  onSaveView,
  onDeleteView,
  activeView,
}: {
  statusFilter: Set<string>;
  epicFilter: Set<string>;
  assigneeFilter: Set<string>;
  readinessFilter: Set<string>;
  editStateFilter: Set<string>;
  issueTypeFilter: Set<string>;
  gapsFilter?: Set<string>;
  onStatusFilterChange: (next: Set<string>) => void;
  onEpicFilterChange: (next: Set<string>) => void;
  onAssigneeFilterChange: (next: Set<string>) => void;
  onReadinessFilterChange: (next: Set<string>) => void;
  onEditStateFilterChange: (next: Set<string>) => void;
  onIssueTypeFilterChange: (next: Set<string>) => void;
  onGapsFilterChange?: (next: Set<string>) => void;
  statusOptions: string[];
  epicOptions: string[];
  assigneeOptions: string[];
  // Token (accountId or name) -> display name, for rendering the assignee options
  // whose values are now stable accountIds (BRDG-365). Optional; the token
  // doubles as the label when absent.
  assigneeLabelMap?: Record<string, string>;
  issueTypeOptions: string[];
  teamFilter?: Set<string>;
  onTeamFilterChange?: (next: Set<string>) => void;
  teamOptions?: string[];
  sprintFilter?: Set<string>;
  onSprintFilterChange?: (next: Set<string>) => void;
  sprintOptions?: string[];
  sprintNameMap?: Record<string, string>;
  noBorder?: boolean;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  onSaveView?: (title: string) => void;
  onDeleteView?: () => void;
  activeView?: SavedView | null;
}) {
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const saveViewRef = useRef<HTMLDivElement>(null);
  const readinessOptions = [...READINESS_OPTIONS.filter((o) => o.value !== null).map((o) => o.value as string), "none"];

  // Favorite assignees float to the top, mirroring the AssigneePicker ordering.
  const { data: assignableData } = useSWR<{ users: AssignableUser[] }>(
    "/api/jira/assignable-users",
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 },
  );
  // Favourite tokens (BRDG-365): match the assignee options, which are now
  // accountId tokens (name fallback), so favourites float to the top regardless
  // of a rename. Falls back to the display name for people without a captured id.
  const favoriteTokens = useMemo(() => {
    const set = new Set<string>();
    for (const u of assignableData?.users ?? []) if (u.isFavorite) set.add(u.accountId ?? u.displayName);
    return set;
  }, [assignableData]);
  const orderedAssigneeOptions = useMemo(() => {
    const favs = assigneeOptions.filter((t) => favoriteTokens.has(t));
    const rest = assigneeOptions.filter((t) => !favoriteTokens.has(t));
    return [...favs, ...rest];
  }, [assigneeOptions, favoriteTokens]);
  const editStateValues = EDIT_STATE_OPTIONS.map((o) => o.value);
  const hasActiveFilters = statusFilter.size > 0 || epicFilter.size > 0 || assigneeFilter.size > 0 ||
    readinessFilter.size > 0 || editStateFilter.size > 0 || issueTypeFilter.size > 0 ||
    (gapsFilter?.size ?? 0) > 0 || (teamFilter?.size ?? 0) > 0 || (sprintFilter?.size ?? 0) > 0;

  function handleClearAll() {
    onStatusFilterChange(new Set()); onEpicFilterChange(new Set()); onAssigneeFilterChange(new Set());
    onReadinessFilterChange(new Set()); onEditStateFilterChange(new Set()); onIssueTypeFilterChange(new Set());
    if (onGapsFilterChange) onGapsFilterChange(new Set());
    if (onTeamFilterChange) onTeamFilterChange(new Set());
    if (onSprintFilterChange) onSprintFilterChange(new Set());
  }

  return (
    <BarContainer border={!noBorder} className="gap-2">
      {/* Expandable search */}
      {onSearchChange && (
        <ExpandableSearch value={searchQuery ?? ""} onChange={onSearchChange} />
      )}
      {onSearchChange && <BarDivider />}

      {/* Filter dropdowns */}
      <FilterDropdown
        label="Status"
        options={statusOptions}
        selected={statusFilter}
        onChange={onStatusFilterChange}
        renderOption={(v) => <StatusOption value={v} />}
      />
      <FilterDropdown
        label="Epic"
        options={epicOptions}
        selected={epicFilter}
        onChange={onEpicFilterChange}
        searchable
        searchPlaceholder="Search epics..."
        renderOption={(v) => {
          return <EpicBadge epic={v} className="max-w-[240px]" />;
        }}
      />
      <FilterDropdown
        label="Assignee"
        options={orderedAssigneeOptions}
        selected={assigneeFilter}
        onChange={onAssigneeFilterChange}
        searchable
        searchPlaceholder="Search assignees..."
        labelMap={assigneeLabelMap}
        renderOption={(token) => {
          const name = assigneeLabelMap?.[token] ?? token;
          return (
            <span className="flex items-center gap-2">
              <Avatar assignee={{ name, initials: userInitials(name), color: userColor(name) }} size={20} />
              <span className="truncate">{name}</span>
            </span>
          );
        }}
      />
      <FilterDropdown
        label="Readiness"
        options={readinessOptions}
        selected={readinessFilter}
        onChange={onReadinessFilterChange}
        renderOption={(v) => <ReadinessOption value={v} />}
      />
      <FilterDropdown
        label="Changes"
        options={editStateValues}
        selected={editStateFilter}
        onChange={onEditStateFilterChange}
        renderOption={(v) => {
          const cfg = EDIT_STATE_OPTIONS.find((o) => o.value === v);
          return (
            <span className="flex items-center gap-2">
              <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${cfg?.dotClass ?? ""}`} />
              {cfg?.label ?? v}
            </span>
          );
        }}
      />
      <FilterDropdown
        label="Type"
        options={issueTypeOptions}
        selected={issueTypeFilter}
        onChange={onIssueTypeFilterChange}
        renderOption={(v) => <IssueTypeOption value={v} />}
      />
      {gapsFilter && onGapsFilterChange && (
        <FilterDropdown
          label="Gaps"
          options={GAPS_OPTIONS.map((o) => o.value)}
          selected={gapsFilter}
          onChange={onGapsFilterChange}
          renderOption={(v) => {
            const cfg = GAPS_OPTIONS.find((o) => o.value === v);
            return (
              <span className="flex items-center gap-2">
                <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${cfg?.dotClass ?? ""}`} />
                {cfg?.label ?? v}
              </span>
            );
          }}
        />
      )}
      {teamFilter && onTeamFilterChange && teamOptions && teamOptions.length > 0 && (
        <FilterDropdown
          label="Team"
          options={teamOptions}
          selected={teamFilter}
          onChange={onTeamFilterChange}
        />
      )}
      {sprintFilter && onSprintFilterChange && sprintOptions && sprintNameMap && (
        <FilterDropdown
          label="Sprint"
          options={sprintOptions}
          selected={sprintFilter}
          onChange={onSprintFilterChange}
          searchable
          searchPlaceholder="Search sprints..."
          labelMap={sprintNameMap}
          widthClass="w-64"
          leadingOptions={SPRINT_STATE_FILTER_OPTIONS.map((o) => ({ value: o.value, label: o.label, dot: o.dot }))}
          leadingLabel="By state"
          renderOption={(id) => <span>{sprintNameMap[id] ?? id}</span>}
        />
      )}

      {/* Clear all filters */}
      {hasActiveFilters && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={<X className="h-3 w-3" strokeWidth={1.5} />}
          onClick={handleClearAll}
          className="border-0 bg-transparent"
          title="Clear all filters"
        >
          Clear
        </Button>
      )}

      <div className="flex-1" />

      {/* Save view */}
      {onSaveView && (
        <div ref={saveViewRef} className="relative">
          <Button
            variant="ghost"
            size="md"
            iconOnly
            onClick={() => setSaveViewOpen((v) => !v)}
            icon={<Bookmark className="h-3.5 w-3.5" strokeWidth={1.5} fill={activeView ? "currentColor" : "none"} />}
            title={activeView ? `Saved view: ${activeView.title}` : "Save current filter view"}
            aria-label={activeView ? `Saved view: ${activeView.title}` : "Save current filter view"}
            className={`border-0 bg-transparent ${activeView ? "text-[var(--color-brand-400)] hover:bg-[var(--color-brand-500)]/10" : "text-text-tertiary hover:bg-hover-list-item hover:text-text-secondary"}`}
          />
          {saveViewOpen && (
            <SaveViewPopover
              onSave={(title) => onSaveView(title)}
              onClose={() => setSaveViewOpen(false)}
              onDelete={onDeleteView}
              initialTitle={activeView?.title ?? ""}
              isUpdate={!!activeView}
            />
          )}
        </div>
      )}
    </BarContainer>
  );
}
