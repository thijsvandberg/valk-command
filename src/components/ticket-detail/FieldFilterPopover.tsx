"use client";

import { useRef } from "react";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { Checkbox } from "@/components/shared/Checkbox";
import type { JiraStatus } from "@/types/ticket";

export type StatusFilter = "all" | JiraStatus;

export const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "TO DO", label: "To Do" },
  { value: "IN PROGRESS", label: "In Progress" },
  { value: "DONE", label: "Done" },
];

export interface FieldToggle {
  id: string;
  label: string;
}

interface FieldFilterPopoverProps {
  filter: StatusFilter;
  setFilter: (f: StatusFilter) => void;
  statusCounts: Record<string, number>;
  fields: FieldToggle[];
  visibleFields: Set<string>;
  onToggleField: (id: string, show: boolean) => void;
  onClose: () => void;
  /** When provided, renders a "Hide deprecated" toggle. Only shown when deprecatedCount > 0. */
  hideDeprecated?: boolean;
  onToggleHideDeprecated?: (hide: boolean) => void;
  deprecatedCount?: number;
}

export function FieldFilterPopover({
  filter,
  setFilter,
  statusCounts,
  fields,
  visibleFields,
  onToggleField,
  onClose,
  hideDeprecated,
  onToggleHideDeprecated,
  deprecatedCount = 0,
}: FieldFilterPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  useOutsideClick(ref, onClose);

  return (
    <div
      ref={ref}
      className="absolute top-full right-0 z-dropdown mt-1 min-w-[180px] rounded-xl border border-border-default bg-surface-floating py-1 shadow-popover"
      style={{ animation: "fadeInUp 0.1s ease" }}
    >
      <FieldFilterSections
        filter={filter}
        setFilter={setFilter}
        statusCounts={statusCounts}
        fields={fields}
        visibleFields={visibleFields}
        onToggleField={onToggleField}
        hideDeprecated={hideDeprecated}
        onToggleHideDeprecated={onToggleHideDeprecated}
        deprecatedCount={deprecatedCount}
      />
    </div>
  );
}

type FieldFilterSectionsProps = Omit<FieldFilterPopoverProps, "onClose"> & {
  /** Which groups to render. "filter" = status + hide-deprecated, "columns" = field
   *  visibility, "all" (default) = everything stacked. */
  sections?: "all" | "filter" | "columns";
  /** Render the uppercase "Status"/"Columns" group headings (default true). */
  showHeadings?: boolean;
};

/**
 * The status filter, hide-deprecated, and column-visibility rows without the
 * popover chrome. Reused by FieldFilterPopover (all groups) and by the two-pane
 * list-controls menu (one group per pane) so the two stay visually identical.
 */
export function FieldFilterSections({
  filter,
  setFilter,
  statusCounts,
  fields,
  visibleFields,
  onToggleField,
  hideDeprecated,
  onToggleHideDeprecated,
  deprecatedCount = 0,
  sections = "all",
  showHeadings = true,
}: FieldFilterSectionsProps) {
  const showStatus = sections !== "columns";
  const showColumns = sections !== "filter" && fields.length > 0;
  const showHideDeprecated = showStatus && Boolean(onToggleHideDeprecated) && deprecatedCount > 0;

  return (
    <>
      {showStatus && (
        <>
          {showHeadings && (
            <div className="px-3 py-1.5 text-caption font-semibold uppercase tracking-wider text-text-muted">
              Status
            </div>
          )}
          {STATUS_FILTER_OPTIONS.map((opt) => {
            const isActive = filter === opt.value;
            const count = statusCounts[opt.value as keyof typeof statusCounts] ?? 0;
            if (opt.value !== "all" && count === 0) return null;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFilter(opt.value)}
                className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-[7px] text-body-sm hover:bg-hover-list-item active:bg-overlay-default focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
              >
                <span className={isActive ? "font-medium text-text-primary" : "text-text-secondary"}>
                  {opt.label}
                </span>
                <span className="ml-auto tabular-nums text-caption text-text-muted">{count}</span>
              </button>
            );
          })}
        </>
      )}

      {/* Hide deprecated toggle (only relevant when deprecated items exist) */}
      {showHideDeprecated && (
        <>
          <div className="my-1 h-px bg-border-subtle" />
          <button
            type="button"
            onClick={() => onToggleHideDeprecated!(!hideDeprecated)}
            className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-[7px] text-body-sm hover:bg-hover-list-item active:bg-overlay-default focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
          >
            <Checkbox checked={Boolean(hideDeprecated)} />
            <span className="text-text-secondary">Hide deprecated</span>
            <span className="ml-auto tabular-nums text-caption text-text-muted">{deprecatedCount}</span>
          </button>
        </>
      )}

      {/* Column visibility toggles */}
      {showColumns && (
        <>
          {showStatus && <div className="my-1 h-px bg-border-subtle" />}
          {showHeadings && (
            <div className="px-3 py-1.5 text-caption font-semibold uppercase tracking-wider text-text-muted">
              Columns
            </div>
          )}
          {fields.map((field) => {
            const isVisible = visibleFields.has(field.id);
            return (
              <button
                key={field.id}
                type="button"
                onClick={() => onToggleField(field.id, !isVisible)}
                className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-[7px] text-body-sm hover:bg-hover-list-item active:bg-overlay-default focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
              >
                <Checkbox checked={isVisible} />
                <span className="text-text-secondary">
                  {field.label.charAt(0).toUpperCase() + field.label.slice(1)}
                </span>
              </button>
            );
          })}
        </>
      )}
    </>
  );
}
