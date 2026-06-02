import type { Team } from "@/lib/sprint-utils";
import type { JiraStatus } from "@/types/ticket";

// The epics view filters on the epic's own Jira status, using the standard
// status set/colors shared across the app (see JIRA_STATUS_COLORS).
export const EPIC_STATUSES: JiraStatus[] = [
  "TO DO",
  "IN PROGRESS",
  "TEST",
  "DONE",
  "DEPRECATED",
];

// Collapses arbitrary stored Jira statuses onto the canonical set so the filter
// pills and matching stay consistent. Unknown / pre-start statuses → "TO DO".
export function normalizeEpicStatus(status: string | null | undefined): JiraStatus {
  const s = (status ?? "").trim().toUpperCase();
  if (s === "DONE" || s === "CLOSED" || s === "RESOLVED") return "DONE";
  if (s === "DEPRECATED") return "DEPRECATED";
  if (s === "TEST") return "TEST";
  if (s === "IN PROGRESS" || s === "IN REVIEW" || s === "REVIEW") return "IN PROGRESS";
  return "TO DO";
}

// Persisted shape for the /epics filter bar (localStorage, mirrors the
// Pipelines view's PersistedFilters pattern).
export const STORAGE_KEY = "bridge:epic-filters";

export interface PersistedEpicFilters {
  teams?: Team[];
  // Separate flag so "no team assigned" can be selected alongside specific teams.
  noTeam?: boolean;
  statuses?: JiraStatus[];
}
