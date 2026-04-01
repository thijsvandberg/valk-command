// Shared ticket and sprint types used across UI components and API responses.
// All mock-data and story-diff types are now sourced from here.

export type IssueType = "task" | "bug" | "story" | "subtask";
export type JiraStatus = "TO DO" | "IN PROGRESS" | "TEST" | "DONE";
export type POStatus =
  | null
  | "Nieuw"
  | "Uitwerken"
  | "Wachten op feedback"
  | "Klaar voor refinement"
  | "Ready"
  | "Geparkeerd";

export const PO_STATUS_OPTIONS: { value: POStatus; label: string }[] = [
  { value: null, label: "—" },
  { value: "Nieuw", label: "Nieuw" },
  { value: "Uitwerken", label: "Uitwerken" },
  { value: "Wachten op feedback", label: "Wachten op feedback" },
  { value: "Klaar voor refinement", label: "Klaar voor refinement" },
  { value: "Ready", label: "Ready" },
  { value: "Geparkeerd", label: "Geparkeerd" },
];

export const JIRA_STATUS_COLORS: Record<JiraStatus, { bg: string; text: string }> = {
  "TO DO": { bg: "rgba(100, 116, 139, 0.15)", text: "#94a3b8" },
  "IN PROGRESS": { bg: "rgba(59, 130, 246, 0.15)", text: "#60a5fa" },
  TEST: { bg: "rgba(168, 85, 247, 0.15)", text: "#c084fc" },
  DONE: { bg: "rgba(34, 197, 94, 0.15)", text: "#4ade80" },
};

export const EPIC_COLORS: Record<string, { bg: string; text: string }> = {
  "BT: UPSELL": { bg: "rgba(217, 119, 68, 0.15)", text: "#d97744" },
  "LOGGING & METRICS": { bg: "rgba(68, 170, 187, 0.15)", text: "#44aabb" },
  "TECH: GENERAL IMP.": { bg: "rgba(160, 90, 200, 0.15)", text: "#a05ac8" },
};

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
  relation: "is blocked by" | "relates to" | "blocks";
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
}

export type TicketEditState = "clean" | "local_edits" | "conflict";

export interface Ticket {
  key: string;
  title: string;
  type: IssueType;
  epic: string | null;
  jiraStatus: JiraStatus;
  storyPoints: number | null;
  assignee: Assignee | null;
  flagged: boolean;
  poStatus: POStatus;
  qualityScore: number | null;
  editState: TicketEditState;
  notes: string;
  sprintId?: string;
}

export interface Sprint {
  id: string;
  name: string;
  dateRange: string;
  state: "active" | "future" | "closed";
  ticketCount: number;
}

export interface StoryVersion {
  versionNumber: number;
  date: string;
  source: "Jira sync" | "Local edit";
  contentHash: string;
  qualityScore: number | null;
  content: string;
}

export interface SyncLogEntry {
  id: string;
  type: "sprint-sync" | "ticket-sync" | "single-ticket" | "comment-sync" | "webhook";
  scope: string | null;
  status: "running" | "success" | "failed" | "cancelled";
  summary: string | null;
  errorDetail: string | null;
  durationMs: number | null;
  startedAt: string;
  completedAt: string | null;
  acknowledged: boolean;
}
