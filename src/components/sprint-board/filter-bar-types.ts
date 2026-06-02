import { getEpicColor, READINESS_OPTIONS, READINESS_CONFIG, JIRA_STATUS_COLORS } from "@/types/ticket";

// Legacy PO Status colors -- kept for TicketSidebar migration; remove after all consumers updated.
export const PO_STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  New: { bg: "var(--color-status-neutral-subtle)", text: "var(--color-status-neutral)", dot: "var(--color-status-neutral)" },
  Draft: { bg: "var(--color-status-caution-subtle)", text: "var(--color-status-caution)", dot: "var(--color-status-caution)" },
  "Awaiting Feedback": { bg: "var(--color-status-warning-subtle)", text: "var(--color-status-warning)", dot: "var(--color-status-warning)" },
  "Ready for Refinement": { bg: "var(--color-status-info-subtle)", text: "var(--color-status-info)", dot: "var(--color-status-info)" },
  Ready: { bg: "var(--color-status-success-subtle)", text: "var(--color-status-success)", dot: "var(--color-status-success)" },
  "On Hold": { bg: "rgba(100, 100, 120, 0.08)", text: "#64648a", dot: "#64648a" },
};

// Edit state display config for filter labels
export const EDIT_STATE_OPTIONS: { value: string; label: string; dotClass: string }[] = [
  { value: "draft", label: "Unsaved draft", dotClass: "bg-[var(--color-icon-task)]/40" },
  { value: "local_edits", label: "Local changes", dotClass: "bg-[var(--color-icon-task)]/70" },
  { value: "conflict", label: "Conflict", dotClass: "bg-[var(--color-status-warning)]/70" },
  { value: "removed", label: "Removed from Jira", dotClass: "bg-red-400/60" },
];

// ---------------------------------------------------------------------------
// Sort types
// ---------------------------------------------------------------------------

export type SortField = "rank" | "quality" | "bv" | "points" | "key" | "title" | "epic" | "jiraStatus" | "assignee" | "readiness" | "lastChanged";
export type SortDir = "asc" | "desc";

// ---------------------------------------------------------------------------
// Saved view type
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
// Column types
// ---------------------------------------------------------------------------

export type ColumnId = "type" | "key" | "title" | "epic" | "jiraStatus" | "sprint" | "points" | "assignee" | "flagged" | "poStatus" | "quality" | "bv" | "notes" | "pipeline";

export const COLUMNS: { id: ColumnId; label: string; alwaysVisible?: boolean }[] = [
  { id: "key", label: "Key" },
  { id: "title", label: "Title" },
  { id: "epic", label: "Epic" },
  { id: "sprint", label: "Sprint" },
  { id: "flagged", label: "Flagged" },
  { id: "points", label: "Points" },
  { id: "bv", label: "Business Value (BV)" },
  { id: "notes", label: "Notes" },
  { id: "pipeline", label: "Pipeline" },
  { id: "assignee", label: "Assignee" },
  { id: "quality", label: "Quality Score (QS)" },
];

// Pipeline is intentionally absent: its health/deploy badges now live in the
// ticket hover card (BRDG-251), so the column is hidden by default but still
// available via the column toggle.
export const DEFAULT_VISIBLE: ColumnId[] = ["key", "title", "epic", "flagged", "points", "bv", "notes", "assignee", "quality"];

export type ColumnPreset = "full" | "compact";

export const COLUMN_PRESETS: Record<ColumnPreset, ColumnId[]> = {
  full: COLUMNS.map((c) => c.id),
  compact: ["key", "title", "points", "assignee"],
};

// ---------------------------------------------------------------------------
// Sort options
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

// ---------------------------------------------------------------------------
// Gaps options
// ---------------------------------------------------------------------------

export const GAPS_OPTIONS: { value: string; label: string; dotClass: string }[] = [
  { value: "no_points", label: "No story points", dotClass: "bg-[var(--color-status-caution)]/50" },
  { value: "no_bv", label: "No business value", dotClass: "bg-[var(--color-status-caution)]/50" },
];

// Re-export ticket utilities used by filter renderers
export { getEpicColor, READINESS_OPTIONS, READINESS_CONFIG, JIRA_STATUS_COLORS };
