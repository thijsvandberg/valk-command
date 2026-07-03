// Single source of truth for how sprint lists are grouped, sorted, filtered and
// labelled across every sprint picker surface (BRDG-362). Extracted from
// SprintListModal / SprintSubPanel so the shared SprintListBody and the remaining
// pickers derive their sections from one place instead of hand-rolled copies.

import { extractTeamPrefix, sprintNumber, isBacklogSprintName, isOverallRefinementSprint } from "@/lib/sprint-utils";

export interface SprintListEntry {
  id: string | number;
  name: string;
  state: string;
  startDate?: string | null;
  endDate?: string | null;
  hidden?: boolean;
}

// -- Formatting -----------------------------------------------------------------

export function formatSprintListDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function sprintDateRange(sprint: Pick<SprintListEntry, "startDate" | "endDate">): string {
  const start = formatSprintListDate(sprint.startDate);
  const end = formatSprintListDate(sprint.endDate);
  if (start && end) return `${start} - ${end}`;
  if (start) return `From ${start}`;
  return "";
}

export function sprintStateColor(state: string): string {
  if (state === "active") return "var(--color-status-success)";
  if (state === "future") return "var(--color-status-info)";
  return "var(--color-text-muted)";
}

export function sprintStateLabel(state: string): string {
  if (state === "active") return "Active";
  if (state === "future") return "Future";
  return "Closed";
}

// -- Sorting --------------------------------------------------------------------

const STATE_ORDER: Record<string, number> = { active: 0, future: 1, closed: 2 };

export function sortSprintsByState<T extends SprintListEntry>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const ao = STATE_ORDER[a.state] ?? 3;
    const bo = STATE_ORDER[b.state] ?? 3;
    if (ao !== bo) return ao - bo;
    if (a.state === "active" && b.state === "active") {
      return (a.startDate ? new Date(a.startDate).getTime() : 0) -
             (b.startDate ? new Date(b.startDate).getTime() : 0);
    }
    return a.name.localeCompare(b.name);
  });
}

export function sortSprintsByEndDateDesc<T extends SprintListEntry>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    return (b.endDate ? new Date(b.endDate).getTime() : 0) -
           (a.endDate ? new Date(a.endDate).getTime() : 0);
  });
}

/**
 * Move-destination ordering (BRDG-374): pinned (slot) sprints lead in slot order,
 * then sprints group by team and read in series (BT: 143, BT: 144, ...);
 * non-numbered names sort last within their team.
 */
export function sortSprintsForMove<T extends SprintListEntry>(list: T[], pinnedOrder: string[] = []): T[] {
  return [...list].sort((a, b) => {
    const ai = pinnedOrder.indexOf(String(a.id));
    const bi = pinnedOrder.indexOf(String(b.id));
    if (ai !== -1 || bi !== -1) {
      if (ai !== -1 && bi !== -1) return ai - bi;
      return ai !== -1 ? -1 : 1;
    }
    const teamA = extractTeamPrefix(a.name) ?? "";
    const teamB = extractTeamPrefix(b.name) ?? "";
    if (teamA !== teamB) return teamA.localeCompare(teamB);
    return sprintNumber(a.name) - sprintNumber(b.name);
  });
}

// -- Filtering ------------------------------------------------------------------

export function filterSprintsByTeam<T extends SprintListEntry>(list: T[], team: string | null): T[] {
  if (!team) return list;
  return list.filter((s) => extractTeamPrefix(s.name) === team);
}

export function searchSprints<T extends SprintListEntry>(list: T[], query: string): T[] {
  const q = query.toLowerCase();
  return sortSprintsByState(list.filter((s) => s.name.toLowerCase().includes(q)));
}

export function getTeamOptions(list: SprintListEntry[]): string[] {
  const teams = new Set<string>();
  for (const s of list) {
    if (s.hidden) continue;
    const t = extractTeamPrefix(s.name);
    if (t) teams.add(t);
  }
  return [...teams].sort();
}

/**
 * Eligible move destinations: active/future sprints minus the named backlogs (the
 * generic "Backlog" bucket covers them), the "Overall refinement" bucket (pinned
 * separately by the caller) and any explicitly excluded ids (quick-move targets
 * plus the selection's current sprint).
 */
export function getMoveDestinations<T extends SprintListEntry>(
  list: T[],
  excludeIds: Set<string> = new Set(),
  pinnedOrder: string[] = [],
): T[] {
  const eligible = list.filter(
    (s) =>
      (s.state === "active" || s.state === "future") &&
      !isBacklogSprintName(s.name) &&
      !isOverallRefinementSprint(s.name) &&
      !excludeIds.has(String(s.id)),
  );
  return sortSprintsForMove(eligible, pinnedOrder);
}

// -- Sections -------------------------------------------------------------------

export function getPinnedSection<T extends SprintListEntry>(list: T[], pinnedIds: Set<string>): T[] {
  return sortSprintsByState(list.filter((s) => pinnedIds.has(String(s.id))));
}

export function getActiveFutureSection<T extends SprintListEntry>(list: T[], pinnedIds: Set<string>): T[] {
  return sortSprintsByState(
    list.filter((s) => !s.hidden && (s.state === "active" || s.state === "future") && !pinnedIds.has(String(s.id))),
  );
}

/** All non-hidden, non-pinned closed sprints, most recently ended first. Pass a
 *  limit to bound the section; unbounded shows everything synced (BRDG-362). */
export function getClosedSection<T extends SprintListEntry>(list: T[], pinnedIds: Set<string>, limit?: number): T[] {
  const closed = sortSprintsByEndDateDesc(
    list.filter((s) => !s.hidden && s.state === "closed" && !pinnedIds.has(String(s.id))),
  );
  return limit === undefined ? closed : closed.slice(0, limit);
}

export function getHiddenSection<T extends SprintListEntry>(list: T[]): T[] {
  return sortSprintsByState(list.filter((s) => s.hidden));
}
