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
  { value: "local_edits", label: "Local changes", dotClass: "bg-[var(--color-icon-task)]/70" },
  { value: "conflict", label: "Conflict", dotClass: "bg-[var(--color-status-warning)]/70" },
  { value: "removed", label: "Removed from Jira", dotClass: "bg-red-400/60" },
];

// ---------------------------------------------------------------------------
// Sort types
// ---------------------------------------------------------------------------

export type SortField = "rank" | "quality" | "bv" | "points" | "key" | "title" | "epic" | "jiraStatus" | "assignee" | "readiness" | "lastChanged" | "created";
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
    /** Headerless board: which inline tags are visible (BRDG-239). */
    visibleTags?: InlineTagId[];
    /** @deprecated Legacy column visibility, migrated to `visibleTags`. */
    visible?: ColumnId[];
    /** @deprecated Column ordering was removed in BRDG-239. */
    order?: ColumnId[];
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
// Headerless board: toggleable inline row tags (BRDG-239)
// ---------------------------------------------------------------------------
// The Jira-style board row has a fixed anatomy (pill, title, epic, SP/BV, assignee)
// plus a small set of secondary signals the PO can individually show or hide.
// `poReadiness` maps onto the pill's existing readiness segment; the others render
// as conditional inline tags. The hover card always shows the full set.

export type InlineTagId =
  | "flag"
  | "refinement"
  | "quality"
  | "notes"
  | "poReadiness"
  | "editState"
  | "testDoc"
  | "storyPoints"
  | "businessValue"
  | "epic"
  | "assignee"
  | "creator";

// Toggleable row fields, split into the secondary signals and the always-present
// badges (SP/BV/epic/assignee). The `group` boundary drives a divider in the
// field-toggle dropdown (BRDG-299).
export const ROW_FIELDS: { id: InlineTagId; label: string; group: "signal" | "badge" }[] = [
  { id: "flag", label: "Flag", group: "signal" },
  { id: "refinement", label: "Refinement", group: "signal" },
  { id: "quality", label: "Quality Score (QS)", group: "signal" },
  { id: "notes", label: "Notes", group: "signal" },
  { id: "poReadiness", label: "PO readiness", group: "signal" },
  { id: "editState", label: "Edit state", group: "signal" },
  { id: "testDoc", label: "Test documentation", group: "signal" },
  { id: "storyPoints", label: "Story points (SP)", group: "badge" },
  { id: "businessValue", label: "Business value (BV)", group: "badge" },
  { id: "epic", label: "Epic", group: "badge" },
  { id: "assignee", label: "Assignee", group: "badge" },
  { id: "creator", label: "Reporter", group: "badge" },
];

// The board shows every row field by default except Reporter (an opt-in signal
// surfaced primarily in the inbox) and Test documentation (a sprint-delivery
// check the PO only needs occasionally, BRDG-426).
export const DEFAULT_VISIBLE_TAGS: InlineTagId[] = ROW_FIELDS.map((f) => f.id).filter((id) => id !== "creator" && id !== "testDoc");

// Badge fields added after the initial headerless board (BRDG-299). They were
// always shown before, so an existing persisted set that predates them must keep
// them visible; useColumnConfig applies this once on load.
export const BADGE_DEFAULT_TAGS: InlineTagId[] = ["storyPoints", "businessValue", "epic", "assignee"];

// New story inbox default inline fields (BRDG-357): a lean subset, since the
// inbox is a quick triage view. Epic/SP/Assignee on; refinement/QS/notes/PO
// readiness/edit-state/BV off by default. The PO can toggle the rest via Display.
export const INBOX_DEFAULT_VISIBLE_TAGS: InlineTagId[] = ["epic", "storyPoints", "assignee", "creator"];

// Migration map from the legacy column ids to the new inline tag ids (BRDG-239).
// Note: poReadiness/refinement/editState have no legacy column equivalent, so they are
// NOT listed here and always default to visible (poStatus was never an actual column,
// so mapping it here wrongly dropped poReadiness on migration).
export const COLUMN_TO_TAG: Partial<Record<ColumnId, InlineTagId>> = {
  flagged: "flag",
  quality: "quality",
  notes: "notes",
};

const TAG_ID_SET = new Set<string>(ROW_FIELDS.map((f) => f.id));

