import { describe, it, expect } from "vitest";
import { computeReorder, applyLocalOrder, groupKeyForItem, resolveDragEnd } from "./epic-children-reorder";
import { groupChildrenBySprint, UNSCHEDULED_GROUP_KEY } from "./epic-children-grouping";
import type { EpicChild, Sprint } from "@/types/ticket";

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

const SPRINTS: Sprint[] = [
  { id: "1", name: "Sprint 1", dateRange: "", state: "active", ticketCount: 0, startDate: "2026-06-01", endDate: null, goal: null },
  { id: "2", name: "Sprint 2", dateRange: "", state: "future", ticketCount: 0, startDate: "2026-07-01", endDate: null, goal: null },
  { id: "9", name: "Old Sprint", dateRange: "", state: "closed", ticketCount: 0, startDate: "2026-05-01", endDate: null, goal: null },
];

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

describe("resolveDragEnd", () => {
  const items = [
    child("VPL-10", "Sprint 1", 0),
    child("VPL-11", "Sprint 1", 1),
    child("VPL-12", "Sprint 2", 0),
  ];
  const groups = groupChildrenBySprint(items, SPRINTS);

  const base = { childSprintName: "Sprint 1", groups, sprints: SPRINTS };

  it("reorders when dropped onto a sibling row in the same group", () => {
    const res = resolveDragEnd({
      ...base,
      activeKey: "VPL-11",
      overId: "VPL-10",
      overType: "child",
      overSprintName: "Sprint 1",
      overState: "active",
    });
    expect(res).toEqual({
      kind: "reorder",
      reorder: { activeKey: "VPL-11", groupKey: "Sprint 1", sprintName: "Sprint 1", newOrder: ["VPL-11", "VPL-10"], rankBeforeKey: "VPL-10" },
    });
  });

  it("moves when dropped onto a row in another group", () => {
    const res = resolveDragEnd({
      ...base,
      activeKey: "VPL-10",
      overId: "VPL-12",
      overType: "child",
      overSprintName: "Sprint 2",
      overState: "future",
    });
    expect(res).toEqual({ kind: "move", targetSprintId: "2" });
  });

  it("moves when dropped onto a group card", () => {
    const res = resolveDragEnd({
      ...base,
      activeKey: "VPL-10",
      overId: "Sprint 2",
      overType: "group",
      overSprintName: "Sprint 2",
      overState: "future",
    });
    expect(res).toEqual({ kind: "move", targetSprintId: "2" });
  });

  it("rejects a move into a closed sprint", () => {
    const res = resolveDragEnd({
      ...base,
      activeKey: "VPL-10",
      overId: "Old Sprint",
      overType: "group",
      overSprintName: "Old Sprint",
      overState: "closed",
    });
    expect(res).toEqual({ kind: "move-rejected", reason: "closed" });
  });

  it("is a no-op when dropped on itself", () => {
    const res = resolveDragEnd({
      ...base,
      activeKey: "VPL-10",
      overId: "VPL-10",
      overType: "child",
      overSprintName: "Sprint 1",
      overState: "active",
    });
    expect(res).toEqual({ kind: "noop" });
  });

  it("is a no-op when dropped onto the same group card it already lives in", () => {
    const res = resolveDragEnd({
      ...base,
      activeKey: "VPL-10",
      overId: "Sprint 1",
      overType: "group",
      overSprintName: "Sprint 1",
      overState: "active",
    });
    expect(res).toEqual({ kind: "noop" });
  });
});
