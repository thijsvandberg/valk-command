import type { Ticket } from "@/types/ticket";

// The hygiene items the GroupStatBar warning triangle counts, and therefore the
// exact set a click on the warning should filter the board down to:
//   - unpointed stories (only meaningful for the active sprint, where that
//     warning line is shown; future/backlog work is expected to be unestimated)
//   - deprecated tickets that still carry story points
//   - closed stories (Done/Deprecated) that still have open subtasks
// Keep this in lockstep with the counts in GroupStatBar.
export function matchesWarningFilter(ticket: Ticket, isActiveSprint: boolean): boolean {
  const unpointed =
    isActiveSprint && ticket.storyPoints == null && ticket.jiraStatus !== "DEPRECATED" && ticket.type !== "spike";
  const deprecatedWithPoints =
    ticket.jiraStatus === "DEPRECATED" && ticket.storyPoints != null && ticket.storyPoints > 0;
  const closedWithOpenSubtasks =
    (ticket.jiraStatus === "DONE" || ticket.jiraStatus === "DEPRECATED") && (ticket.openSubtaskCount ?? 0) > 0;
  return unpointed || deprecatedWithPoints || closedWithOpenSubtasks;
}
