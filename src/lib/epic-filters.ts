import type { Team } from "@/lib/sprint-utils";

// Four-bucket lifecycle status for an epic, derived from its own Jira status.
export type EpicStatusBucket = "open" | "in_progress" | "done" | "deprecated";

export const EPIC_STATUS_BUCKETS: EpicStatusBucket[] = [
  "open",
  "in_progress",
  "done",
  "deprecated",
];

export const EPIC_STATUS_LABELS: Record<EpicStatusBucket, string> = {
  open: "Open",
  in_progress: "In progress",
  done: "Done",
  deprecated: "Deprecated",
};

// Collapses the wide range of Jira statuses into the four PO-facing buckets.
// Unknown / pre-start statuses fall through to "open" so epics stay visible.
export function mapJiraStatusToBucket(status: string | null | undefined): EpicStatusBucket {
  const s = (status ?? "").trim().toUpperCase();
  if (s === "DONE" || s === "CLOSED" || s === "RESOLVED") return "done";
  if (s === "DEPRECATED") return "deprecated";
  if (s === "IN PROGRESS" || s === "TEST" || s === "IN REVIEW" || s === "REVIEW") {
    return "in_progress";
  }
  return "open";
}

// Persisted shape for the /epics filter bar (localStorage, mirrors the
// Pipelines view's PersistedFilters pattern).
export const STORAGE_KEY = "bridge:epic-filters";

export interface PersistedEpicFilters {
  teams?: Team[];
  statuses?: EpicStatusBucket[];
}
