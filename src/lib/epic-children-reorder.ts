import type { EpicChild, Subtask, Sprint } from "@/types/ticket";
import { UNSCHEDULED_GROUP_KEY, type ChildGroup } from "./epic-children-grouping";
import { resolveMove } from "./epic-children-move";

/** The sprint-group key an item belongs to (its sprint name, or the Unscheduled bucket). */
export function groupKeyForItem(item: EpicChild | Subtask): string {
  const name = "sprintName" in item ? item.sprintName : null;
  return name ?? UNSCHEDULED_GROUP_KEY;
}

export interface ReorderResult {
  /** The group's child keys in their new order. */
  newOrder: string[];
  /** Rank the moved key immediately above this key (drag up). */
  rankBeforeKey?: string;
  /** Rank the moved key immediately below this key (drag down). */
  rankAfterKey?: string;
}

/**
 * Computes the new within-group order and the Jira rank anchor for moving
 * `activeKey` onto `overKey`. Dragging up (active sits below the target) ranks
 * the item before the target; dragging down ranks it after. Returns null for a
 * no-op or when either key is absent from the group.
 */
export function computeReorder(
  groupKeys: string[],
  activeKey: string,
  overKey: string,
): ReorderResult | null {
  if (activeKey === overKey) return null;
  const oldIndex = groupKeys.indexOf(activeKey);
  const overIndex = groupKeys.indexOf(overKey);
  if (oldIndex === -1 || overIndex === -1) return null;

  const without = groupKeys.filter((k) => k !== activeKey);
  const anchor = without.indexOf(overKey);
  const insertAt = oldIndex > overIndex ? anchor : anchor + 1;
  const newOrder = [...without.slice(0, insertAt), activeKey, ...without.slice(insertAt)];

  return oldIndex > overIndex
    ? { newOrder, rankBeforeKey: overKey }
    : { newOrder, rankAfterKey: overKey };
}

/** Payload the parent uses to optimistically reorder a group and persist the rank. */
export interface ChildReorder extends ReorderResult {
  activeKey: string;
  /** Group bucket key (sprint name, or the Unscheduled key) for the local override. */
  groupKey: string;
  /** Sprint name of the group, used to resolve the sprint id for the rank call. */
  sprintName: string | null;
}

/** Payload for moving a child into another sprint at a specific position in one drop. */
export interface ChildMoveToPosition extends ReorderResult {
  activeKey: string;
  /** Move target understood by the move API (sprint id or the backlog sentinel). */
  targetSprintId: string;
  /** Target group bucket key, for the local order override. */
  targetGroupKey: string;
  /** Target sprint name (null for the backlog), for the local move override. */
  targetSprintName: string | null;
}

export type DragEndResolution =
  | { kind: "noop" }
  | { kind: "reorder"; reorder: ChildReorder }
  | { kind: "move"; targetSprintId: string }
  | { kind: "move-to-position"; move: ChildMoveToPosition }
  | { kind: "move-rejected"; reason: "closed" };

/**
 * Decides what a drag-end means in the by-sprint view: a within-group reorder
 * (dropped onto a sibling row), a cross-sprint move (dropped onto a row in another
 * group or onto a group card), or nothing. Keeps the dnd glue in the component thin
 * and the branching fully unit-testable.
 */
export function resolveDragEnd({
  activeKey,
  overId,
  childSprintName,
  overType,
  overSprintName,
  overState,
  insertAfter = false,
  groups,
  sprints,
}: {
  activeKey: string;
  overId: string;
  childSprintName: string | null;
  overType: "child" | "group" | undefined;
  overSprintName: string | null;
  overState: Sprint["state"] | null;
  /** True when the cursor is in the bottom half of the hovered row (insert below it). */
  insertAfter?: boolean;
  groups: ChildGroup[];
  sprints: Sprint[];
}): DragEndResolution {
  if (activeKey === overId) return { kind: "noop" };

  // Dropped onto a sibling row in the same group: reorder via Jira rank.
  if (overType === "child" && overSprintName === childSprintName) {
    const group = groups.find((g) => g.sprintName === childSprintName);
    if (!group) return { kind: "noop" };
    const groupKeys = group.items.filter((i) => !i.key.startsWith("pending-")).map((i) => i.key);
    const res = computeReorder(groupKeys, activeKey, overId);
    if (!res) return { kind: "noop" };
    return { kind: "reorder", reorder: { activeKey, groupKey: group.key, sprintName: group.sprintName, ...res } };
  }

  // Anything else is a cross-group move. Resolve the target sprint first so a closed
  // sprint (or unknown group) is rejected before we compute a position.
  const move = resolveMove({ childSprintName, targetGroup: { sprintName: overSprintName, state: overState }, sprints });
  if (!move.ok) return move.reason === "closed" ? { kind: "move-rejected", reason: "closed" } : { kind: "noop" };

  // Dropped onto a row in another group: move AND land at that row's position. The
  // cursor's half of the row decides above (insert before) vs below (insert after),
  // so a single-item target can be dropped onto from either side. Dropped onto a
  // group card: plain move, appended at the end.
  if (overType === "child") {
    const targetGroup = groups.find((g) => g.sprintName === overSprintName);
    const targetKeys = targetGroup
      ? targetGroup.items.filter((i) => !i.key.startsWith("pending-")).map((i) => i.key)
      : [];
    const idx = targetKeys.indexOf(overId);
    const insertIdx = idx === -1 ? targetKeys.length : insertAfter ? idx + 1 : idx;
    const newOrder = [...targetKeys.slice(0, insertIdx), activeKey, ...targetKeys.slice(insertIdx)];
    return {
      kind: "move-to-position",
      move: {
        activeKey,
        targetSprintId: move.targetSprintId,
        targetGroupKey: targetGroup?.key ?? (overSprintName ?? UNSCHEDULED_GROUP_KEY),
        targetSprintName: overSprintName,
        newOrder,
        ...(insertAfter ? { rankAfterKey: overId } : { rankBeforeKey: overId }),
      },
    };
  }

  return { kind: "move", targetSprintId: move.targetSprintId };
}

