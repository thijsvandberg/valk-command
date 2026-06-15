import { describe, it, expect } from "vitest";
import { DEFAULT_VISIBLE, COLUMNS, cycleMetricSort, DEFAULT_SORT } from "./filter-bar-types";

describe("cycleMetricSort", () => {
  it("first click on an inactive metric sorts it descending", () => {
    expect(cycleMetricSort(DEFAULT_SORT, "points")).toEqual({ field: "points", direction: "desc" });
  });

  it("second click on the active metric clears back to the default rank order", () => {
    expect(cycleMetricSort({ field: "points", direction: "desc" }, "points")).toEqual(DEFAULT_SORT);
  });

  it("switching to a different metric jumps straight to its descending sort", () => {
    expect(cycleMetricSort({ field: "points", direction: "desc" }, "bv")).toEqual({ field: "bv", direction: "desc" });
  });

  it("starts a fresh descending sort from a non-metric sort like title", () => {
    expect(cycleMetricSort({ field: "title", direction: "asc" }, "bv")).toEqual({ field: "bv", direction: "desc" });
  });
});

describe("sprint-board column defaults", () => {
  // Pipeline health/deploy badges moved into the ticket hover card (BRDG-251),
  // so the column is hidden by default but still toggleable.
  it("hides the pipeline column by default", () => {
    expect(DEFAULT_VISIBLE).not.toContain("pipeline");
  });

  it("still offers the pipeline column via the toggle", () => {
    expect(COLUMNS.some((c) => c.id === "pipeline")).toBe(true);
  });
});
