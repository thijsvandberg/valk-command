// Shared ticket and sprint types used across UI components and API responses.
// All mock-data and story-diff types are now sourced from here.

import { getStoredEpicBase } from "@/lib/epic-color-registry";
import { deriveEpicColor } from "@/lib/epic-palette";

export type IssueType = "task" | "bug" | "story" | "subtask" | "spike" | "epic";
export type JiraStatus = "TO DO" | "IN PROGRESS" | "TEST" | "DONE" | "DEPRECATED";

// Readiness tracks the PO preparation lifecycle of a ticket.
// null means the ticket is ready for development (no indicator shown).
export type TicketReadiness = "drafting" | "waiting_for_feedback" | "ready_to_refine" | "on_hold";

export const READINESS_CONFIG: Record<TicketReadiness, { label: string; color: string; bg: string }> = {
  drafting:             { label: "Drafting",              color: "var(--color-status-info)", bg: "var(--color-status-info-subtle)" },
  waiting_for_feedback: { label: "Waiting for Feedback",  color: "var(--color-status-warning)", bg: "var(--color-status-warning-subtle)" },
  ready_to_refine:      { label: "Ready to Refine",       color: "var(--color-status-done)", bg: "var(--color-status-done-subtle)" },
  on_hold:              { label: "On Hold",               color: "var(--color-status-neutral)", bg: "rgba(156, 163, 175, 0.08)" },
};

export const READINESS_OPTIONS: { value: TicketReadiness | null; label: string }[] = [
  { value: "drafting",             label: "Drafting" },
  { value: "waiting_for_feedback", label: "Waiting for Feedback" },
  { value: "ready_to_refine",      label: "Ready to Refine" },
  { value: "on_hold",              label: "On Hold" },
  { value: null,                   label: "Ready for Development" },
];

export const JIRA_STATUS_ABBREVIATIONS: Record<JiraStatus, string> = {
  "TO DO":      "TODO",
  "IN PROGRESS": "PROG",
  TEST:         "TEST",
  DONE:         "DONE",
  DEPRECATED:   "DEPR",
};

// Legacy type kept during migration — consumers should move to TicketReadiness.
export type POStatus =
  | null
  | "New"
  | "Draft"
  | "Awaiting Feedback"
  | "Ready for Refinement"
  | "Ready"
  | "On Hold";

export const PO_STATUS_OPTIONS: { value: POStatus; label: string }[] = [
  { value: null, label: "—" },
  { value: "New", label: "New" },
  { value: "Draft", label: "Draft" },
  { value: "Awaiting Feedback", label: "Awaiting Feedback" },
  { value: "Ready for Refinement", label: "Ready for Refinement" },
  { value: "Ready", label: "Ready" },
  { value: "On Hold", label: "On Hold" },
];

// Shared with the sprint-board status pills via the --sp-* theme variables
// (defined in globals.css) so every ticket-status surface uses one fresh,
// light-mode-aware palette. The BRDG-322 set is collision-free with the
// BRDG-321 row markers (no teal/slate/violet). DEPRECATED is muted zinc and
// DELETED (a derived soft-delete, not a real JiraStatus) is muted rose; both
// are struck through at the call sites. Kept in lockstep with JIRA_STATUS_STYLES.
export const JIRA_STATUS_COLORS: Record<JiraStatus | "DELETED", { bg: string; text: string }> = {
  "TO DO": { bg: "var(--sp-todo-bg)", text: "var(--sp-todo-text)" },
  "IN PROGRESS": { bg: "var(--sp-prog-bg)", text: "var(--sp-prog-text)" },
  TEST: { bg: "var(--sp-test-bg)", text: "var(--sp-test-text)" },
  DONE: { bg: "var(--sp-done-bg)", text: "var(--sp-done-text)" },
  DEPRECATED: { bg: "var(--color-status-deprecated-subtle)", text: "var(--color-status-deprecated)" },
  DELETED: { bg: "var(--color-status-deleted-subtle)", text: "var(--color-status-deleted)" },
};

