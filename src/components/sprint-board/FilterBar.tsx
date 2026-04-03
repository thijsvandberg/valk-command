"use client";

import { useState, useRef, useEffect } from "react";
import { getEpicColor, PO_STATUS_OPTIONS } from "@/types/ticket";
import { JIRA_STATUS_COLORS } from "../shared/StatusBadge";
import { ChevronDown, ArrowUpDown, ArrowUp, ArrowDown, Columns3, Search, X } from "lucide-react";

// -- PO Status colors (needed for filter rendering) --

export const PO_STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  Nieuw: { bg: "rgba(148, 163, 184, 0.1)", text: "#94a3b8", dot: "#94a3b8" },
  Uitwerken: { bg: "rgba(234, 179, 8, 0.1)", text: "#eab308", dot: "#eab308" },
  "Wachten op feedback": { bg: "rgba(234, 135, 68, 0.1)", text: "#ea8744", dot: "#ea8744" },
  "Klaar voor refinement": { bg: "rgba(96, 165, 250, 0.1)", text: "#60a5fa", dot: "#60a5fa" },
  Ready: { bg: "rgba(46, 145, 73, 0.1)", text: "#4aaa60", dot: "#4aaa60" },
  Geparkeerd: { bg: "rgba(100, 100, 120, 0.08)", text: "#64648a", dot: "#64648a" },
};

// ---------------------------------------------------------------------------
// Sort types (exported for reuse)
// ---------------------------------------------------------------------------

export type SortField = "rank" | "quality" | "points" | "key";
export type SortDir = "asc" | "desc";

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

// ---------------------------------------------------------------------------
// Multi-select filter dropdown (reusable)
// ---------------------------------------------------------------------------

