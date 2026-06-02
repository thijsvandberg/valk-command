// Shared, pure helpers for the Epic Progress View (BRDG-044).
// Kept framework-free so both the API route and the UI (and their tests) can use them.

export type ProgressCategory = "done" | "in-progress" | "todo" | "excluded";

// Statuses that should not count toward an epic's totals at all: deprecated work
// and the transient draft/replaced states used by the story-writer pipeline.
const EXCLUDED_STATUSES = new Set(["DEPRECATED", "DRAFTING", "REPLACED", "DRAFT_FAILED"]);

/**
 * Buckets a Jira status into the progress category used by the epic view.
 * DONE = done; IN PROGRESS / TEST = in-progress; deprecated + draft states are
 * excluded from totals; everything else is treated as todo.
 */
export function categorizeStatus(status: string | null | undefined): ProgressCategory {
  const s = (status ?? "").toUpperCase().trim();
  if (s === "DONE") return "done";
  if (s === "IN PROGRESS" || s === "TEST") return "in-progress";
  if (EXCLUDED_STATUSES.has(s)) return "excluded";
  return "todo";
}

export interface RecentSprintInput {
  id: number | string;
  state: string;
  startDate?: string | null;
  endDate?: string | null;
}

/**
 * Selects the "recent sprints" window: every active sprint, then the most
 * recently ended closed sprints, capped at `limit` total. Future sprints are
 * excluded. Returns sprint ids as strings, ordered chronologically (oldest
 * first) so a timeline can render left-to-right. Backlog ("") is handled by the
 * caller, not here.
 */
export function selectRecentSprintIds(sprints: RecentSprintInput[], limit = 3): string[] {
  const active = sprints.filter((s) => s.state === "active");
  const closed = sprints
    .filter((s) => s.state === "closed")
    .sort((a, b) => (b.endDate ?? "").localeCompare(a.endDate ?? ""));

  const remaining = Math.max(0, limit - active.length);
  const picked = [...active, ...closed.slice(0, remaining)];

  // Chronological order (oldest first) for a left-to-right timeline.
  picked.sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));
  return picked.map((s) => String(s.id));
}

/** Clamped integer percentage; 0 when the denominator is zero. */
export function progressPercent(completed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((completed / total) * 100);
}

export interface EpicProgressAggregate {
  totalTickets: number;
  completedTickets: number;
  totalPoints: number;
  completedPoints: number;
}

export interface EpicProgressResult {
  percent: number;
  /** True when the percentage is points-based; false when it falls back to ticket count. */
  pointsBased: boolean;
}

/**
 * Computes the headline completion percentage for an epic. Uses story points
 * when the epic has any estimated points; otherwise falls back to ticket-count
 * completion and flags it so the UI can label the difference.
 */
export function epicProgress(agg: EpicProgressAggregate): EpicProgressResult {
  if (agg.totalPoints > 0) {
    return { percent: progressPercent(agg.completedPoints, agg.totalPoints), pointsBased: true };
  }
  return { percent: progressPercent(agg.completedTickets, agg.totalTickets), pointsBased: false };
}
