"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { getEpicColor, READINESS_OPTIONS, READINESS_CONFIG, JIRA_STATUS_COLORS } from "@/types/ticket";
import { IssueTypeIcon, ISSUE_TYPE_COLORS } from "@/components/shared/IssueTypeIcon";
import { ArrowUpDown, ArrowUp, ArrowDown, Columns3, Search, X, Bookmark, Check, GripVertical } from "lucide-react";
import { FilterDropdown } from "@/components/shared/FilterDropdown";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/shared/TextInput";
import { BarContainer, BarDivider } from "@/components/shared/BarContainer";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// Legacy PO Status colors -- kept for TicketSidebar migration; remove after all consumers updated.
export const PO_STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  New: { bg: "rgba(148, 163, 184, 0.1)", text: "#94a3b8", dot: "#94a3b8" },
  Draft: { bg: "rgba(234, 179, 8, 0.1)", text: "#eab308", dot: "#eab308" },
  "Awaiting Feedback": { bg: "rgba(234, 135, 68, 0.1)", text: "#ea8744", dot: "#ea8744" },
  "Ready for Refinement": { bg: "rgba(96, 165, 250, 0.1)", text: "#60a5fa", dot: "#60a5fa" },
  Ready: { bg: "rgba(46, 145, 73, 0.1)", text: "#4aaa60", dot: "#4aaa60" },
  "On Hold": { bg: "rgba(100, 100, 120, 0.08)", text: "#64648a", dot: "#64648a" },
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

export type SortField = "rank" | "quality" | "bv" | "points" | "key" | "title" | "epic" | "jiraStatus" | "assignee" | "readiness" | "lastChanged";
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
    readiness: string[];
    /** @deprecated Use readiness instead */
    poStatus?: string[];
    editState: string[];
    issueType?: string[];
    gaps?: string[];
    team?: string[];
    sprint?: string[];
  };
  sort: { field: SortField; direction: SortDir };
  columnConfig?: {
    visible: ColumnId[];
    order: ColumnId[];
  };
}

// ---------------------------------------------------------------------------
// Column types (exported for reuse)
// ---------------------------------------------------------------------------

export type ColumnId = "type" | "key" | "title" | "epic" | "jiraStatus" | "sprint" | "points" | "assignee" | "flagged" | "poStatus" | "quality" | "bv" | "notes" | "pipeline";

export const COLUMNS: { id: ColumnId; label: string; alwaysVisible?: boolean }[] = [
  { id: "key", label: "Key" },
  { id: "title", label: "Title" },
  { id: "epic", label: "Epic" },
  { id: "sprint", label: "Sprint" },
  { id: "points", label: "Points" },
  { id: "assignee", label: "Assignee" },
  { id: "flagged", label: "Flagged" },
  { id: "quality", label: "Quality Score (QS)" },
  { id: "bv", label: "Business Value (BV)" },
  { id: "notes", label: "Notes" },
  { id: "pipeline", label: "Pipeline" },
];

export const DEFAULT_VISIBLE: ColumnId[] = ["key", "title", "epic", "points", "assignee", "flagged", "quality", "bv", "notes", "pipeline"];

export type ColumnPreset = "full" | "compact";

export const COLUMN_PRESETS: Record<ColumnPreset, ColumnId[]> = {
  full: COLUMNS.map((c) => c.id),
  compact: ["key", "title", "points", "assignee"],
};

// ---------------------------------------------------------------------------
// Sort dropdown (icon-only)
// ---------------------------------------------------------------------------

export const SORT_OPTIONS: { field: SortField; label: string; defaultDir: SortDir }[] = [
  { field: "rank", label: "Jira rank (default)", defaultDir: "asc" },
  { field: "lastChanged", label: "Last changed", defaultDir: "desc" },
  { field: "quality", label: "Quality Score", defaultDir: "desc" },
  { field: "bv", label: "Business Value", defaultDir: "desc" },
  { field: "points", label: "Story points", defaultDir: "desc" },
  { field: "key", label: "Ticket key", defaultDir: "asc" },
  { field: "title", label: "Title", defaultDir: "asc" },
  { field: "jiraStatus", label: "Jira status", defaultDir: "asc" },
  { field: "assignee", label: "Assignee", defaultDir: "asc" },
  { field: "readiness", label: "Readiness", defaultDir: "asc" },
];

