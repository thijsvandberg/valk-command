import { describe, it, expect } from "vitest";
import { computeReorder, applyLocalOrder, groupKeyForItem, resolveDragEnd, insertLineForRow } from "./epic-children-reorder";
import { groupChildrenBySprint, nextRegularSprintGroup, UNSCHEDULED_GROUP_KEY } from "./epic-children-grouping";
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

  it("moves to a position above the hovered row when the cursor is in its top half", () => {
    const res = resolveDragEnd({
      ...base,
      activeKey: "VPL-10",
      overId: "VPL-12",
      overType: "child",
      overSprintName: "Sprint 2",
      overState: "future",
      insertAfter: false,
    });
    expect(res).toEqual({
      kind: "move-to-position",
      move: {
        activeKey: "VPL-10",
        targetSprintId: "2",
        targetGroupKey: "Sprint 2",
        targetSprintName: "Sprint 2",
        newOrder: ["VPL-10", "VPL-12"],
        rankBeforeKey: "VPL-12",
      },
    });
  });

  it("moves to a position below the hovered row when the cursor is in its bottom half", () => {
    const res = resolveDragEnd({
      ...base,
      activeKey: "VPL-10",
      overId: "VPL-12",
      overType: "child",
      overSprintName: "Sprint 2",
      overState: "future",
      insertAfter: true,
    });
    expect(res).toEqual({
      kind: "move-to-position",
      move: {
        activeKey: "VPL-10",
        targetSprintId: "2",
        targetGroupKey: "Sprint 2",
        targetSprintName: "Sprint 2",
        newOrder: ["VPL-12", "VPL-10"],
        rankAfterKey: "VPL-12",
      },
    });
  });

  it("rejects a move-to-position into a closed sprint", () => {
    const closedItems = [...items, child("VPL-90", "Old Sprint", 0)];
    const res = resolveDragEnd({
      ...base,
      groups: groupChildrenBySprint(closedItems, SPRINTS),
      activeKey: "VPL-10",
      overId: "VPL-90",
      overType: "child",
      overSprintName: "Old Sprint",
      overState: "closed",
    });
    expect(res).toEqual({ kind: "move-rejected", reason: "closed" });
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

  it("resolves a drop onto the synthetic next-sprint group to its sprint id (BRDG-306)", () => {
    // The next-sprint drop zone is an empty group injected only during drag. From
    // resolveDragEnd's view it is a normal future group, so the move resolves to id.
    const next = nextRegularSprintGroup(
      [{ key: "Sprint 2", label: "Sprint 2", sprintName: "Sprint 2", items: [], isActive: false, state: "future", dateRange: null }],
      SPRINTS,
    );
    expect(next).toBeNull(); // "Sprint 2" is not a regular PREFIX: N name.

    const regularSprints: Sprint[] = [
      { id: "138", name: "BT: 138", dateRange: "", state: "active", ticketCount: 0, startDate: "2026-05-22", endDate: null, goal: null },
      { id: "139", name: "BT: 139", dateRange: "", state: "future", ticketCount: 0, startDate: "2026-06-05", endDate: null, goal: null },
    ];
    const regularGroups = groupChildrenBySprint([child("VPL-20", "BT: 138", 0)], regularSprints);
    const synthetic = nextRegularSprintGroup(regularGroups, regularSprints);
    expect(synthetic?.sprintName).toBe("BT: 139");

    const res = resolveDragEnd({
      childSprintName: "BT: 138",
      groups: [...regularGroups, synthetic!],
      sprints: regularSprints,
      activeKey: "VPL-20",
      overId: "BT: 139",
      overType: "group",
      overSprintName: "BT: 139",
      overState: "future",
    });
    expect(res).toEqual({ kind: "move", targetSprintId: "139" });
  });
});

describe("insertLineForRow", () => {
  const items = [
    child("VPL-10", "Sprint 1", 0),
    child("VPL-11", "Sprint 1", 1),
    child("VPL-12", "Sprint 2", 0),
  ];
  const groups = groupChildrenBySprint(items, SPRINTS);

  it("shows the bar below the target when dragging down within a group", () => {
    expect(insertLineForRow({ rowKey: "VPL-11", activeKey: "VPL-10", overKey: "VPL-11", groups })).toBe("below");
  });

  it("shows the bar above the target when dragging up within a group", () => {
    expect(insertLineForRow({ rowKey: "VPL-10", activeKey: "VPL-11", overKey: "VPL-10", groups })).toBe("above");
  });

  it("shows the bar above or below the target for a cross-group drag per cursor half", () => {
    expect(insertLineForRow({ rowKey: "VPL-12", activeKey: "VPL-10", overKey: "VPL-12", insertAfter: false, groups })).toBe("above");
    expect(insertLineForRow({ rowKey: "VPL-12", activeKey: "VPL-10", overKey: "VPL-12", insertAfter: true, groups })).toBe("below");
  });

  it("returns undefined for rows that are not the hovered one", () => {
    expect(insertLineForRow({ rowKey: "VPL-10", activeKey: "VPL-11", overKey: "VPL-12", groups })).toBeUndefined();
  });

  it("returns undefined for the dragged row itself and when nothing is hovered", () => {
    expect(insertLineForRow({ rowKey: "VPL-10", activeKey: "VPL-10", overKey: "VPL-10", groups })).toBeUndefined();
    expect(insertLineForRow({ rowKey: "VPL-10", activeKey: "VPL-10", overKey: null, groups })).toBeUndefined();
  });
});
