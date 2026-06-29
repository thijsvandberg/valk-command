import { describe, it, expect } from "vitest";
import { isNewSinceLastViewed } from "./inbox-last-viewed";

describe("isNewSinceLastViewed (BRDG-434)", () => {
  const baseline = "2026-06-20T12:00:00.000Z";

  it("returns false when there is no baseline (first-ever visit)", () => {
    expect(isNewSinceLastViewed("2026-06-25T00:00:00.000Z", null)).toBe(false);
  });

  it("returns false when the created timestamp is missing", () => {
    expect(isNewSinceLastViewed(null, baseline)).toBe(false);
  });

  it("returns true when created strictly after the baseline", () => {
    expect(isNewSinceLastViewed("2026-06-20T12:00:00.001Z", baseline)).toBe(true);
  });

  it("returns false when created before the baseline", () => {
    expect(isNewSinceLastViewed("2026-06-19T23:59:59.999Z", baseline)).toBe(false);
  });

  it("returns false when created exactly equals the baseline", () => {
    expect(isNewSinceLastViewed(baseline, baseline)).toBe(false);
  });

  it("returns false for an unparseable created timestamp", () => {
    expect(isNewSinceLastViewed("not-a-date", baseline)).toBe(false);
  });

  it("returns false for an unparseable baseline", () => {
    expect(isNewSinceLastViewed("2026-06-25T00:00:00.000Z", "garbage")).toBe(false);
  });
});
