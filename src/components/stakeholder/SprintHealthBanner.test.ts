import { describe, it, expect } from "vitest";
import { computeSprintHealth } from "./SprintHealthBanner";

describe("computeSprintHealth", () => {
  it("returns at-risk when 0 points done and 2 or fewer days remain", () => {
    expect(computeSprintHealth(0, 20, 2, 10).level).toBe("at-risk");
    expect(computeSprintHealth(0, 20, 1, 10).level).toBe("at-risk");
    expect(computeSprintHealth(0, 20, 0, 10).level).toBe("at-risk");
  });

  it("at-risk message includes day count", () => {
    const result = computeSprintHealth(0, 20, 2, 10);
    expect(result.message).toContain("2 days");
  });

  it("does not return at-risk when some points are done", () => {
    expect(computeSprintHealth(1, 20, 2, 10).level).not.toBe("at-risk");
  });

  it("returns on-track when 80%+ of points are done", () => {
    expect(computeSprintHealth(16, 20, 3, 10).level).toBe("on-track");
    expect(computeSprintHealth(20, 20, 0, 10).level).toBe("on-track");
  });

  it("returns behind when < 25% done and past halfway", () => {
    // 10 total days, 4 remaining → past halfway (threshold = 5)
    expect(computeSprintHealth(2, 20, 4, 10).level).toBe("behind");
  });

  it("does not return behind before halfway", () => {
    // 10 total days, 6 remaining → before halfway
    expect(computeSprintHealth(2, 20, 6, 10).level).not.toBe("behind");
  });

  it("returns in-progress for healthy mid-sprint state", () => {
    expect(computeSprintHealth(8, 20, 5, 10).level).toBe("in-progress");
  });

  it("returns in-progress when workingDaysRemaining is null", () => {
    expect(computeSprintHealth(8, 20, null, null).level).toBe("in-progress");
  });

  it("returns in-progress when no points at all", () => {
    expect(computeSprintHealth(0, 0, 5, 10).level).toBe("in-progress");
  });
});
