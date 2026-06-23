import { describe, it, expect } from "vitest";
import {
  groupChildrenBySprint,
  nextRegularSprintGroup,
  canPlanNextSprint,
  nextRegularSprintCreateGroup,
  placeNextCreateZone,
  backlogDropGroups,
  CREATE_NEXT_SPRINT_GROUP_KEY,
  sortNamedGroups,
  isEpicChild,
  UNSCHEDULED_GROUP_KEY,
  type ChildGroup,
} from "./epic-children-grouping";
import type { EpicChild, Subtask, Sprint } from "@/types/ticket";

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

describe("isEpicChild", () => {
  it("returns true for an epic child (has storyPoints)", () => {
    expect(isEpicChild(child("A", "Sprint 1", 5))).toBe(true);
    // storyPoints present but null still counts: the key exists on the object.
    expect(isEpicChild(child("B", "Sprint 1", null))).toBe(true);
  });

  it("returns false for a plain Subtask (no storyPoints key)", () => {
    const subtask: Subtask = {
      key: "SUB-1",
      title: "A subtask",
      type: "subtask",
      jiraStatus: "TO DO",
      assignee: null,
    };
    expect(isEpicChild(subtask)).toBe(false);
  });
});

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

  it("sinks an undated sprint below dated ones within the same state", () => {
    const sprints = [
      sprint("Dated Future", "future", "2026-07-01"),
      sprint("Undated Future", "future", null),
    ];
    const groups = groupChildrenBySprint(
      [child("U", "Undated Future"), child("D", "Dated Future")],
      sprints,
    );
    expect(groups.map((g) => g.label)).toEqual(["Dated Future", "Undated Future"]);
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

describe("nextRegularSprintGroup", () => {
  // Minimal ChildGroup factory; only sprintName matters for the next-sprint pick.
  function group(sprintName: string | null): ChildGroup {
    return {
      key: sprintName ?? UNSCHEDULED_GROUP_KEY,
      label: sprintName ?? "Unscheduled",
      sprintName,
      items: [],
      isActive: false,
      state: null,
      dateRange: null,
    };
  }

  it("returns the highest visible regular sprint + 1 when that sprint exists", () => {
    const visible = [group("BT: 138"), group("BT: 140"), group("BT: 139")];
    const sprints = [sprint("BT: 141", "future", "2026-07-03")];
    const next = nextRegularSprintGroup(visible, sprints);
    expect(next?.sprintName).toBe("BT: 141");
    expect(next?.label).toBe("BT: 141");
    expect(next?.items).toEqual([]);
    expect(next?.state).toBe("future");
    expect(next?.dateRange).toBe("BT: 141 range");
  });

  it("returns null (no gap-skip) when the strict +1 sprint does not exist", () => {
    const visible = [group("BT: 140")];
    // BT: 141 is missing; BT: 142 exists, but we must not jump ahead to it.
    const sprints = [sprint("BT: 142", "future", "2026-07-17")];
    expect(nextRegularSprintGroup(visible, sprints)).toBeNull();
  });

  it("ignores non-numeric placeholders and Unscheduled when picking the highest", () => {
    const visible = [group("BT: 141"), group("GXP: Backlog"), group("BT: TODO"), group(null)];
    const sprints = [sprint("BT: 142", "future", "2026-07-17")];
    // Highest regular numeric is BT: 141 (placeholders/Unscheduled excluded) -> BT: 142.
    expect(nextRegularSprintGroup(visible, sprints)?.sprintName).toBe("BT: 142");
  });

  it("uses the prefix of the highest-numbered sprint when prefixes are mixed", () => {
    const visible = [group("BT: 139"), group("GXP: 200")];
    const sprints = [sprint("GXP: 201", "future", "2026-08-01")];
    expect(nextRegularSprintGroup(visible, sprints)?.sprintName).toBe("GXP: 201");
  });

  it("returns null when no regular numeric sprint is visible", () => {
    const visible = [group("GXP: Backlog"), group(null)];
    const sprints = [sprint("BT: 1", "future", "2026-07-03")];
    expect(nextRegularSprintGroup(visible, sprints)).toBeNull();
  });

  it("returns null when the candidate is already a visible group", () => {
    const visible = [group("BT: 140"), group("BT: 141")];
    const sprints = [sprint("BT: 141", "future", "2026-07-03")];
    // Highest is BT: 141, so +1 is BT: 142 which does not exist -> null. Also guards
    // the duplicate case directly.
    expect(nextRegularSprintGroup(visible, sprints)).toBeNull();
  });

  it("sorts the synthetic future group above a trailing backlog group", () => {
    // Mirrors the screenshot: a backlog-state placeholder must not outrank the next
    // regular future sprint once it is folded into the grouping order.
    const sprints = [
      sprint("BT: 142", "future", "2026-07-17"),
      sprint("GXP: Backlog", "backlog", null),
    ];
    const synthetic = nextRegularSprintGroup([group("BT: 141")], sprints)!;
    expect(synthetic.state).toBe("future");

    const backlog = group("GXP: Backlog");
    backlog.state = "backlog";
    const ordered = sortNamedGroups([backlog, synthetic], sprints);
    expect(ordered.map((g) => g.label)).toEqual(["BT: 142", "GXP: Backlog"]);
  });
});

describe("canPlanNextSprint", () => {
  // Minimal ChildGroup factory; only sprintName drives the next-sprint pick.
  function group(sprintName: string | null): ChildGroup {
    return {
      key: sprintName ?? UNSCHEDULED_GROUP_KEY,
      label: sprintName ?? "Unscheduled",
      sprintName,
      items: [],
      isActive: false,
      state: null,
      dateRange: null,
    };
  }

  it("predicts the sprint right after the epic's highest visible numbered sprint", () => {
    const visible = [group("BT: 140"), group("BT: 141")];
    // Highest visible is BT: 141 -> next is BT: 142, which is absent.
    expect(canPlanNextSprint(visible, [sprint("BT: 141", "active", "2026-07-03")])).toBe("BT: 142");
  });

  it("returns null when that next sprint already exists (the move zone owns the slot)", () => {
    // Epic tops at BT: 142; BT: 143 exists, so only the plain move zone shows - no create.
    const visible = [group("BT: 142")];
    const sprints = [sprint("BT: 142", "future", null), sprint("BT: 143", "future", null)];
    expect(canPlanNextSprint(visible, sprints)).toBeNull();
  });

  it("scopes to the epic's dominant team (highest visible number)", () => {
    const visible = [group("BT: 141"), group("GXP: 140")];
    const sprints = [sprint("BT: 141", "active", null), sprint("GXP: 140", "future", null)];
    expect(canPlanNextSprint(visible, sprints)).toBe("BT: 142");
  });

  it("plans from a backlog-only epic using the team's global latest", () => {
    // The epic sits only in BT: Backlog; the team is read from it and its global latest
    // (BT: 143) is extended, so a child can be pulled straight into a new sprint.
    const visible = [group("BT: Backlog")];
    const sprints = [
      sprint("BT: 142", "future", null),
      sprint("BT: 143", "future", null),
      sprint("BT: Backlog", "future", null),
    ];
    expect(canPlanNextSprint(visible, sprints)).toBe("BT: 144");
  });

  it("returns null when the epic's team cannot be determined", () => {
    expect(canPlanNextSprint([group(null)], [sprint("BT: 1", "future", null)])).toBeNull();
  });

  it("returns null when the backlog's team has no sprints to extend", () => {
    expect(canPlanNextSprint([group("ZZ: Backlog")], [sprint("BT: 1", "future", null)])).toBeNull();
  });
});

describe("nextRegularSprintCreateGroup", () => {
  function group(sprintName: string | null): ChildGroup {
    return {
      key: sprintName ?? UNSCHEDULED_GROUP_KEY,
      label: sprintName ?? "Unscheduled",
      sprintName,
      items: [],
      isActive: false,
      state: null,
      dateRange: null,
    };
  }

  it("builds a create-zone group carrying the predicted name", () => {
    const zone = nextRegularSprintCreateGroup([group("BT: 141")], [sprint("BT: 141", "active", null)]);
    expect(zone?.key).toBe(CREATE_NEXT_SPRINT_GROUP_KEY);
    expect(zone?.label).toBe("BT: 142");
    expect(zone?.sprintName).toBe("BT: 142");
    expect(zone?.isCreateZone).toBe(true);
    expect(zone?.items).toEqual([]);
  });

  it("returns null when no next sprint can be planned", () => {
    expect(nextRegularSprintCreateGroup([group(null)], [])).toBeNull();
  });

  it("returns null when the next sprint already exists (move zone owns the slot)", () => {
    const sprints = [sprint("BT: 141", "active", null), sprint("BT: 142", "future", null)];
    expect(nextRegularSprintCreateGroup([group("BT: 141")], sprints)).toBeNull();
  });
});

describe("placeNextCreateZone", () => {
  function group(sprintName: string | null): ChildGroup {
    return {
      key: sprintName ?? UNSCHEDULED_GROUP_KEY,
      label: sprintName ?? "Unscheduled",
      sprintName,
      items: [],
      isActive: false,
      state: null,
      dateRange: null,
    };
  }
  const zone = (name: string): ChildGroup => ({ ...group(name), key: CREATE_NEXT_SPRINT_GROUP_KEY, isCreateZone: true, isDropZone: true });

  it("inserts the create zone right after the team's last numbered sprint", () => {
    const ordered = [group("BT: 141"), group("BT: 142"), group("GXP: 140"), group("BT: Backlog")];
    const result = placeNextCreateZone(ordered, zone("BT: 143"));
    expect(result.map((g) => g.label)).toEqual(["BT: 141", "BT: 142", "BT: 143", "GXP: 140", "BT: Backlog"]);
  });

  it("appends when the team has no numbered sprint shown (e.g. a backlog-only epic)", () => {
    const ordered = [group("GXP: 140"), group("BT: Backlog")];
    const result = placeNextCreateZone(ordered, zone("BT: 144"));
    expect(result.map((g) => g.label)).toEqual(["GXP: 140", "BT: Backlog", "BT: 144"]);
  });
});

describe("backlogDropGroups", () => {
  function group(sprintName: string | null): ChildGroup {
    return {
      key: sprintName ?? UNSCHEDULED_GROUP_KEY,
      label: sprintName ?? "Unscheduled",
      sprintName,
      items: [],
      isActive: false,
      state: null,
      dateRange: null,
    };
  }

  it("surfaces a team-less Backlog and the epic's team backlog as empty drop zones", () => {
    // Backlog sprints arrive from Jira as "future" (Jira has no backlog state); they
    // are identified by name, not state.
    const sprints = [
      sprint("BT: 141", "active", "2026-07-03"),
      sprint("Backlog", "future", null),
      sprint("BT: Backlog", "future", null),
    ];
    const zones = backlogDropGroups([group("BT: 141")], sprints);
    expect(zones.map((z) => z.sprintName).sort()).toEqual(["BT: Backlog", "Backlog"].sort());
    expect(zones.every((z) => z.isDropZone && z.items.length === 0)).toBe(true);
  });

  it("excludes other teams' backlogs the epic does not touch", () => {
    const sprints = [
      sprint("BT: 141", "active", "2026-07-03"),
      sprint("BT: Backlog", "future", null),
      sprint("GXP: Backlog", "future", null),
    ];
    const zones = backlogDropGroups([group("BT: 141")], sprints);
    expect(zones.map((z) => z.sprintName)).toEqual(["BT: Backlog"]);
  });

  it("excludes a backlog already shown as a group (it has children)", () => {
    const sprints = [
      sprint("BT: 141", "active", "2026-07-03"),
      sprint("BT: Backlog", "future", null),
    ];
    // BT: Backlog is already a visible group, so it is not duplicated as a zone.
    const zones = backlogDropGroups([group("BT: 141"), group("BT: Backlog")], sprints);
    expect(zones).toEqual([]);
  });

  it("returns nothing when there are no backlog-named sprints", () => {
    const sprints = [sprint("BT: 141", "active", "2026-07-03")];
    expect(backlogDropGroups([group("BT: 141")], sprints)).toEqual([]);
  });
});