/** True when every id is already a valid inline tag (i.e. data is post-migration). */
export function isTagVisibility(ids: string[]): boolean {
  return ids.length > 0 && ids.every((id) => TAG_ID_SET.has(id));
}

/**
 * Migrate a legacy column-visibility set to the inline tag set (BRDG-239).
 * Tags without a legacy column equivalent (refinement, poReadiness, editState)
 * default to visible; tags whose source column was hidden stay hidden.
 */
export function columnsToTags(visibleColumns: string[]): InlineTagId[] {
  const next = new Set<InlineTagId>(DEFAULT_VISIBLE_TAGS);
  const visible = new Set(visibleColumns);
  for (const [col, tag] of Object.entries(COLUMN_TO_TAG)) {
    if (!visible.has(col)) next.delete(tag as InlineTagId);
  }
  return [...next];
}

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

// New story inbox sort options (BRDG-357): only the fields the inbox row carries.
// Created-date is the natural default (newest unread first), replacing the board's
// Jira-rank default which has no meaning for the flat inbox list.
export const INBOX_SORT_OPTIONS: { field: SortField; label: string; defaultDir: SortDir }[] = [
  { field: "created", label: "Created date (default)", defaultDir: "desc" },
  { field: "key", label: "Ticket key", defaultDir: "asc" },
  { field: "title", label: "Title", defaultDir: "asc" },
  { field: "jiraStatus", label: "Jira status", defaultDir: "asc" },
  { field: "points", label: "Story points", defaultDir: "desc" },
  { field: "epic", label: "Epic", defaultDir: "asc" },
  { field: "assignee", label: "Assignee", defaultDir: "asc" },
];

export const INBOX_DEFAULT_SORT: { field: SortField; direction: SortDir } = { field: "created", direction: "desc" };

// The regular (default) board order: Jira rank, ascending. Clicking a metric chip
// a third time returns to this.
export const DEFAULT_SORT: { field: SortField; direction: SortDir } = { field: "rank", direction: "asc" };

/**
 * Two-state cycle for the SP/BV header chips: clicking an inactive metric sorts it
 * descending (heaviest first), clicking the active metric again clears back to the
 * regular rank order. Toggling off only happens when this metric is already the active
 * DESCENDING sort, so an ascending order left over from the sort menu is corrected to
 * descending on the first click rather than clearing it. Ascending is never produced by
 * the chip (not relevant for these metrics).
 */
export function cycleMetricSort(
  current: { field: SortField; direction: SortDir },
  metricField: SortField,
): { field: SortField; direction: SortDir } {
  if (current.field === metricField && current.direction === "desc") return { ...DEFAULT_SORT };
  return { field: metricField, direction: "desc" };
}

// ---------------------------------------------------------------------------
// Gaps options
// ---------------------------------------------------------------------------

export const GAPS_OPTIONS: { value: string; label: string; dotClass: string }[] = [
  { value: "no_points", label: "No story points", dotClass: "bg-[var(--color-status-caution)]/50" },
  { value: "no_bv", label: "No business value", dotClass: "bg-[var(--color-status-caution)]/50" },
];

// Sprint-state quick filters (BRDG-259). These live inside the Sprint filter as
// special, prefixed values so they persist and serialize exactly like a selected
// sprint id, while staying distinguishable from real sprint ids.
export const SPRINT_STATE_FILTER_PREFIX = "__sprint-state__:";
export const SPRINT_STATE_CLOSED = `${SPRINT_STATE_FILTER_PREFIX}closed`;

export const SPRINT_STATE_FILTER_OPTIONS: { value: string; state: "active" | "future" | "closed"; label: string; dot: string }[] = [
  { value: `${SPRINT_STATE_FILTER_PREFIX}active`, state: "active", label: "Active sprints", dot: "var(--color-status-success)" },
  { value: `${SPRINT_STATE_FILTER_PREFIX}future`, state: "future", label: "Future sprints", dot: "var(--color-status-info)" },
  { value: SPRINT_STATE_CLOSED, state: "closed", label: "Closed sprints", dot: "var(--color-status-neutral)" },
];

export function isSprintStateFilter(value: string): boolean {
  return value.startsWith(SPRINT_STATE_FILTER_PREFIX);
}

// Re-export ticket utilities used by filter renderers
export { getEpicColor, READINESS_OPTIONS, READINESS_CONFIG, JIRA_STATUS_COLORS };