/**
 * Decides whether the drop-indicator bar sits above or below a given row while a
 * drag is in progress. Within the same group the side follows the drag direction
 * (dragging up inserts above, down inserts below); a cross-group drag follows the
 * cursor's half of the row (`insertAfter`), so a single-item target can be dropped
 * onto from either side. Returns undefined for every row except the hovered one.
 */
export function insertLineForRow({
  rowKey,
  activeKey,
  overKey,
  insertAfter = false,
  groups,
}: {
  rowKey: string;
  activeKey: string | null;
  overKey: string | null;
  insertAfter?: boolean;
  groups: ChildGroup[];
}): "above" | "below" | undefined {
  if (!activeKey || !overKey || rowKey !== overKey || rowKey === activeKey) return undefined;

  const groupOf = (key: string) => groups.find((g) => g.items.some((i) => i.key === key));
  const activeGroup = groupOf(activeKey);
  const overGroup = groupOf(overKey);
  if (!overGroup) return undefined;

  if (activeGroup && activeGroup.key === overGroup.key) {
    const keys = overGroup.items.filter((i) => !i.key.startsWith("pending-")).map((i) => i.key);
    const activeIdx = keys.indexOf(activeKey);
    const overIdx = keys.indexOf(overKey);
    if (activeIdx === -1 || overIdx === -1) return undefined;
    return activeIdx > overIdx ? "above" : "below";
  }

  return insertAfter ? "below" : "above";
}

/**
 * Overlays optimistic within-group orderings onto the child list so the by-sprint
 * view reflects a reorder before the server round-trip lands. Only groups present
 * in `localOrder` are reordered; every other group and item keeps its position.
 * Keys not named in an override (e.g. pending rows) keep their relative order and
 * trail the named ones, so newly created items never jump around.
 */
export function applyLocalOrder(
  items: (EpicChild | Subtask)[],
  localOrder: Record<string, string[]>,
): (EpicChild | Subtask)[] {
  if (Object.keys(localOrder).length === 0) return items;

  const overriddenGroups = new Set(Object.keys(localOrder));
  // Bucket items by group, preserving input order, but only for overridden groups.
  const buckets = new Map<string, (EpicChild | Subtask)[]>();
  for (const item of items) {
    const key = groupKeyForItem(item);
    if (!overriddenGroups.has(key)) continue;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  }

  // Per overridden group, build the reordered sequence: named keys first (in the
  // override's order), then any leftover items in their original relative order.
  const reorderedByGroup = new Map<string, (EpicChild | Subtask)[]>();
  for (const [key, bucket] of buckets) {
    const order = localOrder[key];
    const byKey = new Map(bucket.map((i) => [i.key, i]));
    const ordered: (EpicChild | Subtask)[] = [];
    for (const k of order) {
      const item = byKey.get(k);
      if (item) {
        ordered.push(item);
        byKey.delete(k);
      }
    }
    for (const item of bucket) {
      if (byKey.has(item.key)) ordered.push(item);
    }
    reorderedByGroup.set(key, ordered);
  }

  // Stitch back: walk the original list, and at the first slot of each overridden
  // group emit that group's reordered items, skipping the rest in place.
  const emitted = new Set<string>();
  const result: (EpicChild | Subtask)[] = [];
  for (const item of items) {
    const key = groupKeyForItem(item);
    const reordered = reorderedByGroup.get(key);
    if (!reordered) {
      result.push(item);
      continue;
    }
    if (!emitted.has(key)) {
      result.push(...reordered);
      emitted.add(key);
    }
  }
  return result;
}
