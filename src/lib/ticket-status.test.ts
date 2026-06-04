import { describe, it, expect } from "vitest";
import { FINISHED_STATUSES, isFinishedStatus } from "./ticket-status";

describe("FINISHED_STATUSES", () => {
  it("includes DONE and DEPRECATED", () => {
    expect(FINISHED_STATUSES).toContain("DONE");
    expect(FINISHED_STATUSES).toContain("DEPRECATED");
  });

  it("includes defensive entries for unmapped Jira statuses", () => {
    expect(FINISHED_STATUSES).toContain("CANCELLED");
    expect(FINISHED_STATUSES).toContain("WON'T DO");
  });
});

describe("isFinishedStatus", () => {
  it("returns true for DONE (exact uppercase)", () => {
    expect(isFinishedStatus("DONE")).toBe(true);
  });

  it("returns true for DEPRECATED (exact uppercase)", () => {
    expect(isFinishedStatus("DEPRECATED")).toBe(true);
  });

  it("returns true for case-insensitive variants", () => {
    expect(isFinishedStatus("done")).toBe(true);
    expect(isFinishedStatus("Done")).toBe(true);
    expect(isFinishedStatus("deprecated")).toBe(true);
    expect(isFinishedStatus("Deprecated")).toBe(true);
    expect(isFinishedStatus("cancelled")).toBe(true);
    expect(isFinishedStatus("Cancelled")).toBe(true);
  });

  it("returns false for active/open statuses", () => {
    expect(isFinishedStatus("TO DO")).toBe(false);
    expect(isFinishedStatus("IN PROGRESS")).toBe(false);
    expect(isFinishedStatus("TEST")).toBe(false);
    expect(isFinishedStatus("BACKLOG")).toBe(false);
  });

  it("returns false for null and undefined", () => {
    expect(isFinishedStatus(null)).toBe(false);
    expect(isFinishedStatus(undefined)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isFinishedStatus("")).toBe(false);
  });
});