function FilterDropdown({
  label,
  options,
  selected,
  onChange,
  renderOption,
}: {
  label: string;
  options: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  renderOption?: (value: string) => React.ReactNode;
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

  const isActive = selected.size > 0;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98] ${
          isActive
            ? "border-[var(--color-brand-500)]/35 bg-[var(--color-brand-500)]/10 text-[var(--color-brand-300)]"
            : "border-white/[0.07] bg-white/[0.03] text-white/50 hover:bg-white/[0.06] hover:text-white/75 hover:border-white/[0.12]"
        }`}
        style={{ transition: "background-color 120ms, border-color 120ms, color 120ms, transform 80ms" }}
      >
        {label}
        {isActive && (
          <span
            className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-semibold"
            style={{ backgroundColor: "var(--color-brand-500)", color: "#fff" }}
          >
            {selected.size}
          </span>
        )}
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 opacity-40 ${open ? "rotate-180" : ""}`} strokeWidth={1.5} style={{ transition: "transform 150ms" }} />
      </button>

      {open && (
        <div className="absolute top-full left-0 z-50 mt-1.5 w-60 overflow-hidden rounded-xl border border-white/[0.08] bg-[var(--color-surface-floating)] py-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.55),0_4px_12px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.04)]">
          <button
            type="button"
            onClick={() => onChange(new Set())}
            className="flex w-full items-center gap-2 px-3.5 py-2 text-xs text-white/35 cursor-pointer hover:bg-white/[0.04] hover:text-white/55"
            style={{ transition: "background-color 80ms, color 80ms" }}
          >
            <X className="h-3 w-3" strokeWidth={1.5} />
            Clear filter
          </button>
          <div className="my-1 h-px bg-white/[0.05]" />
          {options.map((opt) => {
            const checked = selected.has(opt);
            return (
              <label
                key={opt}
                className="flex w-full items-center gap-3 px-3.5 py-2.5 text-[13px] text-white/65 cursor-pointer hover:bg-white/[0.04] hover:text-white/85"
                style={{ transition: "background-color 80ms, color 80ms" }}
              >
                <span
                  className="flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[4px] border"
                  style={{
                    backgroundColor: checked ? "var(--color-brand-500)" : "transparent",
                    borderColor: checked ? "var(--color-brand-500)" : "rgba(255,255,255,0.18)",
                    transition: "background-color 100ms, border-color 100ms",
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
                  onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(opt);
                    else next.delete(opt);
                    onChange(next);
                  }}
                  className="sr-only"
                />
                {renderOption ? renderOption(opt) : <span>{opt}</span>}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sort dropdown
// ---------------------------------------------------------------------------

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

  const options: { field: SortField; label: string }[] = [
    { field: "rank", label: "Jira rank (default)" },
    { field: "quality", label: "Quality score" },
    { field: "points", label: "Story points" },
    { field: "key", label: "Ticket key" },
  ];

  const activeLabel = options.find((o) => o.field === field)?.label ?? "Sort";

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
          {options.map((opt) => (
            <button
              key={opt.field}
              type="button"
              onClick={() => {
                if (opt.field === field) {
                  onChange(opt.field, direction === "asc" ? "desc" : "asc");
                } else {
                  onChange(opt.field, opt.field === "quality" || opt.field === "points" ? "desc" : "asc");
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

// ---------------------------------------------------------------------------
// Sprint filter dropdown (used in All view, styled like FilterDropdown)
// ---------------------------------------------------------------------------

export function SprintFilterBar({
  sprintOptions,
  sprintFilter,
  onSprintFilterChange,
  sprintNameMap,
}: {
  sprintOptions: string[];
  sprintFilter: Set<string>;
  onSprintFilterChange: (next: Set<string>) => void;
  sprintNameMap: Record<string, string>;
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

  const isActive = sprintFilter.size > 0;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98] ${
          isActive
            ? "border-[var(--color-brand-500)]/35 bg-[var(--color-brand-500)]/10 text-[var(--color-brand-300)]"
            : "border-white/[0.07] bg-white/[0.03] text-white/50 hover:bg-white/[0.06] hover:text-white/75 hover:border-white/[0.12]"
        }`}
        style={{ transition: "background-color 120ms, border-color 120ms, color 120ms, transform 80ms" }}
      >
        Sprint
        {isActive && (
          <span
            className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-semibold"
            style={{ backgroundColor: "var(--color-brand-500)", color: "#fff" }}
          >
            {sprintFilter.size}
          </span>
        )}
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 opacity-40 ${open ? "rotate-180" : ""}`} strokeWidth={1.5} style={{ transition: "transform 150ms" }} />
      </button>

      {open && (
        <div className="absolute top-full right-0 z-50 mt-1.5 w-64 overflow-hidden rounded-xl border border-white/[0.08] bg-[var(--color-surface-floating)] py-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.55),0_4px_12px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.04)]">
          <button
            type="button"
            onClick={() => onSprintFilterChange(new Set())}
            className="flex w-full items-center gap-2 px-3.5 py-2 text-xs text-white/35 cursor-pointer hover:bg-white/[0.04] hover:text-white/55"
            style={{ transition: "background-color 80ms, color 80ms" }}
          >
            <X className="h-3 w-3" strokeWidth={1.5} />
            Clear filter
          </button>
          <div className="my-1 h-px bg-white/[0.05]" />
          {sprintOptions.map((id) => {
            const name = sprintNameMap[id] ?? id;
            const checked = sprintFilter.has(id);
            return (
              <label
                key={id}
                className="flex w-full items-center gap-3 px-3.5 py-2.5 text-[13px] text-white/65 cursor-pointer hover:bg-white/[0.04] hover:text-white/85"
                style={{ transition: "background-color 80ms, color 80ms" }}
              >
                <span
                  className="flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[4px] border"
                  style={{
                    backgroundColor: checked ? "var(--color-brand-500)" : "transparent",
                    borderColor: checked ? "var(--color-brand-500)" : "rgba(255,255,255,0.18)",
                    transition: "background-color 100ms, border-color 100ms",
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
                  onChange={(e) => {
                    const next = new Set(sprintFilter);
                    if (e.target.checked) next.add(id);
                    else next.delete(id);
                    onSprintFilterChange(next);
                  }}
                  className="sr-only"
                />
                {name}
              </label>
            );
          })}
        </div>
      )}
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
  onStatusFilterChange,
  onEpicFilterChange,
  onAssigneeFilterChange,
  onPoStatusFilterChange,
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
}: {
  statusFilter: Set<string>;
  epicFilter: Set<string>;
  assigneeFilter: Set<string>;
  poStatusFilter: Set<string>;
  onStatusFilterChange: (next: Set<string>) => void;
  onEpicFilterChange: (next: Set<string>) => void;
  onAssigneeFilterChange: (next: Set<string>) => void;
  onPoStatusFilterChange: (next: Set<string>) => void;
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
}) {
  const poStatusOptions = PO_STATUS_OPTIONS.filter((o) => o.value !== null).map((o) => o.value as string);

  return (
    <div className={`flex items-center gap-2 px-5 py-2.5${noBorder ? "" : " border-b border-white/[0.06]"}`}>
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
          const color = JIRA_STATUS_COLORS[v];
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
      {sprintFilter && onSprintFilterChange && sprintOptions && sprintNameMap && (
        <SprintFilterBar
          sprintOptions={sprintOptions}
          sprintFilter={sprintFilter}
          onSprintFilterChange={onSprintFilterChange}
          sprintNameMap={sprintNameMap}
        />
      )}
      <div className="flex-1" />
      <SortDropdown
        field={sortField}
        direction={sortDir}
        onChange={onSortChange}
      />
      <ColumnToggle visible={visibleColumns} onChange={onColumnToggle} />
    </div>
  );
}