export interface EpicColor {
  bg: string;
  text: string;
  border: string;
}

export const EPIC_COLORS: Record<string, EpicColor> = {
  "BT: UPSELL": { bg: "rgba(217, 119, 68, 0.15)", text: "#d97744", border: "color-mix(in srgb, #d97744 40%, transparent)" },
  "LOGGING & METRICS": { bg: "rgba(68, 170, 187, 0.15)", text: "#44aabb", border: "color-mix(in srgb, #44aabb 40%, transparent)" },
  "TECH: GENERAL IMP.": { bg: "rgba(160, 90, 200, 0.15)", text: "#a05ac8", border: "color-mix(in srgb, #a05ac8 40%, transparent)" },
};

function generateEpicColor(epic: string): EpicColor {
  let hash = 0;
  for (let i = 0; i < epic.length; i++) {
    hash = epic.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return {
    bg: `hsla(${hue}, 50%, 50%, 0.12)`,
    text: `hsl(${hue}, 45%, 48%)`,
    border: `hsla(${hue}, 50%, 50%, 0.4)`,
  };
}

/**
 * Returns a color for an epic, accepting either its key or name. A PO-assigned
 * color (BRDG-250) wins; otherwise a curated map, then a deterministic color
 * derived from the name so it is stable across reloads.
 */
export function getEpicColor(epic: string): EpicColor {
  const stored = getStoredEpicBase(epic);
  if (stored) return deriveEpicColor(stored);
  return EPIC_COLORS[epic] ?? EPIC_COLORS[epic.toUpperCase()] ?? generateEpicColor(epic);
}

// Row meta-marker tones (BRDG-321). The SP/BV/guestimation markers are a single
// cohesive family — flat single tones, NOT magnitude ramps — so they read as
// metadata, not status. Each tone carries a theme-aware `text` (a CSS var that
// flips per [data-theme], light-on-dark / dark-on-light), a transparent tint
// `bg` that composites over either surface, and a fixed mid-tone `solid` for
// places that need an opaque value (active swatch fills, borders, shadows,
// legend dots) where theme-flipping the foreground would not apply.
export interface MetricTone {
  text: string;
  bg: string;
  solid: string;
}

// SP = neutral slate (effort "recedes"); BV = violet ("premium/value"). Off the
// traffic-light hues (no amber/green/red) so neither borrows a status meaning.
const SP_TONE: MetricTone = { text: "var(--meta-sp-fg)", bg: "color-mix(in srgb, #64748b 18%, transparent)", solid: "#64748b" };
const BV_TONE: MetricTone = { text: "var(--meta-bv-fg)", bg: "color-mix(in srgb, #8b5cf6 18%, transparent)", solid: "#8b5cf6" };
// N/A (value 0) stays a neutral grey: it is a distinct semantic, not a magnitude.
const NA_TONE: MetricTone = { text: "#7c8595", bg: "color-mix(in srgb, #64748b 12%, transparent)", solid: "#64748b" };

export function getBvColor(value: number): MetricTone {
  return value <= 0 ? NA_TONE : BV_TONE;
}

export function getSpColor(value: number): MetricTone {
  return value <= 0 ? NA_TONE : SP_TONE;
}

// Forward-planning guestimation (BRDG-303): a PO placeholder estimate, shown
// only until real story points land. The Fibonacci scale is identical to SP.
// Per BRDG-321 a guess shares the SAME slate hue as SP (never a different
// metric); the chip itself is set apart as "penciled in" by a dashed inset
// outline and NO fill (see GuestimationPicker). This tone supplies the slate
// text/border + the popover preset fills.
export const GUESTIMATION_OPTIONS = [1, 2, 3, 5, 8] as const;
export const GUESTIMATION_OPTION_SET = new Set<number>(GUESTIMATION_OPTIONS);

export function getGuestimationColor(value: number): MetricTone {
  return value <= 0 ? NA_TONE : SP_TONE;
}

// A ticket's effective points for forward planning: a real story-point value
// wins, otherwise its guestimation, otherwise 0. SP "present-but-zero" (N/A) is
// treated as a real 0 so a refined N/A correctly suppresses any stale guess.
export function effectivePoints(
  storyPoints: number | null | undefined,
  guestimation: number | null | undefined,
): number {
  if (storyPoints != null) return storyPoints;
  return guestimation ?? 0;
}

export interface Assignee {
  name: string;
  initials: string;
  color: string;
}

export interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
  color: string;
  cleaned: boolean;
  cleanedAt: string | null;
}

