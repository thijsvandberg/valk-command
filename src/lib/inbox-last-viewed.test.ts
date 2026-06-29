import { describe, it, expect } from "vitest";
import { isNewSinceLastViewed } from "./inbox-last-viewed";

describe("isNewSinceLastViewed (BRDG-434 / BRDG-438 shared predicate)", () => {
  const baseline = "2026-06-20T12:00:00.000Z";

  it("treats everything as new when there is no baseline (never triaged)", () => {
    expect(isNewSinceLastViewed("2026-06-25T00:00:00.000Z", null)).toBe(true);
  });

  it("treats a missing created timestamp as new (never silently dropped)", () => {
    expect(isNewSinceLastViewed(null, baseline)).toBe(true);
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

  it("normalizes a SQLite space-separated baseline as UTC (matches the digest)", () => {
    // "2026-06-20 12:00:00" must read as UTC, equal to the ISO baseline above.
    expect(isNewSinceLastViewed("2026-06-20T12:00:00.001Z", "2026-06-20 12:00:00")).toBe(true);
    expect(isNewSinceLastViewed("2026-06-20T11:59:59.000Z", "2026-06-20 12:00:00")).toBe(false);
  });

  it("treats an unparseable created timestamp as new", () => {
    expect(isNewSinceLastViewed("not-a-date", baseline)).toBe(true);
  });

  it("treats an unparseable baseline as no baseline (everything new)", () => {
    expect(isNewSinceLastViewed("2026-06-25T00:00:00.000Z", "garbage")).toBe(true);
  });
});
