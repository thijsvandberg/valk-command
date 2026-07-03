// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  formatSprintListDate,
  sprintDateRange,
  sprintStateColor,
  sprintStateLabel,
  sortSprintsByState,
  sortSprintsByEndDateDesc,
  sortSprintsForMove,
  filterSprintsByTeam,
  searchSprints,
  getTeamOptions,
  getMoveDestinations,
  getPinnedSection,
  getActiveFutureSection,
  getClosedSection,
  getHiddenSection,
  type SprintListEntry,
} from "./sprint-list";

function sprint(overrides: Partial<SprintListEntry> & { id: string | number; name: string }): SprintListEntry {
  return { state: "future", startDate: null, endDate: null, ...overrides };
}

const FIXTURE: SprintListEntry[] = [
  sprint({ id: 1, name: "BT: 140", state: "active", startDate: "2026-06-22", endDate: "2026-07-05" }),
  sprint({ id: 2, name: "BT: 141", state: "future" }),
  sprint({ id: 3, name: "BT: 139", state: "closed", endDate: "2026-06-21" }),
  sprint({ id: 4, name: "BT: 138", state: "closed", endDate: "2026-06-07" }),
  sprint({ id: 5, name: "GXP: 12", state: "active", startDate: "2026-06-24", endDate: "2026-07-07" }),
  sprint({ id: 6, name: "GXP: 11", state: "closed", endDate: "2026-06-23", hidden: true }),
  sprint({ id: 7, name: "BT: Backlog", state: "future" }),
  sprint({ id: 8, name: "Overall refinement", state: "future" }),
];

describe("formatSprintListDate", () => {
  it("formats an ISO date as day + short month", () => {
    expect(formatSprintListDate("2026-06-22")).toBe("22 Jun");
  });

  it("returns empty for null/undefined/invalid", () => {
    expect(formatSprintListDate(null)).toBe("");
    expect(formatSprintListDate(undefined)).toBe("");
    expect(formatSprintListDate("not-a-date")).toBe("");
  });
});

describe("sprintDateRange", () => {
  it("joins start and end", () => {
    expect(sprintDateRange({ startDate: "2026-06-22", endDate: "2026-07-05" })).toBe("22 Jun - 5 Jul");
  });

  it("shows only the start when the end is missing", () => {
    expect(sprintDateRange({ startDate: "2026-06-22", endDate: null })).toBe("From 22 Jun");
  });

  it("is empty without dates", () => {
    expect(sprintDateRange({ startDate: null, endDate: null })).toBe("");
  });
});

describe("state color/label", () => {
  it("maps the three states", () => {
    expect(sprintStateLabel("active")).toBe("Active");
    expect(sprintStateLabel("future")).toBe("Future");
    expect(sprintStateLabel("closed")).toBe("Closed");
    expect(sprintStateColor("active")).toContain("success");
    expect(sprintStateColor("future")).toContain("info");
    expect(sprintStateColor("closed")).toContain("muted");
  });
});

describe("sortSprintsByState", () => {
  it("orders active before future before closed", () => {
    const sorted = sortSprintsByState(FIXTURE);
    const states = sorted.map((s) => s.state);
    expect(states.indexOf("active")).toBeLessThan(states.indexOf("future"));
    expect(states.lastIndexOf("future")).toBeLessThan(states.indexOf("closed"));
  });

  it("orders active sprints by start date ascending", () => {
    const sorted = sortSprintsByState(FIXTURE);
    const actives = sorted.filter((s) => s.state === "active").map((s) => s.name);
    expect(actives).toEqual(["BT: 140", "GXP: 12"]);
  });

  it("does not mutate the input", () => {
    const input = [...FIXTURE];
    sortSprintsByState(input);
    expect(input).toEqual(FIXTURE);
  });
});

describe("sortSprintsByEndDateDesc", () => {
  it("puts the most recently ended sprint first", () => {
    const closed = FIXTURE.filter((s) => s.state === "closed");
    const sorted = sortSprintsByEndDateDesc(closed);
    expect(sorted.map((s) => s.name)).toEqual(["GXP: 11", "BT: 139", "BT: 138"]);
  });
});

