import { isBacklogSprintName, isRegularSprint } from "@/lib/sprint-utils";

/**
 * Unified rule for where a ticket lands when it is moved INTO a destination
 * (BRDG-370). One rule for every move-into-sprint path (the Move-to-Sprint
 * picker, drag-onto-a-sprint, the epic-children move, the "move to next sprint"
 * quick action):
 *
 * - A regular numbered sprint (e.g. "BT: 140") -> bottom. EVERY move into a
 *   regular sprint lands at the bottom, regardless of the ticket's status.
 * - A backlog destination (a named backlog like "BT: Backlog", or the generic
 *   project backlog which callers resolve to a `null` name) -> top.
 * - Any other non-regular named destination (e.g. "BT: TODO", "Unscheduled")
 *   -> top, the safe default: never silently bury a ticket in an unrecognized
 *   placeholder column.
 *
 * Callers resolve the destination NAME before calling and pass `null` for the
 * generic backlog sentinel ("__backlog__").
 */
export function placementForMove(destSprintName: string | null): "top" | "bottom" {
  if (destSprintName === null) return "top";
  if (isBacklogSprintName(destSprintName)) return "top";
  if (isRegularSprint(destSprintName)) return "bottom";
  return "top";
}

/**
 * Splits a batch of moved keys into the subset that should land at the top of the
 * destination per {@link placementForMove}. Placement now depends only on the
 * destination, so either every key lands at the top (backlog / non-regular) or
 * none do (a regular sprint -> all to the bottom).
 */
export function topKeysForMove(keys: string[], destSprintName: string | null): string[] {
  return placementForMove(destSprintName) === "top" ? [...keys] : [];
}
