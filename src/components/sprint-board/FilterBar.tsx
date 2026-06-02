"use client";

import { useState, useRef } from "react";
import { IssueTypeIcon, ISSUE_TYPE_COLORS } from "@/components/shared/IssueTypeIcon";
import { X, Bookmark } from "lucide-react";
import { FilterDropdown } from "@/components/shared/FilterDropdown";
import { Button } from "@/components/ui/Button";
import { BarContainer, BarDivider } from "@/components/shared/BarContainer";
import { SaveViewPopover } from "@/components/sprint-board/SaveViewPopover";
import { ExpandableSearch } from "@/components/sprint-board/ExpandableSearch";

export { PO_STATUS_COLORS, EDIT_STATE_OPTIONS, SORT_OPTIONS, GAPS_OPTIONS, COLUMNS, DEFAULT_VISIBLE, COLUMN_PRESETS, ROW_FIELDS, DEFAULT_VISIBLE_TAGS, COLUMN_TO_TAG, columnsToTags, isTagVisibility } from "@/components/sprint-board/filter-bar-types";
export type { SortField, SortDir, SavedView, ColumnId, ColumnPreset, InlineTagId } from "@/components/sprint-board/filter-bar-types";
export { SortDropdown } from "@/components/sprint-board/SortControls";
export { ColumnToggle } from "@/components/sprint-board/ColumnToggle";
export { BoardFieldToggle } from "@/components/sprint-board/BoardFieldToggle";

import { EDIT_STATE_OPTIONS, GAPS_OPTIONS, READINESS_OPTIONS, READINESS_CONFIG, JIRA_STATUS_COLORS, getEpicColor, type SavedView } from "@/components/sprint-board/filter-bar-types";

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
        renderOption={(v) => {
          const color = JIRA_STATUS_COLORS[v as keyof typeof JIRA_STATUS_COLORS];
          return (
            <span className="flex items-center gap-2">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: color?.text ?? "var(--color-status-neutral)" }}
              />
              {v}
            </span>
          );
        }}
      />
      <FilterDropdown
        label="Epic"
        options={epicOptions}
        selected={epicFilter}
        onChange={onEpicFilterChange}
        searchable
        searchPlaceholder="Search epics..."
        renderOption={(v) => {
          const color = getEpicColor(v);
          return (
            <span
              className="inline-block rounded px-1.5 py-0.5 text-body-sm"
              style={color ? { backgroundColor: color.bg, color: color.text } : undefined}
            >
              {v}
            </span>
          );
        }}
      />
      <FilterDropdown
        label="Assignee"
        options={assigneeOptions}
        selected={assigneeFilter}
        onChange={onAssigneeFilterChange}
        searchable
        searchPlaceholder="Search assignees..."
      />
      <FilterDropdown
        label="Readiness"
        options={readinessOptions}
        selected={readinessFilter}
        onChange={onReadinessFilterChange}
        renderOption={(v) => {
          if (v === "none") {
            return (
              <span className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full border border-border-strong" />
                No readiness
              </span>
            );
          }
          const cfg = READINESS_CONFIG[v as keyof typeof READINESS_CONFIG];
          return (
            <span className="flex items-center gap-2">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: cfg?.color ?? "var(--color-status-neutral)" }}
              />
              {cfg?.label ?? v}
            </span>
          );
        }}
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
        renderOption={(v) => {
          const color = ISSUE_TYPE_COLORS[v as keyof typeof ISSUE_TYPE_COLORS];
          return (
            <span className="flex items-center gap-2">
              <IssueTypeIcon type={v} size={13} />
              <span style={color ? { color } : undefined} className="capitalize">{v}</span>
            </span>
          );
        }}
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
