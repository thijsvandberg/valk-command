import { describe, it, expect } from "vitest";
import { extractTeamPrefix, TEAMS } from "./sprint-utils";

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
