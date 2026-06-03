// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  extractTeamPrefix,
  TEAMS,
  slugifySprint,
  sprintToSlug,
  slugToSprintId,
  buildBoardUrl,
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
