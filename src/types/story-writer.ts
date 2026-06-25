import type { StoryWriterSessionRow, StoryWriterDraftRow, Message, RelatedStoryCandidateRow } from "@/db/schema";
import type { Ticket, Assignee, IssueType, JiraStatus, TicketReadiness } from "@/types/ticket";

export type StoryWriterStatus = "idle" | "loading" | "ready" | "sending" | "streaming";

// Related-story candidate as served to the UI: the stored row plus the sprint name
// resolved server-side from the candidate's ticket (not a stored column, BRDG-397).
export type RelatedStoryCandidate = RelatedStoryCandidateRow & { sprintName?: string | null };

export type StoryWriterSessionStatus = "active" | "completed" | "discarded";

export type DraftAction = "accept" | "merge" | "dismiss";

export interface StoryWriterSessionWithMessages {
  session: StoryWriterSessionRow;
  messages: Message[];
  aiDrafts: StoryWriterDraftRow[];
}

export interface StoryWriterMessageResponse {
  messageId: string;
  taskId: string;
  streamUrl: string;
  isFirstMessage: boolean;
}

export interface ApplyDraftResponse {
  draftId: string | null;
  draftIndex: number | null;
  hasDraft: boolean;
}

export interface ActiveSessionsMap {
  [ticketKey: string]: string;
}

// An active Story Writer draft session, joined with its ticket + PO metadata. Drives
// the Story Writer landing list (BRDG-325). Lives here, not in the route file, because
// a route.ts may only export route handlers (non-handler exports fail the build).
export interface ActiveSession {
  sessionId: string;
  ticketKey: string;
  title: string;
  // The ticket's primary Jira sprint. Named `sprintName` for back-compat with the
  // launcher modal, but the DB column `ticket.sprint_name` actually stores the sprint id.
  sprintName: string | null;
  epic: string | null;
  epicKey: string | null;
  issueType: string | null;
  status: string;
  readiness: string | null;
  storyPoints: number | null;
  guestimation: number | null;
  businessValue: number | null;
  qualityScore: number | null;
  assignee: Assignee | null;
  flagged: boolean;
  notes: string;
  openSubtaskCount: number;
  totalSubtaskCount: number;
  updatedAt: string | null;
  jiraUpdatedAt: string | null;
  targetTicketKey: string | null;
  targetTitle: string | null;
  removedFromJira: boolean;
}

// A Ticket carrying the session-only fields the landing list needs alongside the
// board-row fields. Extending Ticket (rather than a side map) means every optimistic
// cache spread in useTicketActions/saveTicketMetadata preserves these fields, and a
// revalidation simply re-maps fresh SessionTickets (BRDG-325).
export type SessionTicket = Ticket & {
  sessionId: string;
  sessionUpdatedAt: string | null;
  sessionJiraUpdatedAt: string | null;
  targetTicketKey: string | null;
  targetTitle: string | null;
};

// Pure session -> SessionTicket mapper. removedFromJira is deliberately NOT mapped to
// removedFromJiraAt: removed sessions render with a normal ticket pill, no strikethrough
// or dimming (BRDG-325).
export function sessionToSessionTicket(session: ActiveSession): SessionTicket {
  return {
    key: session.ticketKey,
    title: session.title,
    type: (session.issueType ?? "task") as IssueType,
    epic: session.epic,
    epicKey: session.epicKey,
    jiraStatus: (session.status as JiraStatus) ?? "TO DO",
    storyPoints: session.storyPoints,
    guestimation: session.guestimation,
    assignee: session.assignee,
    flagged: session.flagged,
    readiness: (session.readiness as TicketReadiness) ?? null,
    poStatus: null,
    qualityScore: session.qualityScore,
    businessValue: session.businessValue,
    editState: "clean",
    notes: session.notes,
    sprintId: session.sprintName ?? undefined,
    jiraUpdatedAt: session.jiraUpdatedAt,
    openSubtaskCount: session.openSubtaskCount,
    totalSubtaskCount: session.totalSubtaskCount,
    sessionId: session.sessionId,
    sessionUpdatedAt: session.updatedAt,
    sessionJiraUpdatedAt: session.jiraUpdatedAt,
    targetTicketKey: session.targetTicketKey,
    targetTitle: session.targetTitle,
  };
}

// Compact "6h ago / 1d ago" label for the session's last-updated time. `now` is
// injectable for deterministic tests.
export function formatTimeAgo(iso: string, now: number = Date.now()): string {
  const seconds = Math.floor((now - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// True when the ticket changed in Jira after the draft was last saved.
export function hasJiraChanges(session: Pick<ActiveSession, "jiraUpdatedAt" | "updatedAt">): boolean {
  if (!session.jiraUpdatedAt || !session.updatedAt) return false;
  return new Date(session.jiraUpdatedAt).getTime() > new Date(session.updatedAt).getTime();
}
