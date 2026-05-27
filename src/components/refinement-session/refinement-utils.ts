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
