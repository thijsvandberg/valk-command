import type { EpicChild, Subtask } from "@/types/ticket";
import { UNSCHEDULED_GROUP_KEY } from "./epic-children-grouping";

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
