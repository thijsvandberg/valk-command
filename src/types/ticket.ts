// Shared ticket and sprint types used across UI components and API responses.
// All mock-data and story-diff types are now sourced from here.

export type IssueType = "task" | "bug" | "story" | "subtask" | "spike" | "epic";
export type JiraStatus = "TO DO" | "IN PROGRESS" | "TEST" | "DONE" | "DEPRECATED";

// Readiness tracks the PO preparation lifecycle of a ticket.
// null means the ticket is ready for development (no indicator shown).
export type TicketReadiness = "drafting" | "waiting_for_feedback" | "ready_to_refine" | "on_hold";

export const READINESS_CONFIG: Record<TicketReadiness, { label: string; color: string; bg: string }> = {
  drafting:             { label: "Drafting",              color: "#60a5fa", bg: "rgba(96, 165, 250, 0.12)" },
  waiting_for_feedback: { label: "Waiting for Feedback",  color: "#e8a45a", bg: "rgba(232, 164, 90, 0.12)" },
  ready_to_refine:      { label: "Ready to Refine",       color: "#86efac", bg: "rgba(134, 239, 172, 0.12)" },
  on_hold:              { label: "On Hold",               color: "#9ca3af", bg: "rgba(156, 163, 175, 0.08)" },
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
  "TO DO": { bg: "rgba(100, 116, 139, 0.15)", text: "#94a3b8" },
  "IN PROGRESS": { bg: "rgba(56, 152, 210, 0.15)", text: "#58b4e6" },
  TEST: { bg: "rgba(120, 90, 220, 0.15)", text: "#9b7ee8" },
  DONE: { bg: "rgba(34, 197, 94, 0.15)", text: "#4ade80" },
  DEPRECATED: { bg: "rgba(120, 160, 120, 0.12)", text: "#7a9a7a" },
};

export const EPIC_COLORS: Record<string, { bg: string; text: string }> = {
  "BT: UPSELL": { bg: "rgba(217, 119, 68, 0.15)", text: "#d97744" },
  "LOGGING & METRICS": { bg: "rgba(68, 170, 187, 0.15)", text: "#44aabb" },
  "TECH: GENERAL IMP.": { bg: "rgba(160, 90, 200, 0.15)", text: "#a05ac8" },
};

/** Case-insensitive lookup for epic color, since Jira epic names may vary in casing. */
export function getEpicColor(epic: string): { bg: string; text: string } | undefined {
  return EPIC_COLORS[epic] ?? EPIC_COLORS[epic.toUpperCase()];
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

export interface LinkedIssue {
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
  labels: string[];
  components: string[];
  priority: "Highest" | "High" | "Medium" | "Low" | "Lowest";
  createdAt: string;
  updatedAt: string;
  attachments: Attachment[];
  subtasks: Subtask[];
  linkedIssues: LinkedIssue[];
  jiraComments: JiraComment[];
  epicChildren: Subtask[];
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
  flagged: boolean;
  readiness: TicketReadiness | null;
  poStatus: POStatus;
  qualityScore: number | null;
  editState: TicketEditState;
  notes: string;
  jiraRank?: number | null;
  sprintId?: string;
  jiraUpdatedAt?: string | null;
  removedFromJiraAt?: string | null;
}

export interface Sprint {
  id: string;
  name: string;
  dateRange: string;
  state: "active" | "future" | "closed";
  ticketCount: number;
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

export type ActivityLogType =
  | "sprint-sync" | "ticket-sync" | "single-ticket" | "comment-sync"
  | "review" | "metadata-update" | "local-edit" | "push-to-jira" | "bulk-action"
  | "story-writer" | "incremental-sync";

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
