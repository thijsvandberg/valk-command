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

export type DragEndResolution =
  | { kind: "noop" }
  | { kind: "reorder"; reorder: ChildReorder }
  | { kind: "move"; targetSprintId: string }
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
  groups,
  sprints,
}: {
  activeKey: string;
  overId: string;
  childSprintName: string | null;
  overType: "child" | "group" | undefined;
  overSprintName: string | null;
  overState: Sprint["state"] | null;
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

  // Dropped onto a row in another group, or onto a group card: move sprints.
  const move = resolveMove({ childSprintName, targetGroup: { sprintName: overSprintName, state: overState }, sprints });
  if (move.ok) return { kind: "move", targetSprintId: move.targetSprintId };
  if (move.reason === "closed") return { kind: "move-rejected", reason: "closed" };
  return { kind: "noop" };
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
