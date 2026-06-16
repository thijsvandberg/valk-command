import { describe, it, expect } from "vitest";
import {
  groupNewStories,
  groupInboxStories,
  resolveTeam,
  dateBucket,
  buildTeamMap,
  UNASSIGNED_TEAM_LABEL,
  type UserTeamAssignment,
} from "./new-stories-grouping";
import type { NewStoryRow } from "./new-stories-types";

const NOW = new Date("2026-06-16T12:00:00.000Z");

function row(partial: Partial<NewStoryRow> & { key: string }): NewStoryRow {
  return {
    title: partial.title ?? partial.key,
    type: partial.type ?? "story",
    jiraStatus: partial.jiraStatus ?? "TO DO",
    epic: partial.epic ?? null,
    epicKey: partial.epicKey ?? null,
    storyPoints: partial.storyPoints ?? null,
    assignee: partial.assignee ?? null,
    reporter: partial.reporter ?? null,
    sprintName: partial.sprintName ?? null,
    jiraCreatedAt: partial.jiraCreatedAt ?? NOW.toISOString(),
    key: partial.key,
  };
}

function reporter(name: string) {
  return { name, initials: "X", color: "#000" };
}

const ASSIGNMENTS: UserTeamAssignment[] = [
  { displayName: "Alice", teams: ["BT"] },
  { displayName: "Bob", teams: ["BM"] },
  { displayName: "Carol", teams: ["BO", "BT"] },
];

describe("dateBucket", () => {
  it("buckets by calendar-day distance from now", () => {
    expect(dateBucket("2026-06-16T08:00:00Z", NOW)).toBe("today");
    expect(dateBucket("2026-06-15T23:00:00Z", NOW)).toBe("yesterday");
    expect(dateBucket("2026-06-12T10:00:00Z", NOW)).toBe("this_week");
    expect(dateBucket("2026-06-06T10:00:00Z", NOW)).toBe("previous_week");
    expect(dateBucket("2026-06-01T10:00:00Z", NOW)).toBe("older");
  });

  it("treats missing/invalid dates as older", () => {
    expect(dateBucket(null, NOW)).toBe("older");
    expect(dateBucket("not-a-date", NOW)).toBe("older");
  });
});

describe("resolveTeam", () => {
  const map = buildTeamMap(ASSIGNMENTS);

  it("resolves a reporter's single team", () => {
    expect(resolveTeam("Alice", map, "BT")).toBe("BT");
  });

  it("prefers the default team when the reporter is on several", () => {
    expect(resolveTeam("Carol", map, "BT")).toBe("BT");
  });

  it("falls back to the first team when default not among them", () => {
    expect(resolveTeam("Carol", map, "HT")).toBe("BO");
  });

  it("returns unassigned for unknown or missing reporters", () => {
    expect(resolveTeam("Nobody", map, "BT")).toBe("unassigned");
    expect(resolveTeam(null, map, "BT")).toBe("unassigned");
  });
});

describe("groupNewStories", () => {
  it("groups date-only when no default team is set", () => {
    const result = groupNewStories(
      [row({ key: "A-1", reporter: reporter("Alice") })],
      { assignments: ASSIGNMENTS, defaultTeam: null, now: NOW },
    );
    expect(result.grouped).toBe(false);
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].team).toBeNull();
    expect(result.sections[0].dateGroups[0].bucket).toBe("today");
  });

  it("sorts the default team's stories ahead of other teams, unassigned last", () => {
    const rows = [
      row({ key: "BM-1", reporter: reporter("Bob") }),
      row({ key: "UN-1", reporter: reporter("Nobody") }),
      row({ key: "BT-1", reporter: reporter("Alice") }),
    ];
    const result = groupNewStories(rows, {
      assignments: ASSIGNMENTS,
      defaultTeam: "BT",
      now: NOW,
    });
    expect(result.grouped).toBe(true);
    const teams = result.sections.map((s) => s.team);
    expect(teams[0]).toBe("BT");
    expect(teams[teams.length - 1]).toBe("unassigned");
    expect(result.sections[0].isOwnTeam).toBe(true);
    const unassigned = result.sections[result.sections.length - 1];
    expect(unassigned.label).toBe(UNASSIGNED_TEAM_LABEL);
    expect(unassigned.count).toBe(1);
  });

  it("buckets rows by date within a team section", () => {
    const rows = [
      row({ key: "BT-1", reporter: reporter("Alice"), jiraCreatedAt: "2026-06-16T08:00:00Z" }),
      row({ key: "BT-2", reporter: reporter("Alice"), jiraCreatedAt: "2026-06-10T08:00:00Z" }),
    ];
    const result = groupNewStories(rows, {
      assignments: ASSIGNMENTS,
      defaultTeam: "BT",
      now: NOW,
    });
    const bt = result.sections.find((s) => s.team === "BT")!;
    expect(bt.dateGroups.map((g) => g.bucket)).toEqual(["today", "this_week"]);
  });
});