export interface Subtask {
  key: string;
  title: string;
  type: IssueType;
  jiraStatus: JiraStatus;
  assignee: Assignee | null;
}

export interface EpicChild extends Subtask {
  storyPoints: number | null;
  // Forward-planning guestimation (BRDG-303): a PO placeholder estimate, present
  // only when there is no real storyPoints value. Bridge-local, never in Jira.
  guestimation?: number | null;
  businessValue: number | null;
  sprintName: string | null;
  subtaskCount: number;
  /** Open (not DONE/DEPRECATED) and total subtask counts, for the shared "open/total" badge. */
  openSubtaskCount?: number;
  totalSubtaskCount?: number;
  readiness: TicketReadiness | null;
  // Jira's global LexoRank index for the issue. Drives the within-sprint order in
  // the epic's by-sprint view; null when the issue has never been ranked.
  jiraRank: number | null;
}

export interface LinkedIssue {
  jiraLinkId?: string;
  relation: string;
  key: string;
  title: string;
  type: IssueType;
  jiraStatus: JiraStatus;
  assignee: Assignee | null;
}

export interface JiraComment {
  id: string;
  authorName: string;
  authorAvatar: string | null;
  authorInitials: string;
  authorColor: string;
  content: string;
  createdAt: string;
}

export interface TicketDetail {
  description: string;
  reporter: Assignee | null;
  parent: { key: string; title: string; status: JiraStatus; type: IssueType } | null;
  labels: string[];
  components: string[];
  priority: "Highest" | "High" | "Medium" | "Low" | "Lowest";
  createdAt: string;
  updatedAt: string;
  attachments: Attachment[];
  subtasks: Subtask[];
  linkedIssues: LinkedIssue[];
  jiraComments: JiraComment[];
  epicChildren: EpicChild[];
  /** True when one or more epic children reference a sprint stored as a legacy name (no id) that
      is being re-synced from Jira in the background. The client revalidates until it clears so the
      open page resolves the sprint's dates/state without a manual reload. (BRDG-308) */
  resyncingSprints?: boolean;
}

export type TicketEditState = "clean" | "local_edits" | "conflict";

export interface Ticket {
  key: string;
  title: string;
  type: IssueType;
  epic: string | null;
  epicKey: string | null;
  jiraStatus: JiraStatus;
  storyPoints: number | null;
  // Forward-planning guestimation (BRDG-303): PO placeholder estimate, present
  // only when there is no real storyPoints value. Bridge-local, never in Jira.
  guestimation?: number | null;
  assignee: Assignee | null;
  reporter?: Assignee | null;
  flagged: boolean;
  readiness: TicketReadiness | null;
  poStatus: POStatus;
  qualityScore: number | null;
  businessValue: number | null;
  editState: TicketEditState;
  notes: string;
  jiraRank?: number | null;
  // Primary sprint (active > future > most recently closed); drives the card label.
  sprintId?: string;
  // Every sprint the ticket belongs to; drives which sprint columns it appears in.
  sprintIds?: string[];
  // Human-readable sprint name from the sprint_name_cache, resolved at sync time.
  // Used to label sprints (e.g. closed ones) that are absent from the cached sprint list.
  sprintDisplayName?: string | null;
  jiraUpdatedAt?: string | null;
  removedFromJiraAt?: string | null;
  openSubtaskCount?: number;
  totalSubtaskCount?: number;
  chatMessageCount?: number;
}

