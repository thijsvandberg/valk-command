import { isBacklogSprintName, isRegularSprint } from "@/lib/sprint-utils";
import { isInFlightStatus } from "@/lib/ticket-status";

/**
 * Unified rule for where a ticket lands when it is moved INTO a destination
 * (BRDG-370). One rule for every move-into-sprint path (the Move-to-Sprint
 * picker, drag-onto-a-sprint, the epic-children move, the "move to next sprint"
 * quick action):
 *
 * - A backlog destination (a named backlog like "BT: Backlog", or the generic
 *   project backlog which callers resolve to a `null` name) -> top.
 * - A regular numbered sprint (e.g. "BT: 140") -> bottom.
 * - Status exception: a ticket whose status is in flight (In Progress / Testing)
 *   always lands at the top, even into a regular sprint.
 * - Any other non-regular named destination (e.g. "BT: TODO", "Unscheduled")
 *   -> top, the safe default: never silently bury a ticket in an unrecognized
 *   placeholder column.
 *
 * Callers resolve the destination NAME before calling and pass `null` for the
 * generic backlog sentinel ("__backlog__").
 */
export function placementForMove(
  destSprintName: string | null,
  status: string | null | undefined,
): "top" | "bottom" {
  if (destSprintName === null) return "top";
  if (isBacklogSprintName(destSprintName)) return "top";
  if (isInFlightStatus(status)) return "top";
  if (isRegularSprint(destSprintName)) return "bottom";
  return "top";
}

/**
 * Splits a batch of moved keys into the subset that should land at the top of the
 * destination per {@link placementForMove}. The remaining keys land at the bottom.
 * `statusOf` returns the ticket's Jira status for a key (undefined if unknown).
 */
export function topKeysForMove(
  keys: string[],
  destSprintName: string | null,
  statusOf: (key: string) => string | null | undefined,
): string[] {
  return keys.filter((k) => placementForMove(destSprintName, statusOf(k)) === "top");
}
