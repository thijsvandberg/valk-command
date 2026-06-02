import { describe, it, expect } from "vitest";
import {
  categorizeStatus,
  selectRecentSprintIds,
  progressPercent,
  epicProgress,
} from "./epic-progress";

describe("categorizeStatus", () => {
  it("maps DONE to done", () => {
    expect(categorizeStatus("DONE")).toBe("done");
  });

  it("maps IN PROGRESS and TEST to in-progress", () => {
    expect(categorizeStatus("IN PROGRESS")).toBe("in-progress");
    expect(categorizeStatus("TEST")).toBe("in-progress");
  });

  it("excludes deprecated and draft pipeline states", () => {
    expect(categorizeStatus("DEPRECATED")).toBe("excluded");
    expect(categorizeStatus("DRAFTING")).toBe("excluded");
    expect(categorizeStatus("REPLACED")).toBe("excluded");
    expect(categorizeStatus("DRAFT_FAILED")).toBe("excluded");
  });

  it("treats everything else (incl. TO DO and unknown) as todo", () => {
    expect(categorizeStatus("TO DO")).toBe("todo");
    expect(categorizeStatus("SOMETHING NEW")).toBe("todo");
  });

  it("is case-insensitive and handles null/undefined", () => {
    expect(categorizeStatus("done")).toBe("done");
    expect(categorizeStatus(null)).toBe("todo");
    expect(categorizeStatus(undefined)).toBe("todo");
  });
});

describe("selectRecentSprintIds", () => {
  const sprints = [
    { id: 1, state: "closed", startDate: "2026-01-01", endDate: "2026-01-14" },
    { id: 2, state: "closed", startDate: "2026-01-15", endDate: "2026-01-28" },
    { id: 3, state: "closed", startDate: "2026-01-29", endDate: "2026-02-11" },
    { id: 4, state: "active", startDate: "2026-02-12", endDate: "2026-02-25" },
    { id: 5, state: "future", startDate: "2026-02-26", endDate: "2026-03-11" },
  ];

  it("returns the active sprint plus the 2 most recent closed, chronologically", () => {
    expect(selectRecentSprintIds(sprints, 3)).toEqual(["2", "3", "4"]);
  });

  it("excludes future sprints", () => {
    expect(selectRecentSprintIds(sprints, 3)).not.toContain("5");
  });

  it("respects a custom limit", () => {
    expect(selectRecentSprintIds(sprints, 5)).toEqual(["1", "2", "3", "4"]);
  });

  it("handles no active sprint", () => {
    const closedOnly = sprints.filter((s) => s.state === "closed");
    expect(selectRecentSprintIds(closedOnly, 2)).toEqual(["2", "3"]);
  });

  it("returns empty for no sprints", () => {
    expect(selectRecentSprintIds([], 3)).toEqual([]);
  });
});

describe("progressPercent", () => {
  it("rounds the ratio", () => {
    expect(progressPercent(1, 3)).toBe(33);
    expect(progressPercent(2, 3)).toBe(67);
  });

  it("returns 0 for a zero or negative denominator", () => {
    expect(progressPercent(5, 0)).toBe(0);
    expect(progressPercent(0, 0)).toBe(0);
  });
});

describe("epicProgress", () => {
  it("uses points when the epic has estimated points", () => {
    const r = epicProgress({ totalTickets: 4, completedTickets: 1, totalPoints: 10, completedPoints: 5 });
    expect(r).toEqual({ percent: 50, pointsBased: true });
  });

  it("falls back to ticket count when there are no points", () => {
    const r = epicProgress({ totalTickets: 4, completedTickets: 3, totalPoints: 0, completedPoints: 0 });
    expect(r).toEqual({ percent: 75, pointsBased: false });
  });

  it("returns 0% pointsBased=false for an empty epic", () => {
    const r = epicProgress({ totalTickets: 0, completedTickets: 0, totalPoints: 0, completedPoints: 0 });
    expect(r).toEqual({ percent: 0, pointsBased: false });
  });
});