// Forward-planning placeholder ticket (BRDG-304): a Bridge-local stand-in the PO
// drops into a future sprint/epic before any real Jira issue exists. Carries a BV
// and a guestimation (it has no real SP by definition); promotion turns it into a
// real ticket. Visible only when the view's planning mode is on.
export interface PlaceholderTicket {
  id: string;
  title: string;
  description: string;
  type: IssueType;
  sprintId: string | null;
  sprintName: string | null;
  epicKey: string | null;
  epic: string | null;
  businessValue: number | null;
  guestimation: number | null;
  status: "active" | "promoted";
  promotedToKey: string | null;
  // Manual order within a sprint group (BRDG-328); placeholders have no Jira rank.
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface Sprint {
  id: string;
  name: string;
  dateRange: string;
  state: "active" | "future" | "closed" | "backlog";
  ticketCount: number;
  startDate?: string | null;
  endDate?: string | null;
  goal?: string | null;
}

export interface StoryVersion {
  id?: string;
  versionNumber: number;
  date: string;
  contentHash: string;
  content: string;
  updatedBy: string | null;
  updatedByAvatar: string | null;
  label?: "current" | "draft" | "ai-draft";
}

export type ReviewSource = "ticket-detail" | "chat" | "bulk-action";

export interface StoredReview {
  id: string;
  ticketKey: string;
  createdAt: string;
  source: ReviewSource;
  storyVersionHash: string;
  storyVersionNumber: number;
  overallScore: number;
  dimensions: { key: string; label: string; score: number; feedback: string }[];
  summary: string;
  suggestions: string[];
}

export interface SubtaskSuggestionResponse {
  id: string;
  ticketKey: string;
  title: string;
  createdAt: string;
}

export interface RelatedSuggestionResponse {
  id: string;
  ticketKey: string;
  suggestedKey: string;
  score: number;
  title: string;
  issueType: string | null;
  status: string;
  jiraUrl: string | null;
  reason: string | null;
  suggestedRelation: string;
  createdAt: string;
}

export type ActivityLogType =
  | "sprint-sync" | "ticket-sync" | "single-ticket" | "comment-sync"
  | "review" | "metadata-update" | "local-edit" | "push-to-jira" | "bulk-action"
  | "story-writer" | "incremental-sync" | "epic-sync" | "deprecation-scan";

export interface ActivityLogEntry {
  id: string;
  type: ActivityLogType;
  scope: string | null;
  status: "running" | "success" | "failed" | "cancelled";
  summary: string | null;
  errorDetail: string | null;
  durationMs: number | null;
  startedAt: string;
  completedAt: string | null;
  acknowledged: boolean;
  sprintName: string | null;
}

export interface ActivityLogDayStats {
  totalEvents: number;
  successRate: number;
  avgDurationMs: number;
  activeErrorCount: number;
}

export interface RecurringFailure {
  pattern: string;
  type: ActivityLogType;
  count: number;
  lastOccurrence: string;
  affectedScopes: string[];
  mostRecentEntryId: string;
}

export interface ActivityLogTimelineEntry {
  id: string;
  startedAt: string;
  status: "running" | "success" | "failed" | "cancelled";
  type: ActivityLogType;
  scope: string | null;
  durationMs: number | null;
}

export interface HealthScore {
  score: number;
  band: "green" | "amber" | "red";
  trend: "up" | "flat" | "down";
  components: {
    successRate: number;
    durationConsistency: number;
    errorFreeStreak: number;
  };
}

export interface ActivityLogStats {
  today: ActivityLogDayStats;
  yesterday: ActivityLogDayStats;
  recurringFailures: RecurringFailure[];
  timeline: ActivityLogTimelineEntry[];
  healthScore: HealthScore;
}

export interface ActivityLogStatsResponse {
  entries: ActivityLogEntry[];
  stats: ActivityLogStats;
}
