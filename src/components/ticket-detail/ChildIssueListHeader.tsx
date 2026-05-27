"use client";

import { useState } from "react";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { FieldFilterPopover, type StatusFilter, type FieldToggle } from "./FieldFilterPopover";
import { Filter } from "lucide-react";

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
  /** Extra action buttons (e.g. AI suggest button) rendered before the filter button */
  extraActions?: React.ReactNode;
}

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
  extraActions,
}: ChildIssueListHeaderProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);

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
      actions={<>{extraActions}{filterButton}</>}
    />
  );
}
