"use client";

import { useRef, useState } from "react";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { Checkbox } from "@/components/shared/Checkbox";
import { Radio } from "@/components/shared/Radio";
import {
  FieldFilterSections,
  type StatusFilter,
  type FieldToggle,
} from "./FieldFilterPopover";
import {
  type LucideIcon,
  LayoutList,
  CalendarRange,
  Pencil,
  Plus,
  MoreHorizontal,
  Eye,
  EyeOff,
  ListFilter,
  Columns3,
  Sparkles,
  Loader2,
} from "lucide-react";

export type ChildIssueViewMode = "list" | "sprint";

interface ChildIssueListHeaderProps {
  /** When provided, the controls render under a collapsible SectionHeader with this
   *  title + count (used by SubtasksSection). Omit for the title-less toolbar form
   *  (epic Child issues tab), where only the menu cluster renders. */
  title?: string;
  totalCount?: number;
  filteredCount?: number;
  isFiltered: boolean;
  filter: StatusFilter;
  setFilter: (f: StatusFilter) => void;
  statusCounts: Record<string, number>;
  fields: FieldToggle[];
  visibleFields: Set<string>;
  onToggleField: (id: string, show: boolean) => void;
  /** When provided, renders a "Hide deprecated" toggle in the Filter pane. */
  hideDeprecated?: boolean;
  onToggleHideDeprecated?: (hide: boolean) => void;
  deprecatedCount?: number;
  /** When provided, renders the List / By sprint view toggle in the View pane. */
  viewMode?: ChildIssueViewMode;
  onViewModeChange?: (mode: ChildIssueViewMode) => void;
  /** Extra action buttons (e.g. AI suggest button) rendered before the menu trigger */
  extraActions?: React.ReactNode;
  /** When set (with `title`), the heading becomes collapsible with shared cross-surface state. */
  sectionKey?: string;
  /** When provided, renders a "Hide/Show progress summary" toggle in the menu footer (BRDG-331). */
  summaryHidden?: boolean;
  onToggleSummary?: () => void;
  /** When provided, renders a "New child issue" action that toggles the inline composer (BRDG-315). */
  onToggleCreate?: () => void;
  /** Whether the create composer is currently open (drives the action's active state). */
  createOpen?: boolean;
  /** Forward-planning mode (BRDG-303): when provided, renders a "Planning" toggle in the View pane
   *  that reveals guestimation pickers and (in the by-sprint view) the fullness meter. */
  planningOn?: boolean;
  onTogglePlanning?: () => void;
  /** When provided, renders an "AI suggest" action in the menu footer. */
  onSuggest?: () => void;
  /** Drives the spinner on the AI suggest action while a suggestion run is in flight. */
  suggestLoading?: boolean;
  /** Number of pending AI suggestions; surfaces a badge and accents the trigger when > 0. */
  suggestCount?: number;
}

const VIEW_MODES: { mode: ChildIssueViewMode; label: string; Icon: LucideIcon }[] = [
  { mode: "list", label: "List", Icon: LayoutList },
  { mode: "sprint", label: "By sprint", Icon: CalendarRange },
];

type Pane = "view" | "filter" | "columns";