describe("groupInboxStories", () => {
  it("date mode produces the five buckets in order, dropping empties", () => {
    const rows = [
      row({ key: "OLD-1", jiraCreatedAt: "2026-06-01T10:00:00Z" }),
      row({ key: "PREV-1", jiraCreatedAt: "2026-06-06T10:00:00Z" }),
      row({ key: "WEEK-1", jiraCreatedAt: "2026-06-12T10:00:00Z" }),
      row({ key: "YEST-1", jiraCreatedAt: "2026-06-15T10:00:00Z" }),
      row({ key: "TODAY-1", jiraCreatedAt: "2026-06-16T08:00:00Z" }),
    ];
    const groups = groupInboxStories(rows, { groupBy: "date", now: NOW });
    expect(groups.map((g) => g.key)).toEqual([
      "today",
      "yesterday",
      "this_week",
      "previous_week",
      "older",
    ]);
    expect(groups.map((g) => g.label)).toEqual([
      "Today",
      "Yesterday",
      "This week",
      "Previous week",
      "Older",
    ]);

    const sparse = groupInboxStories(
      [row({ key: "TODAY-1", jiraCreatedAt: "2026-06-16T08:00:00Z" }), row({ key: "OLD-1", jiraCreatedAt: "2026-06-01T10:00:00Z" })],
      { groupBy: "date", now: NOW },
    );
    expect(sparse.map((g) => g.key)).toEqual(["today", "older"]);
  });

  it("creator mode buckets by reporter alphabetically with unknown last", () => {
    const rows = [
      row({ key: "Z-1", reporter: reporter("Zoe") }),
      row({ key: "N-1", reporter: null }),
      row({ key: "A-1", reporter: reporter("Alice") }),
      row({ key: "A-2", reporter: reporter("Alice") }),
    ];
    const groups = groupInboxStories(rows, { groupBy: "creator", now: NOW });
    expect(groups.map((g) => g.label)).toEqual(["Alice", "Zoe", "Unknown reporter"]);
    expect(groups[0].rows.map((r) => r.key)).toEqual(["A-1", "A-2"]);
  });

  it("epic mode sorts named epics alphabetically with 'No epic' last", () => {
    const rows = [
      row({ key: "B-1", epic: "Billing" }),
      row({ key: "N-1", epic: null }),
      row({ key: "A-1", epic: "Auth" }),
    ];
    const groups = groupInboxStories(rows, { groupBy: "epic", now: NOW });
    expect(groups.map((g) => g.label)).toEqual(["Auth", "Billing", "No epic"]);
  });

  it("sprint mode sorts sprint names alphabetically with 'No sprint' last", () => {
    const rows = [
      row({ key: "S2-1", sprintName: "BT: Sprint 2" }),
      row({ key: "BL-1", sprintName: null }),
      row({ key: "S1-1", sprintName: "BT: Sprint 1" }),
    ];
    const groups = groupInboxStories(rows, { groupBy: "sprint", now: NOW });
    expect(groups.map((g) => g.label)).toEqual(["BT: Sprint 1", "BT: Sprint 2", "No sprint"]);
  });
});
