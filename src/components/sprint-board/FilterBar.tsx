"use client";

import { useState, useRef, useEffect } from "react";
import { getEpicColor, PO_STATUS_OPTIONS, JIRA_STATUS_COLORS } from "@/types/ticket";
import { ArrowUpDown, ArrowUp, ArrowDown, Columns3, Search, X, Bookmark, Check } from "lucide-react";
import { FilterDropdown } from "@/components/shared/FilterDropdown";

// -- PO Status colors (needed for filter rendering) --

export const PO_STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  Nieuw: { bg: "rgba(148, 163, 184, 0.1)", text: "#94a3b8", dot: "#94a3b8" },
  Uitwerken: { bg: "rgba(234, 179, 8, 0.1)", text: "#eab308", dot: "#eab308" },
  "Wachten op feedback": { bg: "rgba(234, 135, 68, 0.1)", text: "#ea8744", dot: "#ea8744" },
  "Klaar voor refinement": { bg: "rgba(96, 165, 250, 0.1)", text: "#60a5fa", dot: "#60a5fa" },
  Ready: { bg: "rgba(46, 145, 73, 0.1)", text: "#4aaa60", dot: "#4aaa60" },
  Geparkeerd: { bg: "rgba(100, 100, 120, 0.08)", text: "#64648a", dot: "#64648a" },
};

// Edit state display config for filter labels
export const EDIT_STATE_OPTIONS: { value: string; label: string; dotClass: string }[] = [
  { value: "draft", label: "Unsaved draft", dotClass: "bg-[#4a90d9]/40" },
  { value: "local_edits", label: "Local changes", dotClass: "bg-[#4a90d9]/70" },
  { value: "conflict", label: "Conflict", dotClass: "bg-[#ea8744]/70" },
  { value: "removed", label: "Removed from Jira", dotClass: "bg-red-400/60" },
];

// ---------------------------------------------------------------------------
// Sort types (exported for reuse)
// ---------------------------------------------------------------------------

export type SortField = "rank" | "quality" | "points" | "key" | "title" | "epic" | "jiraStatus" | "assignee" | "poStatus" | "lastChanged";
export type SortDir = "asc" | "desc";

// ---------------------------------------------------------------------------
// Saved view type (exported for reuse in SprintSlots / SprintBoard)
// ---------------------------------------------------------------------------

export interface SavedView {
  id: string;
  title: string;
  filters: {
    status: string[];
    epic: string[];
    assignee: string[];
    poStatus: string[];
    editState: string[];
  };
  sort: { field: SortField; direction: SortDir };
}

// ---------------------------------------------------------------------------
// Column types (exported for reuse)
// ---------------------------------------------------------------------------

export type ColumnId = "type" | "key" | "title" | "epic" | "jiraStatus" | "points" | "assignee" | "flagged" | "poStatus" | "quality" | "notes";

export const COLUMNS: { id: ColumnId; label: string; alwaysVisible?: boolean }[] = [
  { id: "type", label: "Type" },
  { id: "key", label: "Key", alwaysVisible: true },
  { id: "title", label: "Title", alwaysVisible: true },
  { id: "epic", label: "Epic" },
  { id: "jiraStatus", label: "Jira Status" },
  { id: "points", label: "Points" },
  { id: "assignee", label: "Assignee" },
  { id: "flagged", label: "Flagged" },
  { id: "poStatus", label: "PO Status" },
  { id: "quality", label: "Quality" },
  { id: "notes", label: "Notes" },
];

export const DEFAULT_VISIBLE: ColumnId[] = ["type", "key", "title", "epic", "jiraStatus", "points", "assignee", "flagged", "poStatus", "quality", "notes"];

// FilterDropdown is imported from @/components/shared/FilterDropdown

// ---------------------------------------------------------------------------
// Sort dropdown
// ---------------------------------------------------------------------------

const SORT_OPTIONS: { field: SortField; label: string; defaultDir: SortDir }[] = [
  { field: "rank", label: "Jira rank (default)", defaultDir: "asc" },
  { field: "lastChanged", label: "Last changed", defaultDir: "desc" },
  { field: "quality", label: "Quality score", defaultDir: "desc" },
  { field: "points", label: "Story points", defaultDir: "desc" },
  { field: "key", label: "Ticket key", defaultDir: "asc" },
  { field: "title", label: "Title", defaultDir: "asc" },
  { field: "jiraStatus", label: "Jira status", defaultDir: "asc" },
  { field: "assignee", label: "Assignee", defaultDir: "asc" },
  { field: "poStatus", label: "PO status", defaultDir: "asc" },
];

