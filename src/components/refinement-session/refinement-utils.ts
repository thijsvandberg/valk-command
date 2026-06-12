import type { Ticket } from "@/types/ticket";

export const LAST_UPDATED_OPTIONS = [
  { value: "1w", label: "1 week", ms: 7 * 24 * 60 * 60 * 1000 },
  { value: "2w", label: "2 weeks", ms: 14 * 24 * 60 * 60 * 1000 },
  { value: "4w", label: "4 weeks", ms: 28 * 24 * 60 * 60 * 1000 },
  { value: "3m", label: "3 months", ms: 90 * 24 * 60 * 60 * 1000 },
  { value: "all", label: "All time", ms: 0 },
] as const;

export const MIN_TICKETS = 1;
export const MAX_TICKETS = 12;

export function filterTickets(
  tickets: Ticket[],
  opts: {
    sprintFilter: Set<string>;
    hideEstimated: boolean;
    epicFilter: Set<string>;
    lastUpdatedFilter: string;
  },
): Ticket[] {
  const lastUpdatedMs = opts.lastUpdatedFilter !== "all"
    ? LAST_UPDATED_OPTIONS.find((o) => o.value === opts.lastUpdatedFilter)?.ms ?? 0
    : 0;
  const cutoff = lastUpdatedMs > 0 ? Date.now() - lastUpdatedMs : 0;

  return tickets.filter((t) => {
    if (opts.sprintFilter.size > 0) {
      if (!t.sprintId || !opts.sprintFilter.has(t.sprintId)) return false;
    }
    if (opts.hideEstimated && t.storyPoints != null && t.storyPoints > 0) return false;
    if (opts.epicFilter.size > 0 && (!t.epic || !opts.epicFilter.has(t.epic))) return false;
    if (cutoff > 0) {
      if (!t.jiraUpdatedAt || new Date(t.jiraUpdatedAt).getTime() < cutoff) return false;
    }
    return true;
  });
}

/** Human-readable date for a YYYY-MM-DD value, e.g. "18 Jun 2026". */
export function formatSessionDate(scheduledFor: string): string {
  const [y, m, d] = scheduledFor.split("-").map(Number);
  if (!y || !m || !d) return scheduledFor;
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Display label for a session: "{date} - {name}", or whichever one is set. */
export function sessionLabel(session: {
  name: string | null;
  scheduledFor?: string | null;
}): string {
  const date = session.scheduledFor ? formatSessionDate(session.scheduledFor) : "";
  const name = session.name?.trim() ?? "";
  if (date && name) return `${date} - ${name}`;
  return date || name || "Untitled session";
}

/** Scheduled sessions first (soonest date on top), undated ones by newest created. */
export function compareSessions(
  a: { scheduledFor?: string | null; createdAt: string },
  b: { scheduledFor?: string | null; createdAt: string },
): number {
  if (a.scheduledFor && b.scheduledFor) {
    if (a.scheduledFor !== b.scheduledFor) {
      return a.scheduledFor < b.scheduledFor ? -1 : 1;
    }
    return a.createdAt < b.createdAt ? 1 : -1;
  }
  if (a.scheduledFor) return -1;
  if (b.scheduledFor) return 1;
  return a.createdAt < b.createdAt ? 1 : -1;
}

export function readinessRank(r: string | null | undefined): number {
  if (r === "ready_to_refine") return 0;
  if (r === "drafting") return 1;
  return 2;
}

export function smartSort(a: Ticket, b: Ticket): number {
  const rankDiff = readinessRank(a.readiness) - readinessRank(b.readiness);
  if (rankDiff !== 0) return rankDiff;

  const aTime = a.jiraUpdatedAt ? new Date(a.jiraUpdatedAt).getTime() : 0;
  const bTime = b.jiraUpdatedAt ? new Date(b.jiraUpdatedAt).getTime() : 0;
  return bTime - aTime;
}
