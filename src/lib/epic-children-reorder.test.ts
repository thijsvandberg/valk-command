import { describe, it, expect } from "vitest";
import { computeReorder, applyLocalOrder, groupKeyForItem } from "./epic-children-reorder";
import { UNSCHEDULED_GROUP_KEY } from "./epic-children-grouping";
import type { EpicChild } from "@/types/ticket";

function child(key: string, sprintName: string | null, jiraRank: number | null): EpicChild {
  return {
    key,
    title: key,
    type: "story",
    jiraStatus: "TO DO",
    assignee: null,
    storyPoints: null,
    businessValue: null,
    sprintName,
    subtaskCount: 0,
    readiness: null,
    jiraRank,
  };
}

describe("computeReorder", () => {
  const keys = ["A", "B", "C", "D"];

  it("ranks before the target when dragging up", () => {
    const res = computeReorder(keys, "D", "B");
    expect(res).toEqual({ newOrder: ["A", "D", "B", "C"], rankBeforeKey: "B" });
  });

  it("ranks after the target when dragging down", () => {
    const res = computeReorder(keys, "A", "C");
    expect(res).toEqual({ newOrder: ["B", "C", "A", "D"], rankAfterKey: "C" });
  });

  it("returns null for a no-op (active === over)", () => {
    expect(computeReorder(keys, "B", "B")).toBeNull();
  });

  it("returns null when a key is missing from the group", () => {
    expect(computeReorder(keys, "Z", "B")).toBeNull();
    expect(computeReorder(keys, "A", "Z")).toBeNull();
  });
});

describe("applyLocalOrder", () => {
  it("returns the input unchanged when no overrides", () => {
    const items = [child("A", "S1", 0), child("B", "S1", 1)];
    expect(applyLocalOrder(items, {})).toBe(items);
  });

  it("reorders only the targeted group, leaving others untouched", () => {
    const items = [
      child("A", "S1", 0),
      child("B", "S1", 1),
      child("C", "S2", 0),
      child("D", "S2", 1),
    ];
    const result = applyLocalOrder(items, { S1: ["B", "A"] });
    expect(result.map((i) => i.key)).toEqual(["B", "A", "C", "D"]);
  });

  it("keeps interleaved groups in their original slots", () => {
    // S1 and S2 rows interleaved in the source array; reordering S1 must not
    // disturb where the S2 rows render relative to the first S1 slot.
    const items = [
      child("A", "S1", 0),
      child("C", "S2", 0),
      child("B", "S1", 1),
    ];
    const result = applyLocalOrder(items, { S1: ["B", "A"] });
    expect(result.map((i) => i.key)).toEqual(["B", "A", "C"]);
  });

  it("appends keys not named in the override (e.g. pending rows)", () => {
    const items = [child("A", "S1", 0), child("B", "S1", 1), child("pending-1", "S1", null)];
    const result = applyLocalOrder(items, { S1: ["B", "A"] });
    expect(result.map((i) => i.key)).toEqual(["B", "A", "pending-1"]);
  });

  it("reorders the unscheduled group via its bucket key", () => {
    const items = [child("A", null, 0), child("B", null, 1)];
    const result = applyLocalOrder(items, { [UNSCHEDULED_GROUP_KEY]: ["B", "A"] });
    expect(result.map((i) => i.key)).toEqual(["B", "A"]);
  });
});

describe("groupKeyForItem", () => {
  it("uses the sprint name", () => {
    expect(groupKeyForItem(child("A", "S1", 0))).toBe("S1");
  });

  it("falls back to the unscheduled key", () => {
    expect(groupKeyForItem(child("A", null, 0))).toBe(UNSCHEDULED_GROUP_KEY);
  });
});
