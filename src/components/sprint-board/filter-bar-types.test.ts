import { describe, it, expect } from "vitest";
import { DEFAULT_VISIBLE, COLUMNS } from "./filter-bar-types";

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