export function SortDropdown({
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
    <div ref={ref} className="relative flex items-center gap-1">
      <Button
        variant={isActive ? "soft" : "ghost"}
        size="md"
        iconOnly
        onClick={() => setOpen(!open)}
        icon={
          <span className="relative flex items-center justify-center">
            <ArrowUpDown className="h-3.5 w-3.5" strokeWidth={1.5} />
            {isActive && (
              <span className="absolute -top-0.5 -right-1 h-[6px] w-[6px] rounded-full bg-[var(--color-brand-400)] ring-2 ring-[var(--color-surface-base)]" />
            )}
          </span>
        }
        title={isActive ? `Sorted: ${activeLabel} (${direction === "asc" ? "ascending" : "descending"})` : "Sort"}
        aria-label={isActive ? `Sort: ${activeLabel} (${direction === "asc" ? "ascending" : "descending"})` : "Sort"}
        className={isActive ? "" : "border-0 bg-transparent text-text-tertiary hover:bg-hover-list-item hover:text-text-secondary"}
      />

      {open && (
        <div className="absolute top-full right-0 z-50 mt-1 w-52 rounded-lg border border-border-strong bg-[var(--color-surface-floating)] py-1 shadow-[var(--shadow-lg)]">
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
              className={`flex w-full items-center justify-between px-3 py-1.5 text-xs cursor-pointer hover:bg-hover-list-item ${
                opt.field === field ? "text-text-primary bg-overlay-subtle" : "text-text-secondary"
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
              <div className="my-1 h-px bg-overlay-default" />
              <button
                type="button"
                onClick={() => {
                  onChange("rank", "asc");
                  setOpen(false);
                }}
                className="flex w-full items-center px-3 py-1.5 text-xs text-text-tertiary cursor-pointer hover:bg-hover-list-item hover:text-text-secondary"
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
// Column toggle dropdown (exported for use in header)
// ---------------------------------------------------------------------------

function SortableColumnItem({
  colDef,
  checked,
  onToggle,
}: {
  colDef: { id: ColumnId; label: string };
  checked: boolean;
  onToggle: (id: ColumnId, show: boolean) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: colDef.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex w-full items-center gap-1.5 pr-3.5 py-1 text-body text-text-secondary hover:bg-hover-list-item hover:text-text-primary"
    >
      <div
        className="flex shrink-0 items-center justify-center w-7 h-7 cursor-grab active:cursor-grabbing text-text-muted hover:text-text-tertiary"
        {...listeners}
        {...attributes}
      >
        <GripVertical size={12} strokeWidth={1.5} />
      </div>
      <label
        className="flex flex-1 items-center gap-3 cursor-pointer select-none"
      >
        <span
          className="flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[4px] border"
          style={{
            backgroundColor: checked ? "var(--color-brand-500)" : "transparent",
            borderColor: checked ? "var(--color-brand-500)" : "var(--color-text-muted)",
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
          onChange={(e) => onToggle(colDef.id, e.target.checked)}
          className="sr-only"
        />
        {colDef.label}
      </label>
    </div>
  );
}

const COLUMN_LABEL_MAP: Record<ColumnId, string> = Object.fromEntries(
  COLUMNS.map((c) => [c.id, c.label]),
) as Record<ColumnId, string>;

export function ColumnToggle({
  visible,
  order,
  onChange,
  onReorder,
  onReset,
}: {
  visible: Set<ColumnId>;
  order: ColumnId[];
  onChange: (id: ColumnId, show: boolean) => void;
  onReorder: (activeId: ColumnId, overId: ColumnId) => void;
  onReset?: () => void;
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 3 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (over && active.id !== over.id) {
        onReorder(active.id as ColumnId, over.id as ColumnId);
      }
    },
    [onReorder],
  );

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="md"
        iconOnly
        onClick={() => setOpen(!open)}
        icon={<Columns3 className="h-3.5 w-3.5" strokeWidth={1.5} />}
        title="Toggle columns"
        aria-label="Toggle columns"
        className="border-0 bg-transparent text-text-tertiary hover:bg-hover-list-item hover:text-text-secondary"
      />
      {open && (
        <div className="absolute top-full right-0 z-50 mt-1.5 w-56 rounded-xl border border-border-strong bg-[var(--color-surface-floating)] shadow-[var(--shadow-xl)] overflow-hidden flex flex-col">
          <div className="overflow-y-auto max-h-[70vh] py-1.5">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={order} strategy={verticalListSortingStrategy}>
                {order.map((id) => (
                  <SortableColumnItem
                    key={id}
                    colDef={{ id, label: COLUMN_LABEL_MAP[id] }}
                    checked={visible.has(id)}
                    onToggle={onChange}
                  />
                ))}
              </SortableContext>
            </DndContext>
            {/* Columns absent from the current order (e.g. when a saved view has fewer columns).
                Enabling one appends it to order via toggleColumn. */}
            {COLUMNS.filter((c) => !order.includes(c.id)).length > 0 && (
              <>
                <div className="my-1 h-px bg-overlay-default" />
                {COLUMNS.filter((c) => !order.includes(c.id)).map((c) => (
                  <div
                    key={c.id}
                    className="flex w-full items-center gap-1.5 pr-3.5 py-1 text-body text-text-tertiary hover:bg-hover-list-item hover:text-text-secondary"
                  >
                    <div className="flex shrink-0 items-center justify-center w-7 h-7 text-text-muted">
                      <GripVertical size={12} strokeWidth={1.5} />
                    </div>
                    <label className="flex flex-1 items-center gap-3 cursor-pointer select-none">
                      <span
                        className="flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[4px] border"
                        style={{ backgroundColor: "transparent", borderColor: "var(--color-overlay-strong)" }}
                      />
                      <input
                        type="checkbox"
                        checked={false}
                        onChange={() => onChange(c.id, true)}
                        className="sr-only"
                      />
                      {c.label}
                    </label>
                  </div>
                ))}
              </>
            )}
          </div>
          {onReset && (
            <>
              <div className="h-px bg-overlay-default" />
              <button
                type="button"
                onClick={() => { onReset(); setOpen(false); }}
                className="flex w-full items-center px-3.5 py-1.5 text-xs text-text-tertiary cursor-pointer hover:bg-hover-list-item hover:text-text-secondary"
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
      className="absolute top-full right-0 z-50 mt-1.5 w-64 overflow-hidden rounded-xl border border-border-strong bg-[var(--color-surface-floating)] p-3 shadow-[var(--shadow-xl)]"
    >
      <p className="mb-2 text-label font-medium text-text-tertiary">
        {isUpdate ? "Update saved view" : "Save current filter view"}
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <TextInput
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="View name..."
          style={{ boxShadow: "inset 0 1px 2px rgba(0,0,0,0.18)" }}
        />
        <Button
          type="submit"
          variant="primary"
          size="sm"
          icon={<Check className="h-3 w-3" strokeWidth={2} />}
          disabled={!title.trim()}
          className="w-full"
        >
          {isUpdate ? "Update view" : "Save view"}
        </Button>
        {isUpdate && onDelete && (
          <>
            <div className="h-px bg-overlay-default" />
            <Button
              type="button"
              variant="destructive"
              size="sm"
              icon={<X className="h-3 w-3" strokeWidth={1.5} />}
              onClick={() => { onDelete(); onClose(); }}
              className="w-full"
            >
              Delete view
            </Button>
          </>
        )}
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expandable search
// ---------------------------------------------------------------------------

function ExpandableSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (q: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isOpen = expanded || value.length > 0;

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node) && !value) {
        setExpanded(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, value]);

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => {
          setExpanded(true);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-hover-list-item cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
        style={{ transition: "color 120ms, background-color 120ms" }}
        title="Search tickets"
      >
        <Search className="h-3.5 w-3.5" strokeWidth={1.5} />
      </button>
    );
  }

  return (
    <div ref={containerRef} className="relative flex items-center shrink-0">
      <TextInput
        ref={inputRef}
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          if (!value) setExpanded(false);
        }}
        placeholder="Search tickets..."
        icon={<Search className="h-3.5 w-3.5" strokeWidth={1.5} />}
        className="h-8 w-52 pr-8"
        style={{ boxShadow: "inset 0 1px 2px rgba(0,0,0,0.18)" }}
      />
      {value.length > 0 && (
        <button
          type="button"
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
          className="absolute right-2.5 flex h-4 w-4 items-center justify-center rounded-full text-text-tertiary hover:text-text-secondary cursor-pointer"
          style={{ backgroundColor: "var(--color-overlay-default)" }}
        >
          <X className="h-2.5 w-2.5" strokeWidth={2} />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FilterBar component
// ---------------------------------------------------------------------------

export const GAPS_OPTIONS: { value: string; label: string; dotClass: string }[] = [
  { value: "no_points", label: "No story points", dotClass: "bg-[#eab308]/50" },
  { value: "no_bv", label: "No business value", dotClass: "bg-[#eab308]/50" },
];

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

  const hasActiveFilters =
    statusFilter.size > 0 ||
    epicFilter.size > 0 ||
    assigneeFilter.size > 0 ||
    readinessFilter.size > 0 ||
    editStateFilter.size > 0 ||
    issueTypeFilter.size > 0 ||
    (gapsFilter?.size ?? 0) > 0 ||
    (teamFilter?.size ?? 0) > 0 ||
    (sprintFilter?.size ?? 0) > 0;

  function handleClearAll() {
    onStatusFilterChange(new Set());
    onEpicFilterChange(new Set());
    onAssigneeFilterChange(new Set());
    onReadinessFilterChange(new Set());
    onEditStateFilterChange(new Set());
    onIssueTypeFilterChange(new Set());
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
                style={{ backgroundColor: cfg?.color ?? "#94a3b8" }}
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