describe("sortSprintsForMove", () => {
  it("groups by team, ascending by sprint number", () => {
    const list = [
      sprint({ id: 1, name: "GXP: 12" }),
      sprint({ id: 2, name: "BT: 141" }),
      sprint({ id: 3, name: "BT: 140" }),
    ];
    expect(sortSprintsForMove(list).map((s) => s.name)).toEqual(["BT: 140", "BT: 141", "GXP: 12"]);
  });

  it("puts pinned sprints first, in slot order", () => {
    const list = [
      sprint({ id: 1, name: "BT: 140" }),
      sprint({ id: 2, name: "BT: 141" }),
      sprint({ id: 3, name: "GXP: 12" }),
    ];
    expect(sortSprintsForMove(list, ["3", "2"]).map((s) => s.name)).toEqual(["GXP: 12", "BT: 141", "BT: 140"]);
  });

  it("sorts non-numbered names last within their team", () => {
    const list = [
      sprint({ id: 1, name: "BT: TODO" }),
      sprint({ id: 2, name: "BT: 141" }),
    ];
    expect(sortSprintsForMove(list).map((s) => s.name)).toEqual(["BT: 141", "BT: TODO"]);
  });
});

describe("filterSprintsByTeam", () => {
  it("keeps only the given team's sprints", () => {
    const filtered = filterSprintsByTeam(FIXTURE, "GXP");
    expect(filtered.every((s) => s.name.startsWith("GXP"))).toBe(true);
    expect(filtered).toHaveLength(2);
  });

  it("passes everything through when team is null", () => {
    expect(filterSprintsByTeam(FIXTURE, null)).toHaveLength(FIXTURE.length);
  });
});

describe("searchSprints", () => {
  it("matches case-insensitively on the name", () => {
    expect(searchSprints(FIXTURE, "gxp").map((s) => s.name)).toEqual(["GXP: 12", "GXP: 11"]);
  });

  it("returns state-sorted results", () => {
    const results = searchSprints(FIXTURE, "bt: 1");
    expect(results[0].name).toBe("BT: 140");
  });
});

describe("getTeamOptions", () => {
  it("collects visible team prefixes, sorted", () => {
    expect(getTeamOptions(FIXTURE)).toEqual(["BT", "GXP"]);
  });

  it("skips hidden sprints", () => {
    const onlyHidden = [sprint({ id: 1, name: "HT: 5", hidden: true })];
    expect(getTeamOptions(onlyHidden)).toEqual([]);
  });
});

describe("getMoveDestinations", () => {
  it("keeps only active/future sprints, dropping backlogs and overall refinement", () => {
    const names = getMoveDestinations(FIXTURE).map((s) => s.name);
    expect(names).toEqual(["BT: 140", "BT: 141", "GXP: 12"]);
  });

  it("drops excluded ids", () => {
    const names = getMoveDestinations(FIXTURE, new Set(["1"])).map((s) => s.name);
    expect(names).toEqual(["BT: 141", "GXP: 12"]);
  });

  it("leads with pinned slot order", () => {
    const names = getMoveDestinations(FIXTURE, new Set(), ["5"]).map((s) => s.name);
    expect(names[0]).toBe("GXP: 12");
  });
});

describe("sections", () => {
  const pinned = new Set(["1"]);

  it("pinned section contains exactly the pinned ids", () => {
    expect(getPinnedSection(FIXTURE, pinned).map((s) => s.name)).toEqual(["BT: 140"]);
  });

  it("active & future excludes hidden and pinned sprints", () => {
    const names = getActiveFutureSection(FIXTURE, pinned).map((s) => s.name);
    expect(names).toContain("GXP: 12");
    expect(names).not.toContain("BT: 140"); // pinned
    expect(names).not.toContain("GXP: 11"); // hidden
    expect(names).not.toContain("BT: 139"); // closed
  });

  it("closed section shows everything when unbounded, most recent first", () => {
    const names = getClosedSection(FIXTURE, pinned).map((s) => s.name);
    expect(names).toEqual(["BT: 139", "BT: 138"]);
  });

  it("closed section respects an explicit limit", () => {
    expect(getClosedSection(FIXTURE, pinned, 1).map((s) => s.name)).toEqual(["BT: 139"]);
  });

  it("hidden section shows hidden sprints regardless of state", () => {
    expect(getHiddenSection(FIXTURE).map((s) => s.name)).toEqual(["GXP: 11"]);
  });
});
