"use client";

import { useState, useRef, useEffect } from "react";
import { EPIC_COLORS, PO_STATUS_OPTIONS } from "@/types/ticket";
import { JIRA_STATUS_COLORS } from "../shared/StatusBadge";
import { ChevronDown, ArrowUpDown, ArrowUp, ArrowDown, Columns3 } from "lucide-react";

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
        className={`flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:bg-white/[0.06] ${
          isActive
            ? "border-[var(--color-brand-500)]/30 bg-[var(--color-brand-500)]/8 text-[var(--color-brand-300)]"
            : "border-white/[0.06] bg-white/[0.02] text-white/40 hover:bg-white/[0.04] hover:text-white/60"
        }`}
      >
        {label}
        {isActive && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-brand-500)]/20 px-1 text-[10px] font-medium text-[var(--color-brand-300)]">
            {selected.size}
          </span>
        )}
        <ChevronDown className="h-3 w-3 opacity-40" strokeWidth={1.5} />
      </button>

      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-56 rounded-lg border border-white/[0.08] bg-[var(--color-surface-floating)] py-1 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
          {isActive && (
            <button
              type="button"
              onClick={() => onChange(new Set())}
              className="flex w-full items-center px-3 py-1.5 text-xs text-white/30 cursor-pointer hover:bg-white/[0.04] hover:text-white/50"
            >
              Clear filter
            </button>
          )}
          {options.map((opt) => (
            <label
              key={opt}
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-xs text-white/60 cursor-pointer hover:bg-white/[0.04]"
            >
              <input
                type="checkbox"
                checked={selected.has(opt)}
                onChange={(e) => {
                  const next = new Set(selected);
                  if (e.target.checked) next.add(opt);
                  else next.delete(opt);
                  onChange(next);
                }}
                className="h-3 w-3 rounded border-white/20 bg-transparent accent-[var(--color-brand-500)] cursor-pointer"
              />
              {renderOption ? renderOption(opt) : opt}
            </label>
          ))}
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
        className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:bg-white/[0.06] ${
          isActive
            ? "border border-[var(--color-brand-500)]/30 bg-[var(--color-brand-500)]/8 text-[var(--color-brand-300)] hover:bg-[var(--color-brand-500)]/12"
            : "text-white/30 hover:bg-white/[0.04] hover:text-white/50"
        }`}
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
        className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs text-white/30 cursor-pointer hover:bg-white/[0.04] hover:text-white/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:bg-white/[0.06]"
        title="Toggle columns"
      >
        <Columns3 className="h-3.5 w-3.5" strokeWidth={1.5} />
        Columns
      </button>
      {open && (
        <div className="absolute top-full right-0 z-50 mt-1 w-44 rounded-lg border border-white/[0.08] bg-[var(--color-surface-floating)] py-1 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
          {COLUMNS.map((col) => (
            <label
              key={col.id}
              className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-xs cursor-pointer hover:bg-white/[0.04] ${
                col.alwaysVisible ? "text-white/25" : "text-white/60"
              }`}
            >
              <input
                type="checkbox"
                checked={visible.has(col.id)}
                disabled={col.alwaysVisible}
                onChange={(e) => onChange(col.id, e.target.checked)}
                className="h-3 w-3 rounded border-white/20 bg-transparent accent-[var(--color-brand-500)] cursor-pointer disabled:opacity-30"
              />
              {col.label}
            </label>
          ))}
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
  sortField,
  sortDir,
  onSortChange,
  visibleColumns,
  onColumnToggle,
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
  sortField: SortField;
  sortDir: SortDir;
  onSortChange: (field: SortField, dir: SortDir) => void;
  visibleColumns: Set<ColumnId>;
  onColumnToggle: (id: ColumnId, show: boolean) => void;
}) {
  const poStatusOptions = PO_STATUS_OPTIONS.filter((o) => o.value !== null).map((o) => o.value as string);

  return (
    <div className="flex items-center gap-2 border-b border-white/[0.06] px-5 py-2.5">
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
          const color = EPIC_COLORS[v];
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
