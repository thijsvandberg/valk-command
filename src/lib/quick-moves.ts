import type { Sprint } from "@/types/ticket";
import { extractTeamPrefix, isRegularSprint, nextSprintNameFrom, sprintNumber } from "@/lib/sprint-utils";

// Default quick-move options shown above "Move to Sprint" in every move menu (BRDG-369):
// one-click destinations a PO reaches for constantly. All visibility/de-dup logic lives
// here so the board, the epic-children view, and the tests share one source of truth.

export interface QuickMoveOption {
  id: "next" | "active" | "backlog";
  /** Purpose-led label: "Move to active sprint" / "Move to next sprint" / "Move to backlog" (BRDG-374). */
  label: string;
  /** Destination sprint name, rendered as a trailing chip next to the label (e.g. "BT: 140"). */
  target: string;
  /**
   * Resolved destination sprint id. Null only when `createName` is set (the sprint does
   * not exist yet and must be created first). The backlog option uses the named backlog
   * sprint's real id, not the "__backlog__" sentinel.
   */
  targetSprintId: string | null;
  /** Present only on the "next" option when the computed next sprint does not exist yet. */
  createName?: string;
  /** Small marker shown next to the label (e.g. "active" for the current sprint). */
  badge?: string;
}

interface ComputeArgs {
  /** Current sprint NAME of each selected item; null = generic/unscheduled backlog. */
  currentSprintNames: (string | null)[];
  sprints: Sprint[];
  /** The configured team backlog name (BRDG-346 drop target), e.g. "BT: Backlog". */
  backlogTargetName: string;
}

// Purpose-led labels (BRDG-374); the destination sprint name rides along as `target`.
const QUICK_MOVE_LABELS: Record<QuickMoveOption["id"], string> = {
  active: "Move to active sprint",
  next: "Move to next sprint",
  backlog: "Move to backlog",
};

/**
 * Build the de-duplicated quick-move options for a selection, ordered low-to-high by
 * sprint number (the active sprint therefore sits at the top in the common case), with
 * the backlog (no number) last. Each option is omitted when it does not apply (see
 * BRDG-369): a destination the selection is already entirely in is never offered.
 */
export function computeQuickMoves({ currentSprintNames, sprints, backlogTargetName }: ComputeArgs): QuickMoveOption[] {
  if (currentSprintNames.length === 0) return [];

  const nameSet = new Set(currentSprintNames);
  const nonNullNames = currentSprintNames.filter((n): n is string => n !== null);
  const idForName = (name: string): string | undefined => sprints.find((s) => s.name === name)?.id;

  // Each candidate carries the destination name so the list can be sorted by sprint
  // number afterwards (backlog has no number -> sprintNumber returns Infinity -> last).
  const candidates: { opt: QuickMoveOption; sortName: string }[] = [];

  // active: only when the selection has exactly one team prefix and that team has an
  // active sprint the selection is not already entirely in. Built first so it wins the
  // de-dup tie-break (and keeps its "active" badge) when it coincides with "next".
  const prefixes = new Set(nonNullNames.map((n) => extractTeamPrefix(n)).filter((p): p is string => p !== null));
  let activeSprint: Sprint | undefined;
  if (prefixes.size === 1) {
    const prefix = [...prefixes][0];
    activeSprint = sprints.find((s) => s.state === "active" && extractTeamPrefix(s.name) === prefix);
    if (activeSprint && !(nameSet.size === 1 && nameSet.has(activeSprint.name))) {
      candidates.push({ opt: { id: "active", label: QUICK_MOVE_LABELS.active, target: activeSprint.name, targetSprintId: activeSprint.id, badge: "active" }, sortName: activeSprint.name });
    }
  }

  // next: relative to the selection's own regular sprint ("BT: 139" -> "BT: 140"). When the
  // selection sits in a non-numbered sprint (a team backlog) or is unscheduled, there is no
  // number to step from, so fall back to the team's active sprint + 1 — this is what "next"
  // means from the inbox, where tickets live in the backlog rather than in a numbered sprint.
  if (nameSet.size === 1) {
    const only = currentSprintNames[0];
    let nextName = "";
    if (only !== null && isRegularSprint(only)) {
      nextName = nextSprintNameFrom(only);
    } else if (activeSprint && isRegularSprint(activeSprint.name)) {
      nextName = nextSprintNameFrom(activeSprint.name);
    }
    if (nextName) {
      const existingId = idForName(nextName);
      candidates.push({
        opt: existingId
          ? { id: "next", label: QUICK_MOVE_LABELS.next, target: nextName, targetSprintId: existingId }
          : { id: "next", label: QUICK_MOVE_LABELS.next, target: nextName, targetSprintId: null, createName: nextName },
        sortName: nextName,
      });
    }
  }

  // backlog: the configured team backlog, unless unresolved or the selection is already in it.
  const backlogId = idForName(backlogTargetName);
  if (backlogId && !(nameSet.size === 1 && nameSet.has(backlogTargetName))) {
    candidates.push({ opt: { id: "backlog", label: QUICK_MOVE_LABELS.backlog, target: backlogTargetName, targetSprintId: backlogId }, sortName: backlogTargetName });
  }

  // De-duplicate by resolved target id (keep the earliest built — active over next).
  // Options pending creation (targetSprintId null) never collide with a real id.
  const seen = new Set<string>();
  const deduped = candidates.filter(({ opt }) => {
    if (opt.targetSprintId === null) return true;
    if (seen.has(opt.targetSprintId)) return false;
    seen.add(opt.targetSprintId);
    return true;
  });

  // Sort low-to-high by sprint number; the backlog (Infinity) sinks to the bottom. Stable
  // for equal numbers, so the build order (active before next) breaks any tie.
  return deduped
    .sort((a, b) => sprintNumber(a.sortName) - sprintNumber(b.sortName))
    .map((c) => c.opt);
}
