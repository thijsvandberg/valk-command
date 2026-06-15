import { describe, it, expect } from "vitest";
import {
  resolveMove,
  sprintNameForTarget,
  applyLocalMoves,
  BACKLOG_TARGET,
} from "./epic-children-move";
import type { EpicChild, Subtask, Sprint } from "@/types/ticket";
import type { ChildGroup } from "./epic-children-grouping";

function sprint(id: string, name: string, state: Sprint["state"]): Sprint {
  return { id, name, dateRange: "", state, ticketCount: 0, startDate: null, endDate: null, goal: null };
}

function group(sprintName: string | null, state: ChildGroup["state"]): Pick<ChildGroup, "sprintName" | "state"> {
  return { sprintName, state };
}

function child(key: string, sprintName: string | null, storyPoints: number | null = null): EpicChild {
  return {
    key,
    title: `Child ${key}`,
    type: "story",
    jiraStatus: "TO DO",
    assignee: null,
    flagged: false,
    storyPoints,
    businessValue: null,
    sprintName,
    subtaskCount: 0,
    readiness: null,
    jiraRank: null,
  };
}

const SPRINTS = [
  sprint("101", "Sprint 1", "active"),
  sprint("102", "Sprint 2", "future"),
  sprint("103", "Sprint 0", "closed"),
];

describe("resolveMove", () => {
  it("resolves a named target group to its sprint id", () => {
    const res = resolveMove({ childSprintName: "Sprint 1", targetGroup: group("Sprint 2", "future"), sprints: SPRINTS });
    expect(res).toEqual({ ok: true, targetSprintId: "102" });
  });

  it("maps the Unscheduled group to the backlog target", () => {
    const res = resolveMove({ childSprintName: "Sprint 1", targetGroup: group(null, null), sprints: SPRINTS });
    expect(res).toEqual({ ok: true, targetSprintId: BACKLOG_TARGET });
  });

  it("treats a drop on the child's current group as a no-op", () => {
    const res = resolveMove({ childSprintName: "Sprint 1", targetGroup: group("Sprint 1", "active"), sprints: SPRINTS });
    expect(res).toEqual({ ok: false, reason: "noop" });
  });

  it("treats Unscheduled -> Unscheduled as a no-op", () => {
    const res = resolveMove({ childSprintName: null, targetGroup: group(null, null), sprints: SPRINTS });
    expect(res).toEqual({ ok: false, reason: "noop" });
  });

  it("rejects a drop onto a closed sprint group", () => {
    const res = resolveMove({ childSprintName: "Sprint 1", targetGroup: group("Sprint 0", "closed"), sprints: SPRINTS });
    expect(res).toEqual({ ok: false, reason: "closed" });
  });

  it("reports unknown when a named target has no matching sprint metadata", () => {
    const res = resolveMove({ childSprintName: "Sprint 1", targetGroup: group("Ghost Sprint", null), sprints: SPRINTS });
    expect(res).toEqual({ ok: false, reason: "unknown" });
  });
});

describe("sprintNameForTarget", () => {
  it("maps a sprint id back to its name", () => {
    expect(sprintNameForTarget("102", SPRINTS)).toBe("Sprint 2");
  });

  it("maps the backlog target to null", () => {
    expect(sprintNameForTarget(BACKLOG_TARGET, SPRINTS)).toBeNull();
  });

  it("returns null for an unknown id", () => {
    expect(sprintNameForTarget("999", SPRINTS)).toBeNull();
  });
});

describe("applyLocalMoves", () => {
  it("returns the same array when there are no overrides", () => {
    const items = [child("A", "Sprint 1")];
    expect(applyLocalMoves(items, {})).toBe(items);
  });

  it("overrides sprintName for moved children", () => {
    const items = [child("A", "Sprint 1"), child("B", "Sprint 1")];
    const result = applyLocalMoves(items, { A: "Sprint 2" });
    expect((result[0] as EpicChild).sprintName).toBe("Sprint 2");
    expect((result[1] as EpicChild).sprintName).toBe("Sprint 1");
  });

  it("can move a child to the backlog (null sprintName)", () => {
    const result = applyLocalMoves([child("A", "Sprint 1")], { A: null });
    expect((result[0] as EpicChild).sprintName).toBeNull();
  });

  it("gives a locally-added Subtask a sprintName when moved into a sprint", () => {
    const local: Subtask = { key: "L", title: "Local", type: "task", jiraStatus: "TO DO", assignee: null };
    const result = applyLocalMoves([local], { L: "Sprint 1" });
    expect((result[0] as EpicChild).sprintName).toBe("Sprint 1");
  });
});
