import type { Ticket } from "@/types/ticket";

// The estimate-hygiene problems the GroupStatBar warning triangle counts, and the
// exact set a click on the warning filters the board down to:
//   - unpointed stories (only meaningful for the active sprint, where that
//     warning line is shown; future/backlog work is expected to be unestimated)
//   - work without any subtasks (active sprint only; the sprint is where issues
//     are expected to be broken down. Subtasks and epics are exempt: a subtask
//     cannot hold subtasks, and an epic is broken down via child issues.)
//   - deprecated tickets that still carry story points
//   - closed stories (Done/Deprecated) that still have open subtasks
export type WarningKind = "unpointed" | "no_subtasks" | "deprecated_with_points" | "closed_with_open_subtasks";

// Human-readable, per-row phrasing for each problem. The aggregate header tooltip
// uses its own count sentences ("2 stories without a story point estimate"); both
// derive from the same WarningKind set so they can never describe different problems.
export const WARNING_LABELS: Record<WarningKind, string> = {
  unpointed: "No story point estimate",
  no_subtasks: "No subtasks",
  deprecated_with_points: "Deprecated but still has story points",
  closed_with_open_subtasks: "Closed with open subtasks",
};

// The single source of truth for "what is wrong with this ticket". matchesWarningFilter,
// the per-row labels (BoardRow) and the header tooltip tallies (GroupStatBar) all build on it.
export function ticketWarnings(ticket: Ticket, isActiveSprint: boolean): WarningKind[] {
  const kinds: WarningKind[] = [];
  // Tasks and spikes may carry story points but are not required to: only stories,
  // bugs and subtasks are flagged when unpointed in the active sprint.
  if (
    isActiveSprint &&
    ticket.storyPoints == null &&
    ticket.jiraStatus !== "DEPRECATED" &&
    ticket.type !== "spike" &&
    ticket.type !== "task"
  ) {
    kinds.push("unpointed");
  }
  if (
    isActiveSprint &&
    (ticket.totalSubtaskCount ?? 0) === 0 &&
    ticket.jiraStatus !== "DONE" &&
    ticket.jiraStatus !== "DEPRECATED" &&
    ticket.type !== "subtask" &&
    ticket.type !== "epic"
  ) {
    kinds.push("no_subtasks");
  }
  if (ticket.jiraStatus === "DEPRECATED" && ticket.storyPoints != null && ticket.storyPoints > 0) {
    kinds.push("deprecated_with_points");
  }
  if ((ticket.jiraStatus === "DONE" || ticket.jiraStatus === "DEPRECATED") && (ticket.openSubtaskCount ?? 0) > 0) {
    kinds.push("closed_with_open_subtasks");
  }
  return kinds;
}

export function ticketWarningLabels(ticket: Ticket, isActiveSprint: boolean): string[] {
  return ticketWarnings(ticket, isActiveSprint).map((kind) => WARNING_LABELS[kind]);
}

export function matchesWarningFilter(ticket: Ticket, isActiveSprint: boolean): boolean {
  return ticketWarnings(ticket, isActiveSprint).length > 0;
}
