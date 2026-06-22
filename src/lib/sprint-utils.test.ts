// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  extractTeamPrefix,
  TEAMS,
  slugifySprint,
  sprintToSlug,
  slugToSprintId,
  buildBoardUrl,
  sprintNumber,
  isRegularSprint,
  isBacklogSprintName,
  isOverallRefinementSprint,
  latestRegularSprint,
  nextSprintName,
  nextSprintNameFrom,
  ALL_SPRINT_ID,
  BACKLOG_SPRINT_ID,
} from "./sprint-utils";

describe("extractTeamPrefix", () => {
  it("extracts prefix before colon-space", () => {
    expect(extractTeamPrefix("BO: Sprint 42")).toBe("BO");
    expect(extractTeamPrefix("BM: Sprint 1")).toBe("BM");
    expect(extractTeamPrefix("GXP: Sprint 10")).toBe("GXP");
  });

  it("extracts prefix before space", () => {
    expect(extractTeamPrefix("BT Sprint 3")).toBe("BT");
  });

  it("returns null when no prefix pattern", () => {
    expect(extractTeamPrefix("Sprint 42")).toBeNull();
    expect(extractTeamPrefix("")).toBeNull();
    expect(extractTeamPrefix("lowercase: sprint")).toBeNull();
  });
});

describe("sprintNumber", () => {
  it("extracts the first number after the prefix", () => {
    expect(sprintNumber("BT: 138")).toBe(138);
    expect(sprintNumber("BT: 130 - Align sidebars")).toBe(130);
    expect(sprintNumber("BT 135")).toBe(135);
  });

  it("returns Infinity for non-numeric names", () => {
    expect(sprintNumber("BT: TODO")).toBe(Infinity);
    expect(sprintNumber("Backlog")).toBe(Infinity);
    expect(sprintNumber("")).toBe(Infinity);
  });
});

describe("isRegularSprint", () => {
  it("is true for prefixed numeric sprints", () => {
    expect(isRegularSprint("BT: 138")).toBe(true);
    expect(isRegularSprint("GXP: 5")).toBe(true);
  });

  it("is false for placeholder and prefix-less names", () => {
    expect(isRegularSprint("BT: TODO")).toBe(false);
    expect(isRegularSprint("BT: Backlog")).toBe(false);
    expect(isRegularSprint("Backlog")).toBe(false);
    expect(isRegularSprint("Sprint 42")).toBe(false);
  });
});

describe("isBacklogSprintName", () => {
  it("is true for plain and team-prefixed backlogs", () => {
    expect(isBacklogSprintName("Backlog")).toBe(true);
    expect(isBacklogSprintName("BT: Backlog")).toBe(true);
    expect(isBacklogSprintName("GXP: Backlog")).toBe(true);
    expect(isBacklogSprintName("BO: Backlog")).toBe(true);
    expect(isBacklogSprintName("  HT: Backlog  ")).toBe(true);
    expect(isBacklogSprintName("BM: backlog")).toBe(true);
  });

  it("is false for numeric sprints and other placeholders", () => {
    expect(isBacklogSprintName("BT: 139")).toBe(false);
    expect(isBacklogSprintName("BT: TODO")).toBe(false);
    expect(isBacklogSprintName("Backlog grooming")).toBe(false);
    expect(isBacklogSprintName("Overall refinement")).toBe(false);
    expect(isBacklogSprintName("")).toBe(false);
  });
});

describe("isOverallRefinementSprint", () => {
  it("matches the overall refinement bucket regardless of prefix/case", () => {
    expect(isOverallRefinementSprint("Overall refinement")).toBe(true);
    expect(isOverallRefinementSprint("BT: Overall Refinement")).toBe(true);
    expect(isOverallRefinementSprint("overall refinement")).toBe(true);
  });

  it("is false for normal sprints and backlogs", () => {
    expect(isOverallRefinementSprint("BT: 140")).toBe(false);
    expect(isOverallRefinementSprint("BT: Backlog")).toBe(false);
    expect(isOverallRefinementSprint("Refinement")).toBe(false);
  });
});

describe("latestRegularSprint", () => {
  it("returns the highest-numbered regular sprint with its prefix and sprint", () => {
    const sprints = [
      { name: "BT: 138", endDate: "2026-05-21T17:00:00.000Z" },
      { name: "BT: 139", endDate: "2026-06-04T17:00:00.000Z" },
    ];
    const latest = latestRegularSprint(sprints);
    expect(latest).toMatchObject({ prefix: "BT", number: 139 });
    expect(latest?.sprint.endDate).toBe("2026-06-04T17:00:00.000Z");
  });

  it("ignores placeholder and unscheduled groups", () => {
    const sprints = [
      { name: "BT: 139" },
      { name: "BT: TODO" },
      { name: "GXP: Backlog" },
      { name: "Backlog" },
    ];
    expect(latestRegularSprint(sprints)).toMatchObject({ prefix: "BT", number: 139 });
  });

  it("takes the prefix from the data rather than hardcoding it", () => {
    expect(latestRegularSprint([{ name: "GXP: 7" }])).toMatchObject({ prefix: "GXP", number: 7 });
  });

  it("returns null when no regular sprint exists", () => {
    expect(latestRegularSprint([])).toBeNull();
    expect(latestRegularSprint([{ name: "Backlog" }, { name: "BT: TODO" }])).toBeNull();
  });
});

