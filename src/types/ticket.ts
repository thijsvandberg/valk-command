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

export const JIRA_STATUS_COLORS: Record<JiraStatus, { bg: string; text: string }> = {
  "TO DO": { bg: "var(--color-status-neutral-subtle)", text: "var(--color-status-neutral)" },
  "IN PROGRESS": { bg: "var(--color-status-progress-subtle)", text: "var(--color-status-progress)" },
  TEST: { bg: "rgba(120, 90, 220, 0.15)", text: "var(--color-testing-400)" },
  DONE: { bg: "var(--color-status-done-subtle)", text: "var(--color-status-done)" },
  DEPRECATED: { bg: "var(--color-status-deprecated-subtle)", text: "var(--color-status-deprecated)" },
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

// Business Value color bands: low (1-2) neutral grey, then a warm amber → orange
// ramp for medium/high (3-7). 0 = not applicable (N/A), excluded from averages.
export const BV_COLORS: Record<number, { text: string; bg: string }> = {
  0: { text: "#555a64", bg: "rgba(85, 90, 100, 0.08)" },
  1: { text: "#6e737c", bg: "rgba(110, 115, 124, 0.10)" },
  2: { text: "#858a92", bg: "rgba(133, 138, 146, 0.10)" },
  3: { text: "#c89a44", bg: "rgba(200, 154, 68, 0.11)" },
  4: { text: "#d4962f", bg: "rgba(212, 150, 47, 0.12)" },
  5: { text: "#dd8b22", bg: "rgba(221, 139, 34, 0.13)" },
  6: { text: "#e5811a", bg: "rgba(229, 129, 26, 0.13)" },
  7: { text: "#ec7614", bg: "rgba(236, 118, 20, 0.14)" },
};

export function getBvColor(value: number): { text: string; bg: string } {
  return BV_COLORS[value] ?? BV_COLORS[4];
}

// Story Point colors: a single green ramp (light → deep) used only where SP is
// shown tinted (pickers in detail views, popover swatches). In the dense table
// SP renders neutral grey (see StoryPointPicker). 0 = N/A, excluded from totals.
export const SP_COLORS: Record<number, { text: string; bg: string }> = {
  0: { text: "#555a64", bg: "rgba(85, 90, 100, 0.08)" },
  1: { text: "#6fa384", bg: "rgba(111, 163, 132, 0.10)" },
  2: { text: "#5d9871", bg: "rgba(93, 152, 113, 0.10)" },
  3: { text: "#4d8d5d", bg: "rgba(77, 141, 93, 0.10)" },
  5: { text: "#3d8050", bg: "rgba(61, 128, 80, 0.12)" },
  8: { text: "#2e7444", bg: "rgba(46, 116, 68, 0.14)" },
};

export function getSpColor(value: number): { text: string; bg: string } {
  if (value <= 0) return SP_COLORS[0];
  if (value <= 1) return SP_COLORS[1];
  if (value <= 2) return SP_COLORS[2];
  if (value <= 3) return SP_COLORS[3];
  if (value <= 5) return SP_COLORS[5];
  return SP_COLORS[8];
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
}

export type TicketEditState = "clean" | "draft" | "local_edits" | "conflict";

export interface Ticket {
  key: string;
  title: string;
  type: IssueType;
  epic: string | null;
  epicKey: string | null;
  jiraStatus: JiraStatus;
  storyPoints: number | null;
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
  sprintId?: string;
  // Human-readable sprint name from the sprint_name_cache, resolved at sync time.
  // Used to label sprints (e.g. closed ones) that are absent from the cached sprint list.
  sprintDisplayName?: string | null;
  jiraUpdatedAt?: string | null;
  removedFromJiraAt?: string | null;
  openSubtaskCount?: number;
  totalSubtaskCount?: number;
  chatMessageCount?: number;
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