const ROW =
  "flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-[7px] text-body-sm hover:bg-hover-list-item active:bg-overlay-default focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]";

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
  summaryHidden,
  onToggleSummary,
  onToggleCreate,
  createOpen,
  planningOn,
  onTogglePlanning,
  onSuggest,
  suggestLoading,
  suggestCount,
}: ChildIssueListHeaderProps) {
  const showViewToggle = Boolean(viewMode && onViewModeChange);
  const hasViewPane = showViewToggle || Boolean(onTogglePlanning);
  const hasColumnsPane = fields.length > 0;

  const [open, setOpen] = useState(false);
  const [pane, setPane] = useState<Pane>(hasViewPane ? "view" : "filter");
  const ref = useRef<HTMLDivElement>(null);

  useOutsideClick(ref, () => setOpen(false), { enabled: open });

  // The trigger carries an active accent whenever something behind it is engaged, so collapsing
  // the controls into one icon doesn't hide that a control is toggled.
  const hasActiveState =
    open || isFiltered || Boolean(planningOn) || Boolean(createOpen) || Boolean(suggestCount);

  const railItems: { key: Pane; label: string; Icon: LucideIcon }[] = [
    ...(hasViewPane ? [{ key: "view" as const, label: "View", Icon: Eye }] : []),
    { key: "filter" as const, label: "Filter", Icon: ListFilter },
    ...(hasColumnsPane ? [{ key: "columns" as const, label: "Columns", Icon: Columns3 }] : []),
  ];

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
          className="absolute top-full right-0 z-dropdown mt-1 w-[420px] overflow-hidden rounded-xl border border-border-default bg-surface-floating shadow-popover"
          style={{ animation: "fadeInUp 0.1s ease" }}
        >
          <div className="flex">
            {/* category rail */}
            <div className="w-[132px] shrink-0 border-r border-border-subtle bg-overlay-subtle/40 p-1.5">
              {railItems.map(({ key, label, Icon }) => {
                const active = pane === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPane(key)}
                    aria-pressed={active}
                    className={`mb-0.5 flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-body-sm transition-colors duration-150 ${
                      active
                        ? "bg-surface-floating font-medium text-[var(--color-brand-400)] shadow-sm"
                        : "text-text-muted hover:text-text-secondary"
                    } focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`}
                  >
                    <Icon size={14} strokeWidth={1.5} />
                    {label}
                  </button>
                );
              })}
            </div>

            {/* active pane */}
            <div className="min-h-[152px] flex-1 p-1">
              {pane === "view" && (
                <div>
                  {showViewToggle &&
                    VIEW_MODES.map(({ mode, label, Icon }) => {
                      const active = viewMode === mode;
                      return (
                        <button
                          key={mode}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => onViewModeChange!(mode)}
                          className={`${ROW} ${active ? "bg-[var(--color-brand-500)]/[0.06]" : ""} focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`}
                        >
                          <Radio checked={active} />
                          <Icon
                            size={13}
                            strokeWidth={1.5}
                            className={active ? "text-[var(--color-brand-400)]" : "text-text-tertiary"}
                          />
                          <span className={active ? "font-medium text-text-primary" : "text-text-secondary"}>
                            {label}
                          </span>
                        </button>
                      );
                    })}
                  {showViewToggle && onTogglePlanning && <div className="my-1 h-px bg-border-subtle" />}
                  {onTogglePlanning && (
                    <button
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={Boolean(planningOn)}
                      onClick={onTogglePlanning}
                      className={ROW}
                      title="Planning (pencil capacity + guestimations)"
                    >
                      <Checkbox checked={Boolean(planningOn)} />
                      <Pencil size={13} strokeWidth={1.5} className="text-text-tertiary" />
                      <span className="text-text-secondary">Planning</span>
                    </button>
                  )}
                </div>
              )}

              {pane === "filter" && (
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
                  sections="filter"
                  showHeadings={false}
                />
              )}

              {pane === "columns" && (
                <div className="grid grid-cols-2 gap-x-1">
                  {fields.map((field) => {
                    const isVisible = visibleFields.has(field.id);
                    return (
                      <button
                        key={field.id}
                        type="button"
                        onClick={() => onToggleField(field.id, !isVisible)}
                        className={ROW}
                      >
                        <Checkbox checked={isVisible} />
                        <span className="truncate text-text-secondary">
                          {field.label.charAt(0).toUpperCase() + field.label.slice(1)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {(onToggleCreate || onSuggest || onToggleSummary) && (
            <>
              <div className="h-px bg-border-subtle" />
              <div className="p-1">
                {onToggleSummary && (
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={!summaryHidden}
                    onClick={() => {
                      onToggleSummary();
                      setOpen(false);
                    }}
                    className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-body-sm text-text-secondary transition-colors duration-150 hover:bg-hover-list-item hover:text-text-primary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                  >
                    {summaryHidden ? (
                      <Eye size={14} strokeWidth={1.5} className="shrink-0 text-text-tertiary" />
                    ) : (
                      <EyeOff size={14} strokeWidth={1.5} className="shrink-0 text-text-tertiary" />
                    )}
                    <span>{summaryHidden ? "Show progress summary" : "Hide progress summary"}</span>
                  </button>
                )}
                {onToggleCreate && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onToggleCreate();
                      setOpen(false);
                    }}
                    title="Create child issue"
                    className={`flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-body-sm transition-colors duration-150 hover:bg-hover-list-item ${
                      createOpen ? "text-[var(--color-brand-400)]" : "text-text-secondary hover:text-text-primary"
                    } focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`}
                  >
                    <Plus size={14} strokeWidth={2} className="shrink-0 text-[var(--color-brand-400)]" />
                    <span>New child issue</span>
                  </button>
                )}
                {onSuggest && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onSuggest();
                      setOpen(false);
                    }}
                    disabled={suggestLoading}
                    title={suggestCount ? `${suggestCount} pending AI suggestions` : "Suggest subtasks with AI"}
                    className={`flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-body-sm transition-colors duration-150 hover:bg-hover-list-item disabled:cursor-not-allowed disabled:opacity-60 ${
                      suggestCount ? "text-[var(--color-brand-400)]" : "text-text-secondary hover:text-text-primary"
                    } focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`}
                  >
                    {suggestLoading ? (
                      <Loader2 size={14} strokeWidth={1.5} className="shrink-0 animate-spin text-[var(--color-brand-400)]" />
                    ) : (
                      <Sparkles size={14} strokeWidth={1.5} className="shrink-0 text-[var(--color-brand-400)]" />
                    )}
                    <span>Suggest subtasks with AI</span>
                    {suggestCount ? (
                      <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-brand-500)] px-1 text-caption font-semibold text-white">
                        {suggestCount}
                      </span>
                    ) : null}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );

  // Title present -> collapsible SectionHeader (SubtasksSection). Otherwise the
  // title-less cluster used inside the epic progress toolbar (BRDG-331).
  if (title !== undefined) {
    return (
      <SectionHeader
        title={title}
        count={!isFiltered ? totalCount : undefined}
        countLabel={isFiltered && (totalCount ?? 0) > 0 ? `${filteredCount} of ${totalCount}` : undefined}
        actions={<>{extraActions}{menu}</>}
        sectionKey={sectionKey}
      />
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      {extraActions}
      {menu}
    </div>
  );
}
