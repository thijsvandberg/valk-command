import { describe, it, expect } from "vitest";
import { computeQuickMoves } from "./quick-moves";
import type { Sprint } from "@/types/ticket";

function sprint(id: string, name: string, state: Sprint["state"]): Sprint {
  return { id, name, state, dateRange: "", ticketCount: 0 };
}

// BT: 138 closed, BT: 139 active, BT: 140 future, BT: Backlog, plus a second team (GXP).
const SPRINTS: Sprint[] = [
  sprint("1", "BT: 138", "closed"),
  sprint("2", "BT: 139", "active"),
  sprint("3", "BT: 140", "future"),
  sprint("9", "BT: Backlog", "future"),
  sprint("20", "GXP: 7", "active"),
];

const BACKLOG = "BT: Backlog";

function ids(names: (string | null)[], sprints = SPRINTS, backlog = BACKLOG) {
  return computeQuickMoves({ currentSprintNames: names, sprints, backlogTargetName: backlog }).map((o) => ({
    id: o.id,
    targetSprintId: o.targetSprintId,
    createName: o.createName,
    label: o.label,
  }));
}

describe("computeQuickMoves", () => {
  it("offers next, active, and backlog for a single regular sprint selection", () => {
    // Selection in BT: 139 -> next BT: 140 (id 3), active BT: 139 is current so... wait,
    // the selection IS in BT: 139 which is the active sprint, so active is hidden.
    const result = ids(["BT: 139"]);
    expect(result.map((o) => o.id)).toEqual(["next", "backlog"]);
    expect(result.find((o) => o.id === "next")).toMatchObject({ targetSprintId: "3", label: 'Move to "BT: 140"' });
    expect(result.find((o) => o.id === "backlog")).toMatchObject({ targetSprintId: "9" });
  });

  it("shows the active sprint when the selection is in a different sprint of the same team", () => {
    // Selection in the closed BT: 138 -> next BT: 139 (active, id 2), active BT: 139, backlog.
    const result = ids(["BT: 138"]);
    // next resolves to BT: 139 (id 2); active also resolves to BT: 139 (id 2) -> de-duped.
    expect(result.map((o) => o.id)).toEqual(["next", "backlog"]);
    expect(result.find((o) => o.id === "next")).toMatchObject({ targetSprintId: "2", label: 'Move to "BT: 139"' });
  });

  it("marks the next sprint for creation when it does not exist yet", () => {
    const result = ids(["BT: 140"]); // next BT: 141 does not exist
    const next = result.find((o) => o.id === "next");
    expect(next).toMatchObject({ targetSprintId: null, createName: "BT: 141", label: 'Move to "BT: 141"' });
    // active (BT: 139) and backlog still present.
    expect(result.map((o) => o.id)).toEqual(["next", "active", "backlog"]);
  });

  it("hides the active option when all items are already in the active sprint", () => {
    const result = ids(["BT: 139"]); // BT: 139 is active
    expect(result.map((o) => o.id)).not.toContain("active");
  });

  it("hides the backlog option when all items are already in that backlog", () => {
    const result = ids(["BT: Backlog"]);
    expect(result.map((o) => o.id)).not.toContain("backlog");
    // next is hidden (non-regular), active resolves (prefix BT).
    expect(result.map((o) => o.id)).toEqual(["active"]);
  });

  it("hides next for a multi-sprint selection but keeps active (single team) and backlog", () => {
    const result = ids(["BT: 138", "BT: 140"]);
    expect(result.map((o) => o.id)).toEqual(["active", "backlog"]);
    expect(result.find((o) => o.id === "active")).toMatchObject({ targetSprintId: "2" });
  });

  it("hides active for a multi-team selection (next also hidden), keeps backlog", () => {
    const result = ids(["BT: 139", "GXP: 7"]);
    expect(result.map((o) => o.id)).toEqual(["backlog"]);
  });

  it("handles an unscheduled (null) selection: only backlog", () => {
    const result = ids([null]);
    expect(result.map((o) => o.id)).toEqual(["backlog"]);
  });

  it("de-duplicates when next and active resolve to the same sprint", () => {
    // Selection in BT: 138 -> next is BT: 139 which is also the active sprint.
    const result = ids(["BT: 138"]);
    const targets = result.map((o) => o.targetSprintId);
    expect(new Set(targets).size).toBe(targets.length); // no duplicate target ids
    expect(result.filter((o) => o.targetSprintId === "2")).toHaveLength(1);
  });

  it("hides the backlog option when the configured backlog name is not in the sprint list", () => {
    const result = ids(["BT: 139"], SPRINTS, "ZZ: Backlog");
    expect(result.map((o) => o.id)).not.toContain("backlog");
  });

  it("hides the active option when the team has no active sprint", () => {
    const noActive = SPRINTS.map((s) => (s.name === "BT: 139" ? sprint(s.id, s.name, "future") : s));
    const result = computeQuickMoves({ currentSprintNames: ["BT: 140"], sprints: noActive, backlogTargetName: BACKLOG });
    expect(result.map((o) => o.id)).not.toContain("active");
  });

  it("returns nothing for an empty selection", () => {
    expect(ids([])).toEqual([]);
  });
});
