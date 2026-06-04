import { describe, it, expect } from "vitest";
import { groupChildrenBySprint, UNSCHEDULED_GROUP_KEY } from "./epic-children-grouping";
import type { EpicChild, Subtask, Sprint } from "@/types/ticket";

function child(key: string, sprintName: string | null, storyPoints: number | null = null): EpicChild {
  return {
    key,
    title: `Child ${key}`,
    type: "story",
    jiraStatus: "TO DO",
    assignee: null,
    storyPoints,
    businessValue: null,
    sprintName,
    subtaskCount: 0,
    readiness: null,
    jiraRank: null,
  };
}

function sprint(name: string, state: Sprint["state"], startDate: string | null): Sprint {
  return {
    id: name,
    name,
    dateRange: `${name} range`,
    state,
    ticketCount: 0,
    startDate,
    endDate: null,
    goal: null,
  };
}

describe("groupChildrenBySprint", () => {
  it("groups children that share a sprint name into one group", () => {
    const groups = groupChildrenBySprint([
      child("A", "Sprint 1"),
      child("B", "Sprint 1"),
      child("C", "Sprint 2"),
    ]);
    const s1 = groups.find((g) => g.sprintName === "Sprint 1");
    expect(s1?.items.map((i) => i.key)).toEqual(["A", "B"]);
    expect(groups.find((g) => g.sprintName === "Sprint 2")?.items).toHaveLength(1);
  });

  it("buckets an optimistic pending placeholder by its sprintName, not into Unscheduled", () => {
    // Mirrors the placeholder EpicChildrenSection.handleCreate builds for a
    // sprint-targeted create: a pending key carrying the target sprint name.
    const placeholder: EpicChild = child("pending-123", "Sprint 2");
    const groups = groupChildrenBySprint([child("A", "Sprint 1"), placeholder], [
      sprint("Sprint 1", "active", "2026-06-01"),
      sprint("Sprint 2", "future", "2026-07-01"),
    ]);
    expect(groups.find((g) => g.sprintName === "Sprint 2")?.items.map((i) => i.key)).toEqual(["pending-123"]);
    expect(groups.find((g) => g.key === UNSCHEDULED_GROUP_KEY)).toBeUndefined();
  });

  it("collects children with sprintName null into the Unscheduled group, pinned last", () => {
    const groups = groupChildrenBySprint([
      child("A", null),
      child("B", "Sprint 1"),
      child("C", null),
    ]);
    const last = groups[groups.length - 1];
    expect(last.key).toBe(UNSCHEDULED_GROUP_KEY);
    expect(last.label).toBe("Unscheduled");
    expect(last.sprintName).toBeNull();
    expect(last.items.map((i) => i.key)).toEqual(["A", "C"]);
  });

  it("treats locally-added subtasks (no sprintName property) as Unscheduled", () => {
    const local: Subtask = { key: "L", title: "Local", type: "task", jiraStatus: "TO DO", assignee: null };
    const groups = groupChildrenBySprint([child("A", "Sprint 1"), local]);
    const unscheduled = groups.find((g) => g.key === UNSCHEDULED_GROUP_KEY);
    expect(unscheduled?.items.map((i) => i.key)).toEqual(["L"]);
  });

  it("omits the Unscheduled group when every child has a sprint", () => {
    const groups = groupChildrenBySprint([child("A", "Sprint 1"), child("B", "Sprint 2")]);
    expect(groups.some((g) => g.key === UNSCHEDULED_GROUP_KEY)).toBe(false);
  });

  it("returns an empty array for no children", () => {
    expect(groupChildrenBySprint([])).toEqual([]);
  });

  it("orders named groups closed -> active -> future, then Unscheduled, when metadata is provided", () => {
    const sprints = [
      sprint("Future Sprint", "future", "2026-07-01"),
      sprint("Closed Sprint", "closed", "2026-05-01"),
      sprint("Active Sprint", "active", "2026-06-01"),
    ];
    const groups = groupChildrenBySprint(
      [
        child("F", "Future Sprint"),
        child("C", "Closed Sprint"),
        child("A", "Active Sprint"),
        child("U", null),
      ],
      sprints,
    );
    expect(groups.map((g) => g.label)).toEqual([
      "Closed Sprint",
      "Active Sprint",
      "Future Sprint",
      "Unscheduled",
    ]);
  });

  it("orders by start date within the same state", () => {
    const sprints = [
      sprint("Closed B", "closed", "2026-05-15"),
      sprint("Closed A", "closed", "2026-05-01"),
    ];
    const groups = groupChildrenBySprint([child("B", "Closed B"), child("A", "Closed A")], sprints);
    expect(groups.map((g) => g.label)).toEqual(["Closed A", "Closed B"]);
  });

  it("derives state, dateRange and isActive from the matched sprint", () => {
    const sprints = [sprint("Active Sprint", "active", "2026-06-01")];
    const [group] = groupChildrenBySprint([child("A", "Active Sprint")], sprints);
    expect(group.state).toBe("active");
    expect(group.isActive).toBe(true);
    expect(group.dateRange).toBe("Active Sprint range");
  });

  it("leaves state null and sorts after matched groups when the sprint name has no metadata", () => {
    const sprints = [sprint("Known Sprint", "active", "2026-06-01")];
    const groups = groupChildrenBySprint(
      [child("U", "Unknown Sprint"), child("K", "Known Sprint")],
      sprints,
    );
    expect(groups.map((g) => g.label)).toEqual(["Known Sprint", "Unknown Sprint"]);
    const unknown = groups.find((g) => g.label === "Unknown Sprint");
    expect(unknown?.state).toBeNull();
    expect(unknown?.isActive).toBe(false);
  });

  it("preserves all items across groups (totals match the flat list)", () => {
    const items = [
      child("A", "Sprint 1", 3),
      child("B", "Sprint 1", 5),
      child("C", "Sprint 2", 2),
      child("D", null, 1),
    ];
    const groups = groupChildrenBySprint(items);
    const grouped = groups.flatMap((g) => g.items);
    expect(grouped).toHaveLength(items.length);
    const totalSp = (list: (EpicChild | Subtask)[]) =>
      list.reduce((sum, i) => sum + (("storyPoints" in i ? i.storyPoints : null) ?? 0), 0);
    expect(totalSp(grouped)).toBe(totalSp(items));
  });
});
