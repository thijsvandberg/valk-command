"use client";

import { useRef, useState } from "react";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { FieldFilterSections, type StatusFilter, type FieldToggle } from "./FieldFilterPopover";
import { LayoutList, CalendarRange, Plus, Ruler, MoreHorizontal, Check } from "lucide-react";

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
  /** When provided, renders a "Hide deprecated" toggle in the filter popover. */
  hideDeprecated?: boolean;
  onToggleHideDeprecated?: (hide: boolean) => void;
  deprecatedCount?: number;
  /** When provided, renders a List / By sprint view toggle inside the menu. */
  viewMode?: ChildIssueViewMode;
  onViewModeChange?: (mode: ChildIssueViewMode) => void;
  /** Extra action buttons (e.g. AI suggest button) rendered before the menu trigger */
  extraActions?: React.ReactNode;
  /** When set, the heading becomes collapsible with shared cross-surface state. */
  sectionKey?: string;
  /** When provided, renders a "New child issue" action that toggles the inline composer (BRDG-315). */
  onToggleCreate?: () => void;
  /** Whether the create composer is currently open (drives the action's active state). */
  createOpen?: boolean;
  /** Forward-planning mode (BRDG-303): when provided, renders a "Planning" toggle that
   *  reveals guestimation pickers and (in the by-sprint view) the fullness meter. */
  planningOn?: boolean;
  onTogglePlanning?: () => void;
}

const VIEW_MODES: { mode: ChildIssueViewMode; label: string; Icon: typeof LayoutList }[] = [
  { mode: "list", label: "List", Icon: LayoutList },
  { mode: "sprint", label: "By sprint", Icon: CalendarRange },
];

const menuHeadingClass = "px-3 py-1.5 text-caption font-semibold uppercase tracking-wider text-text-muted";
const dividerClass = "my-1 h-px bg-border-subtle";

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
  hideDeprecated,
  onToggleHideDeprecated,
  deprecatedCount,
  viewMode,
  onViewModeChange,
  extraActions,
  sectionKey,
  onToggleCreate,
  createOpen,
  planningOn,
  onTogglePlanning,
}: ChildIssueListHeaderProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useOutsideClick(ref, () => setOpen(false), { enabled: open });

  // The trigger carries an active accent whenever something behind it is engaged, so the
  // collapse from four buttons to one icon doesn't hide that a control is toggled.
  const hasActiveState = open || isFiltered || Boolean(planningOn) || Boolean(createOpen);

  const showViewToggle = Boolean(viewMode && onViewModeChange);

  const menu = (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="List options"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex cursor-pointer items-center justify-center rounded-md p-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
          hasActiveState
            ? "bg-[var(--color-brand-500)]/[0.08] text-[var(--color-brand-400)]"
            : "text-text-muted hover:bg-overlay-subtle hover:text-text-secondary"
        }`}
        style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
        title="View, filter and display options"
      >
        <MoreHorizontal size={14} strokeWidth={1.5} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute top-full right-0 z-50 mt-1 min-w-[200px] rounded-xl border border-border-default bg-[var(--color-surface-floating)] py-1 shadow-[var(--shadow-popover)]"
          style={{ animation: "fadeInUp 0.1s ease" }}
        >
          {showViewToggle && (
            <>
              <div className={menuHeadingClass}>View</div>
              <div className="px-2 pb-1">
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
                        onClick={() => onViewModeChange!(mode)}
                        className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded px-2 py-1 text-caption font-medium focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] ${
                          isActive
                            ? "bg-[var(--color-surface-elevated)] text-[var(--color-brand-400)] shadow-[0_1px_2px_color-mix(in_srgb,var(--color-brand-500)_18%,transparent)]"
                            : "text-text-muted hover:text-text-secondary"
                        }`}
                        style={{ transition: "color 0.15s ease, background-color 0.15s ease" }}
                      >
                        <Icon size={13} strokeWidth={1.5} />
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className={dividerClass} />
            </>
          )}

          {onTogglePlanning && (
            <>
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={Boolean(planningOn)}
                onClick={onTogglePlanning}
                className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-[7px] text-body-sm hover:bg-hover-list-item active:bg-overlay-default"
                title="Planning (pencil capacity + guestimations)"
              >
                <span
                  className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors duration-100 ${
                    planningOn
                      ? "border-[var(--color-brand-400)] bg-[var(--color-brand-400)]"
                      : "border-border-default bg-transparent"
                  }`}
                >
                  {planningOn && <Check size={10} strokeWidth={3} className="text-white" />}
                </span>
                <Ruler size={13} strokeWidth={1.5} className="shrink-0 text-text-tertiary" />
                <span className="text-text-secondary">Planning</span>
              </button>
              <div className={dividerClass} />
            </>
          )}

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

          {onToggleCreate && (
            <>
              <div className={dividerClass} />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onToggleCreate();
                  setOpen(false);
                }}
                title="Create child issue"
                className={`flex w-full cursor-pointer items-center gap-2.5 px-3 py-[7px] text-body-sm hover:bg-hover-list-item active:bg-overlay-default ${
                  createOpen ? "text-[var(--color-brand-400)]" : "text-text-secondary"
                }`}
              >
                <Plus size={14} strokeWidth={2} className="shrink-0" />
                <span>New child issue</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );

  return (
    <SectionHeader
      title={title}
      count={!isFiltered ? totalCount : undefined}
      countLabel={isFiltered && totalCount > 0 ? `${filteredCount} of ${totalCount}` : undefined}
      actions={<>{extraActions}{menu}</>}
      sectionKey={sectionKey}
    />
  );
}
