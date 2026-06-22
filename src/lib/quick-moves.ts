import type { Sprint } from "@/types/ticket";
import { extractTeamPrefix, isRegularSprint, nextSprintNameFrom } from "@/lib/sprint-utils";

// Default quick-move options shown above "Move to Sprint" in every move menu (BRDG-369):
// one-click destinations a PO reaches for constantly. All visibility/de-dup logic lives
// here so the board, the epic-children view, and the tests share one source of truth.

export interface QuickMoveOption {
  id: "next" | "active" | "backlog";
  /** Rendered label, e.g. 'Move to "BT: 140"'. */
  label: string;
  /**
   * Resolved destination sprint id. Null only when `createName` is set (the sprint does
   * not exist yet and must be created first). The backlog option uses the named backlog
   * sprint's real id, not the "__backlog__" sentinel.
   */
  targetSprintId: string | null;
  /** Present only on the "next" option when the computed next sprint does not exist yet. */
  createName?: string;
}

interface ComputeArgs {
  /** Current sprint NAME of each selected item; null = generic/unscheduled backlog. */
  currentSprintNames: (string | null)[];
  sprints: Sprint[];
  /** The configured team backlog name (BRDG-346 drop target), e.g. "BT: Backlog". */
  backlogTargetName: string;
}

function moveLabel(name: string): string {
  return `Move to "${name}"`;
}

/**
 * Build the ordered, de-duplicated quick-move options for a selection. Order is fixed:
 * next, active, backlog. Each option is omitted when it does not apply (see BRDG-369):
 * a destination the selection is already entirely in is never offered.
 */
export function computeQuickMoves({ currentSprintNames, sprints, backlogTargetName }: ComputeArgs): QuickMoveOption[] {
  if (currentSprintNames.length === 0) return [];

  const nameSet = new Set(currentSprintNames);
  const nonNullNames = currentSprintNames.filter((n): n is string => n !== null);
  const idForName = (name: string): string | undefined => sprints.find((s) => s.name === name)?.id;

  const options: QuickMoveOption[] = [];

  // next: only when the selection shares exactly one regular numbered sprint.
  if (nameSet.size === 1) {
    const only = currentSprintNames[0];
    if (only !== null && isRegularSprint(only)) {
      const nextName = nextSprintNameFrom(only);
      if (nextName) {
        const existingId = idForName(nextName);
        options.push(
          existingId
            ? { id: "next", label: moveLabel(nextName), targetSprintId: existingId }
            : { id: "next", label: moveLabel(nextName), targetSprintId: null, createName: nextName },
        );
      }
    }
  }

  // active: only when the selection has exactly one team prefix and that team has an
  // active sprint the selection is not already entirely in.
  const prefixes = new Set(nonNullNames.map((n) => extractTeamPrefix(n)).filter((p): p is string => p !== null));
  if (prefixes.size === 1) {
    const prefix = [...prefixes][0];
    const active = sprints.find((s) => s.state === "active" && extractTeamPrefix(s.name) === prefix);
    if (active && !(nameSet.size === 1 && nameSet.has(active.name))) {
      options.push({ id: "active", label: moveLabel(active.name), targetSprintId: active.id });
    }
  }

  // backlog: the configured team backlog, unless unresolved or the selection is already in it.
  const backlogId = idForName(backlogTargetName);
  if (backlogId && !(nameSet.size === 1 && nameSet.has(backlogTargetName))) {
    options.push({ id: "backlog", label: moveLabel(backlogTargetName), targetSprintId: backlogId });
  }

  // De-duplicate by resolved target id (keep the earliest in next/active/backlog order).
  // Options pending creation (targetSprintId null) never collide with a real id.
  const seen = new Set<string>();
  return options.filter((opt) => {
    if (opt.targetSprintId === null) return true;
    if (seen.has(opt.targetSprintId)) return false;
    seen.add(opt.targetSprintId);
    return true;
  });
}
