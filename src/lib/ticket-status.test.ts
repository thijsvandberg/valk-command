import { describe, it, expect } from "vitest";
import { FINISHED_STATUSES, isFinishedStatus, IN_FLIGHT_STATUSES, isInFlightStatus, EXCLUDED_SCAN_TYPES, isScannableType } from "./ticket-status";

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

describe("IN_FLIGHT_STATUSES", () => {
  it("contains exactly IN PROGRESS and TEST", () => {
    expect(IN_FLIGHT_STATUSES).toContain("IN PROGRESS");
    expect(IN_FLIGHT_STATUSES).toContain("TEST");
    expect(IN_FLIGHT_STATUSES).not.toContain("TO DO");
    expect(IN_FLIGHT_STATUSES).not.toContain("DONE");
  });
});

describe("isInFlightStatus", () => {
  it("returns true for IN PROGRESS and TEST (exact uppercase)", () => {
    expect(isInFlightStatus("IN PROGRESS")).toBe(true);
    expect(isInFlightStatus("TEST")).toBe(true);
  });

  it("returns true for case-insensitive variants", () => {
    expect(isInFlightStatus("in progress")).toBe(true);
    expect(isInFlightStatus("In Progress")).toBe(true);
    expect(isInFlightStatus("test")).toBe(true);
    expect(isInFlightStatus("  Test  ")).toBe(true);
  });

  it("returns false for not-yet-started and finished statuses", () => {
    expect(isInFlightStatus("TO DO")).toBe(false);
    expect(isInFlightStatus("DONE")).toBe(false);
    expect(isInFlightStatus("DEPRECATED")).toBe(false);
  });

  it("returns false for null, undefined and empty string", () => {
    expect(isInFlightStatus(null)).toBe(false);
    expect(isInFlightStatus(undefined)).toBe(false);
    expect(isInFlightStatus("")).toBe(false);
  });
});

describe("EXCLUDED_SCAN_TYPES", () => {
  it("contains exactly 'subtask'", () => {
    expect(EXCLUDED_SCAN_TYPES).toContain("subtask");
    // Only subtask is excluded; all other parent-level types must NOT be in this list.
    expect(EXCLUDED_SCAN_TYPES).not.toContain("story");
    expect(EXCLUDED_SCAN_TYPES).not.toContain("task");
    expect(EXCLUDED_SCAN_TYPES).not.toContain("bug");
    expect(EXCLUDED_SCAN_TYPES).not.toContain("spike");
    expect(EXCLUDED_SCAN_TYPES).not.toContain("epic");
  });
});

describe("isScannableType", () => {
  it("returns false for 'subtask' (exact lowercase)", () => {
    expect(isScannableType("subtask")).toBe(false);
  });

  it("returns false for 'subtask' regardless of case", () => {
    // After normalizeIssueType() the stored value is always "subtask" (lowercase);
    // the case-insensitive check is defensive for any caller that bypasses normalization.
    expect(isScannableType("Subtask")).toBe(false);
    expect(isScannableType("SUBTASK")).toBe(false);
    // "Sub-task" is the raw Jira label; normalizeIssueType already converts it to
    // "subtask" before storage, so we don't test it here — isScannableType only
    // sees post-normalized values in production.
  });

  it("returns true for all parent-level work item types", () => {
    expect(isScannableType("story")).toBe(true);
    expect(isScannableType("task")).toBe(true);
    expect(isScannableType("bug")).toBe(true);
    expect(isScannableType("spike")).toBe(true);
    expect(isScannableType("epic")).toBe(true);
  });

  it("returns true for null and undefined (unknown types are included)", () => {
    expect(isScannableType(null)).toBe(true);
    expect(isScannableType(undefined)).toBe(true);
  });

  it("returns true for empty string (unknown types are included)", () => {
    expect(isScannableType("")).toBe(true);
  });
});
