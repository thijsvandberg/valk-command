import type { Assignee, IssueType, JiraStatus } from "@/types/ticket";

// One row of the New stories inbox (BRDG-356): a recently-created, still-unread
// ticket with just the fields the review table renders. Deliberately lighter
// than the full Ticket so the list endpoint stays cheap.
export interface NewStoryRow {
  key: string;
  title: string;
  type: IssueType;
  /** Current Jira status, so the inbox row shows the real status pill and can be filtered. */
  jiraStatus: JiraStatus;
  epic: string | null;
  epicKey: string | null;
  storyPoints: number | null;
  assignee: Assignee | null;
  reporter: Assignee | null;
  /** Sprint display name (from the sprint-name cache), or null for backlog. */
  sprintName: string | null;
  /** ISO timestamp the ticket was created in Jira; drives the date grouping. */
  jiraCreatedAt: string | null;
}

export interface NewStoriesResponse {
  rows: NewStoryRow[];
}
