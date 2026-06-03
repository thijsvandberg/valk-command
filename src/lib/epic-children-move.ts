import type { EpicChild, Subtask, Sprint } from "@/types/ticket";
import type { ChildGroup } from "./epic-children-grouping";

/** Special target id understood by POST /api/jira/move-sprint for the backlog. */
export const BACKLOG_TARGET = "__backlog__";

export type MoveResolution =
  | { ok: true; targetSprintId: string }
  | { ok: false; reason: "noop" | "closed" | "unknown" };

/**
 * Resolves a drag-drop onto a sprint group into the `targetSprintId` understood
 * by the move API, or a reason the move is refused.
 *
 * Grouping keys by sprint *name* but the move API needs the sprint *id*, so the
 * target group's name is matched against the sprint list. Closed sprints reject
 * the drop (Jira disallows it), and dropping onto the child's current group is a
 * no-op. The Unscheduled group (sprintName null) maps to the backlog.
 */
export function resolveMove({
  childSprintName,
  targetGroup,
  sprints,
}: {
  childSprintName: string | null;
  targetGroup: Pick<ChildGroup, "sprintName" | "state">;
  sprints: Sprint[];
}): MoveResolution {
  if (childSprintName === targetGroup.sprintName) return { ok: false, reason: "noop" };
  if (targetGroup.state === "closed") return { ok: false, reason: "closed" };
  if (targetGroup.sprintName === null) return { ok: true, targetSprintId: BACKLOG_TARGET };

  const match = sprints.find((s) => s.name === targetGroup.sprintName);
  if (!match) return { ok: false, reason: "unknown" };
  return { ok: true, targetSprintId: match.id };
}

/** The sprint name a move target id maps back to, for optimistic re-grouping. */
export function sprintNameForTarget(targetSprintId: string, sprints: Sprint[]): string | null {
  if (targetSprintId === BACKLOG_TARGET) return null;
  return sprints.find((s) => s.id === targetSprintId)?.name ?? null;
}

/**
 * Overlays optimistic sprint reassignments onto the child list so the grouped
 * view reflects a move before the server round-trip lands. Plain Subtasks (no
 * sprintName property) gain one, letting locally-added items participate too.
 */
export function applyLocalMoves(
  items: (EpicChild | Subtask)[],
  localMoves: Record<string, string | null>,
): (EpicChild | Subtask)[] {
  if (Object.keys(localMoves).length === 0) return items;
  return items.map((item) =>
    item.key in localMoves ? ({ ...item, sprintName: localMoves[item.key] } as EpicChild) : item,
  );
}
