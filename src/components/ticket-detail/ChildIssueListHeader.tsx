"use client";

import { useState } from "react";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { FieldFilterPopover, type StatusFilter, type FieldToggle } from "./FieldFilterPopover";
import { Filter, LayoutList, CalendarRange } from "lucide-react";

export type ChildIssueViewMode = "list" | "sprint";

interface ChildIssueListHeaderProps {
  title: string;
  totalCount: number;
  filteredCount: number;
  isFiltered: boolean;
  filter: StatusFilter;
  setFilter: (f: StatusFilter) => void;
  statusCounts: Record<string, number>;
  fields: FieldToggle[];
  visibleFields: Set<string>;
  onToggleField: (id: string, show: boolean) => void;
  /** When provided, renders a List / By sprint view toggle before the filter button. */
  viewMode?: ChildIssueViewMode;
  onViewModeChange?: (mode: ChildIssueViewMode) => void;
  /** Extra action buttons (e.g. AI suggest button) rendered before the filter button */
  extraActions?: React.ReactNode;
}

const VIEW_MODES: { mode: ChildIssueViewMode; label: string; Icon: typeof LayoutList }[] = [
  { mode: "list", label: "List", Icon: LayoutList },
  { mode: "sprint", label: "By sprint", Icon: CalendarRange },
];

export function ChildIssueListHeader({
  title,
  totalCount,
  filteredCount,
  isFiltered,
  filter,
  setFilter,
  statusCounts,
  fields,
  visibleFields,
  onToggleField,
  viewMode,
  onViewModeChange,
  extraActions,
}: ChildIssueListHeaderProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);

  const viewToggle = viewMode && onViewModeChange ? (
    <div
      role="radiogroup"
      aria-label="Child issue view"
      className="flex items-center gap-0.5 rounded-md bg-overlay-subtle p-0.5"
    >
      {VIEW_MODES.map(({ mode, label, Icon }) => {
        const isActive = viewMode === mode;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onViewModeChange(mode)}
            title={label}
            className={`flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 text-caption font-medium focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] ${
              isActive
                ? "bg-[var(--color-surface-elevated)] text-[var(--color-brand-400)] shadow-[0_1px_2px_color-mix(in_srgb,var(--color-brand-500)_18%,transparent)]"
                : "text-text-muted hover:text-text-secondary"
            }`}
            style={{ transition: "color 0.15s ease, background-color 0.15s ease" }}
          >
            <Icon size={13} strokeWidth={1.5} />
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  ) : null;

  const filterButton = (
    <div className="relative">
      <button
        type="button"
        onClick={() => setPopoverOpen((v) => !v)}
        className={`flex cursor-pointer items-center justify-center rounded-md p-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
          popoverOpen || isFiltered
            ? "bg-[var(--color-brand-500)]/[0.08] text-[var(--color-brand-400)]"
            : "text-text-muted hover:bg-overlay-subtle hover:text-text-secondary"
        }`}
        style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
        title="Filter and display options"
      >
        <Filter size={13} strokeWidth={1.5} />
      </button>
      {popoverOpen && (
        <FieldFilterPopover
          filter={filter}
          setFilter={setFilter}
          statusCounts={statusCounts}
          fields={fields}
          visibleFields={visibleFields}
          onToggleField={onToggleField}
          onClose={() => setPopoverOpen(false)}
        />
      )}
    </div>
  );

  return (
    <SectionHeader
      title={title}
      count={!isFiltered ? totalCount : undefined}
      countLabel={isFiltered && totalCount > 0 ? `${filteredCount} of ${totalCount}` : undefined}
      actions={<>{extraActions}{viewToggle}{filterButton}</>}
    />
  );
}