function SortDropdown({
  field,
  direction,
  onChange,
}: {
  field: SortField;
  direction: SortDir;
  onChange: (field: SortField, dir: SortDir) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const isActive = field !== "rank";
  const activeLabel = SORT_OPTIONS.find((o) => o.field === field)?.label ?? "Sort";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98] ${
          isActive
            ? "border border-[var(--color-brand-500)]/35 bg-[var(--color-brand-500)]/10 text-[var(--color-brand-300)] hover:bg-[var(--color-brand-500)]/15"
            : "text-white/40 hover:bg-white/[0.04] hover:text-white/60"
        }`}
        style={{ transition: "background-color 120ms, border-color 120ms, color 120ms, transform 80ms" }}
      >
        <ArrowUpDown className="h-3.5 w-3.5" strokeWidth={1.5} />
        {isActive ? activeLabel : "Sort"}
        {isActive && (
          direction === "asc"
            ? <ArrowUp className="h-3 w-3" strokeWidth={1.5} />
            : <ArrowDown className="h-3 w-3" strokeWidth={1.5} />
        )}
      </button>

      {open && (
        <div className="absolute top-full right-0 z-50 mt-1 w-52 rounded-lg border border-white/[0.08] bg-[var(--color-surface-floating)] py-1 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.field}
              type="button"
              onClick={() => {
                if (opt.field === field) {
                  onChange(opt.field, direction === "asc" ? "desc" : "asc");
                } else {
                  onChange(opt.field, opt.defaultDir);
                }
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between px-3 py-1.5 text-xs cursor-pointer hover:bg-white/[0.04] ${
                opt.field === field ? "text-white bg-white/[0.03]" : "text-white/50"
              }`}
            >
              <span className="flex items-center gap-2">
                {opt.field === field && (
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand-400)]" />
                )}
                {opt.label}
              </span>
              {opt.field === field && (
                direction === "asc"
                  ? <ArrowUp className="h-3 w-3 text-[var(--color-brand-400)]" strokeWidth={1.5} />
                  : <ArrowDown className="h-3 w-3 text-[var(--color-brand-400)]" strokeWidth={1.5} />
              )}
            </button>
          ))}
          {isActive && (
            <>
              <div className="my-1 h-px bg-white/[0.06]" />
              <button
                type="button"
                onClick={() => {
                  onChange("rank", "asc");
                  setOpen(false);
                }}
                className="flex w-full items-center px-3 py-1.5 text-xs text-white/30 cursor-pointer hover:bg-white/[0.04] hover:text-white/50"
              >
                Reset to default
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Column toggle dropdown
// ---------------------------------------------------------------------------

function ColumnToggle({
  visible,
  onChange,
}: {
  visible: Set<ColumnId>;
  onChange: (id: ColumnId, show: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium text-white/40 cursor-pointer hover:bg-white/[0.04] hover:text-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98]"
        style={{ transition: "background-color 120ms, color 120ms, transform 80ms" }}
        title="Toggle columns"
      >
        <Columns3 className="h-3.5 w-3.5" strokeWidth={1.5} />
        Columns
      </button>
      {open && (
        <div className="absolute top-full right-0 z-50 mt-1.5 w-48 overflow-hidden rounded-xl border border-white/[0.08] bg-[var(--color-surface-floating)] py-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.55),0_4px_12px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.04)]">
          {COLUMNS.map((col) => {
            const checked = visible.has(col.id);
            return (
              <label
                key={col.id}
                className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-[13px] cursor-pointer hover:bg-white/[0.04] ${
                  col.alwaysVisible ? "text-white/25 pointer-events-none" : "text-white/65 hover:text-white/85"
                }`}
                style={{ transition: "background-color 80ms, color 80ms" }}
              >
                <span
                  className="flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[4px] border"
                  style={{
                    backgroundColor: checked ? (col.alwaysVisible ? "rgba(255,255,255,0.12)" : "var(--color-brand-500)") : "transparent",
                    borderColor: checked ? (col.alwaysVisible ? "rgba(255,255,255,0.2)" : "var(--color-brand-500)") : "rgba(255,255,255,0.18)",
                    transition: "background-color 100ms, border-color 100ms",
                    opacity: col.alwaysVisible ? 0.4 : 1,
                  }}
                >
                  {checked && (
                    <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                      <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={col.alwaysVisible}
                  onChange={(e) => onChange(col.id, e.target.checked)}
                  className="sr-only"
                />
                {col.label}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

// SprintFilterBar replaced by shared FilterDropdown with searchable + labelMap

// ---------------------------------------------------------------------------
// Save view popover
// ---------------------------------------------------------------------------

function SaveViewPopover({
  onSave,
  onClose,
  onDelete,
  initialTitle = "",
  isUpdate = false,
}: {
  onSave: (title: string) => void;
  onClose: () => void;
  onDelete?: () => void;
  initialTitle?: string;
  isUpdate?: boolean;
}) {
  const [title, setTitle] = useState(initialTitle);
  const inputRef = useRef<HTMLInputElement>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (title.trim()) {
      onSave(title.trim());
      onClose();
    }
  }

  return (
    <div
      ref={ref}
      className="absolute top-full right-0 z-50 mt-1.5 w-64 overflow-hidden rounded-xl border border-white/[0.08] bg-[var(--color-surface-floating)] p-3 shadow-[0_12px_40px_rgba(0,0,0,0.55),0_4px_12px_rgba(0,0,0,0.3)]"
    >
      <p className="mb-2 text-[11px] font-medium text-white/40">
        {isUpdate ? "Update saved view" : "Save current filter view"}
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <input
          ref={inputRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="View name..."
          className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-sm text-white/80 placeholder-white/25 focus:outline-none focus:border-[var(--color-brand-500)]/50"
          style={{ boxShadow: "inset 0 1px 2px rgba(0,0,0,0.18)" }}
        />
        <button
          type="submit"
          disabled={!title.trim()}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--color-brand-500)] px-3 py-1.5 text-xs font-semibold text-white cursor-pointer hover:bg-[var(--color-brand-400)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ transition: "background-color 100ms" }}
        >
          <Check className="h-3 w-3" strokeWidth={2} />
          {isUpdate ? "Update view" : "Save view"}
        </button>
        {isUpdate && onDelete && (
          <>
            <div className="h-px bg-white/[0.06]" />
            <button
              type="button"
              onClick={() => { onDelete(); onClose(); }}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-400/70 cursor-pointer hover:bg-red-500/10 hover:text-red-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
              style={{ transition: "background-color 100ms, color 100ms" }}
            >
              <X className="h-3 w-3" strokeWidth={1.5} />
              Delete view
            </button>
          </>
        )}
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FilterBar component
// ---------------------------------------------------------------------------

export function FilterBar({
  statusFilter,
  epicFilter,
  assigneeFilter,
  poStatusFilter,
  editStateFilter,
  onStatusFilterChange,
  onEpicFilterChange,
  onAssigneeFilterChange,
  onPoStatusFilterChange,
  onEditStateFilterChange,
  statusOptions,
  epicOptions,
  assigneeOptions,
  sprintFilter,
  onSprintFilterChange,
  sprintOptions,
  sprintNameMap,
  sortField,
  sortDir,
  onSortChange,
  visibleColumns,
  onColumnToggle,
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
  poStatusFilter: Set<string>;
  editStateFilter: Set<string>;
  onStatusFilterChange: (next: Set<string>) => void;
  onEpicFilterChange: (next: Set<string>) => void;
  onAssigneeFilterChange: (next: Set<string>) => void;
  onPoStatusFilterChange: (next: Set<string>) => void;
  onEditStateFilterChange: (next: Set<string>) => void;
  statusOptions: string[];
  epicOptions: string[];
  assigneeOptions: string[];
  sprintFilter?: Set<string>;
  onSprintFilterChange?: (next: Set<string>) => void;
  sprintOptions?: string[];
  sprintNameMap?: Record<string, string>;
  sortField: SortField;
  sortDir: SortDir;
  onSortChange: (field: SortField, dir: SortDir) => void;
  visibleColumns: Set<ColumnId>;
  onColumnToggle: (id: ColumnId, show: boolean) => void;
  noBorder?: boolean;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  onSaveView?: (title: string) => void;
  onDeleteView?: () => void;
  activeView?: SavedView | null;
}) {
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const saveViewRef = useRef<HTMLDivElement>(null);

  const poStatusOptions = PO_STATUS_OPTIONS.filter((o) => o.value !== null).map((o) => o.value as string);
  const editStateValues = EDIT_STATE_OPTIONS.map((o) => o.value);

  const hasActiveFilters =
    statusFilter.size > 0 ||
    epicFilter.size > 0 ||
    assigneeFilter.size > 0 ||
    poStatusFilter.size > 0 ||
    editStateFilter.size > 0 ||
    (sprintFilter?.size ?? 0) > 0;

  function handleClearAll() {
    onStatusFilterChange(new Set());
    onEpicFilterChange(new Set());
    onAssigneeFilterChange(new Set());
    onPoStatusFilterChange(new Set());
    onEditStateFilterChange(new Set());
    if (onSprintFilterChange) onSprintFilterChange(new Set());
  }

  return (
    <div className={`flex h-[50px] items-center gap-2 px-5${noBorder ? "" : " border-b border-white/[0.06]"}`}>
      {onSearchChange && (
        <div className="relative flex items-center shrink-0">
          <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-white/25" strokeWidth={1.5} />
          <input
            type="text"
            value={searchQuery ?? ""}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search tickets..."
            className="h-8 w-52 rounded-lg border border-white/[0.08] bg-white/[0.03] pl-8 pr-3 text-sm text-white/80 placeholder-white/25 focus:outline-none focus:border-[var(--color-brand-500)]/50 focus:bg-white/[0.05]"
            style={{ boxShadow: "inset 0 1px 2px rgba(0,0,0,0.18)" }}
          />
          {(searchQuery?.length ?? 0) > 0 && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2.5 flex h-4 w-4 items-center justify-center rounded-full text-white/30 hover:text-white/60 cursor-pointer"
              style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
            >
              <X className="h-2.5 w-2.5" strokeWidth={2} />
            </button>
          )}
        </div>
      )}
      {onSearchChange && <div className="h-5 w-px bg-white/[0.08] shrink-0" />}
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
                style={{ backgroundColor: color?.text ?? "#94a3b8" }}
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
              className="inline-block rounded px-1.5 py-0.5 text-xs"
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
        label="PO Status"
        options={poStatusOptions}
        selected={poStatusFilter}
        onChange={onPoStatusFilterChange}
        renderOption={(v) => {
          const color = PO_STATUS_COLORS[v];
          return (
            <span className="flex items-center gap-2">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: color?.dot ?? "#94a3b8" }}
              />
              {v}
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
        <button
          type="button"
          onClick={handleClearAll}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-white/35 cursor-pointer hover:bg-white/[0.04] hover:text-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
          style={{ transition: "background-color 80ms, color 80ms" }}
          title="Clear all filters"
        >
          <X className="h-3 w-3" strokeWidth={1.5} />
          Clear all
        </button>
      )}

      <div className="flex-1" />

      <SortDropdown
        field={sortField}
        direction={sortDir}
        onChange={onSortChange}
      />

      {/* Save view */}
      {onSaveView && (
        <div ref={saveViewRef} className="relative">
          <button
            type="button"
            onClick={() => setSaveViewOpen((v) => !v)}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98] ${
              activeView
                ? "text-[var(--color-brand-400)] hover:bg-[var(--color-brand-500)]/10"
                : "text-white/35 hover:bg-white/[0.04] hover:text-white/60"
            }`}
            style={{ transition: "background-color 120ms, color 120ms, transform 80ms" }}
            title={activeView ? `Saved view: ${activeView.title}` : "Save current filter view"}
          >
            <Bookmark
              className="h-3.5 w-3.5"
              strokeWidth={1.5}
              fill={activeView ? "currentColor" : "none"}
            />
          </button>
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

      <ColumnToggle visible={visibleColumns} onChange={onColumnToggle} />
    </div>
  );
}