describe("nextSprintName", () => {
  it("suggests the next number in the series", () => {
    expect(nextSprintName([{ name: "BT: 138" }, { name: "BT: 139" }])).toBe("BT: 140");
  });

  it("uses the highest-numbered prefix when prefixes differ", () => {
    expect(nextSprintName([{ name: "BT: 139" }, { name: "GXP: 200" }])).toBe("GXP: 201");
  });

  it("returns an empty string when no regular sprint exists", () => {
    expect(nextSprintName([])).toBe("");
    expect(nextSprintName([{ name: "Backlog" }])).toBe("");
  });
});

describe("nextSprintNameFrom", () => {
  it("increments the number relative to the given sprint", () => {
    expect(nextSprintNameFrom("BT: 139")).toBe("BT: 140");
    expect(nextSprintNameFrom("GXP: 7")).toBe("GXP: 8");
  });

  it("uses the first numeric token and drops any goal suffix", () => {
    expect(nextSprintNameFrom("BT: 130 - Align sidebars")).toBe("BT: 131");
  });

  it("returns an empty string for non-regular sprints", () => {
    expect(nextSprintNameFrom("BT: Backlog")).toBe("");
    expect(nextSprintNameFrom("BT: TODO")).toBe("");
    expect(nextSprintNameFrom("Backlog")).toBe("");
    expect(nextSprintNameFrom("Sprint 42")).toBe("");
    expect(nextSprintNameFrom("")).toBe("");
  });
});

describe("TEAMS constant", () => {
  it("contains expected team codes", () => {
    expect(TEAMS).toContain("BO");
    expect(TEAMS).toContain("BM");
    expect(TEAMS).toContain("BT");
    expect(TEAMS).toContain("GXP");
  });
});

describe("slugifySprint", () => {
  it("lowercases and replaces non-alphanumeric runs with single hyphens", () => {
    expect(slugifySprint("BT: 134")).toBe("bt-134");
    expect(slugifySprint("BT Sprint 135")).toBe("bt-sprint-135");
    expect(slugifySprint("GXP:  Sprint   10")).toBe("gxp-sprint-10");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugifySprint("  Sprint 42  ")).toBe("sprint-42");
    expect(slugifySprint("!!!")).toBe("");
  });
});

const SPRINTS = [
  { id: "10048", name: "BT: 134", state: "active" },
  { id: "10050", name: "BT Sprint 135", state: "future" },
];

describe("sprintToSlug", () => {
  it("maps reserved ids to reserved slugs", () => {
    expect(sprintToSlug(ALL_SPRINT_ID, SPRINTS)).toBe("all");
    expect(sprintToSlug(BACKLOG_SPRINT_ID, SPRINTS)).toBe("backlog");
  });

  it("slugifies a known sprint name", () => {
    expect(sprintToSlug("10048", SPRINTS)).toBe("bt-134");
  });

  it("falls back to the id for an unknown sprint", () => {
    expect(sprintToSlug("99999", SPRINTS)).toBe("99999");
  });

  it("disambiguates colliding slugs with the numeric id", () => {
    const collide = [
      { id: "1", name: "BT: 134", state: "active" },
      { id: "2", name: "BT 134", state: "closed" },
    ];
    expect(sprintToSlug("1", collide)).toBe("bt-134-1");
    expect(sprintToSlug("2", collide)).toBe("bt-134-2");
  });
});

describe("slugToSprintId", () => {
  it("maps reserved slugs back to reserved ids", () => {
    expect(slugToSprintId("all", SPRINTS)).toBe(ALL_SPRINT_ID);
    expect(slugToSprintId("backlog", SPRINTS)).toBe(BACKLOG_SPRINT_ID);
  });

  it("round-trips a known sprint", () => {
    const slug = sprintToSlug("10048", SPRINTS);
    expect(slugToSprintId(slug, SPRINTS)).toBe("10048");
  });

  it("returns null for an unknown slug", () => {
    expect(slugToSprintId("does-not-exist", SPRINTS)).toBeNull();
    expect(slugToSprintId(undefined, SPRINTS)).toBeNull();
  });

  it("resolves the disambiguated form via the trailing id", () => {
    const collide = [
      { id: "1", name: "BT: 134", state: "active" },
      { id: "2", name: "BT 134", state: "closed" },
    ];
    expect(slugToSprintId("bt-134-2", collide)).toBe("2");
  });

  it("prefers the active sprint when a bare slug is ambiguous", () => {
    const collide = [
      { id: "1", name: "BT: 134", state: "closed" },
      { id: "2", name: "BT 134", state: "active" },
    ];
    expect(slugToSprintId("bt-134", collide)).toBe("2");
  });
});

describe("buildBoardUrl", () => {
  it("builds the base path when no sprint is given", () => {
    expect(buildBoardUrl(null, null)).toBe("/sprint-board");
  });

  it("appends sprint and ticket segments", () => {
    expect(buildBoardUrl("bt-134", null)).toBe("/sprint-board/bt-134");
    expect(buildBoardUrl("bt-134", "VPL-1234")).toBe("/sprint-board/bt-134/VPL-1234");
  });

  it("threads query params through", () => {
    const params = new URLSearchParams({ view: "abc" });
    expect(buildBoardUrl("all", "VPL-1234", params)).toBe("/sprint-board/all/VPL-1234?view=abc");
  });

  it("does not append a ticket without a sprint", () => {
    expect(buildBoardUrl(null, "VPL-1234")).toBe("/sprint-board");
  });
});
