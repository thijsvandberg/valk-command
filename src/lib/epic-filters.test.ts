import { describe, it, expect } from "vitest";
import { normalizeEpicStatus } from "./epic-filters";

describe("normalizeEpicStatus", () => {
  it("maps DONE-like statuses to DONE", () => {
    expect(normalizeEpicStatus("DONE")).toBe("DONE");
    expect(normalizeEpicStatus("Closed")).toBe("DONE");
    expect(normalizeEpicStatus("resolved")).toBe("DONE");
  });

  it("maps DEPRECATED", () => {
    expect(normalizeEpicStatus("DEPRECATED")).toBe("DEPRECATED");
  });

  it("keeps TEST distinct from IN PROGRESS", () => {
    expect(normalizeEpicStatus("TEST")).toBe("TEST");
    expect(normalizeEpicStatus("IN PROGRESS")).toBe("IN PROGRESS");
    expect(normalizeEpicStatus("In Review")).toBe("IN PROGRESS");
  });

  it("defaults TO DO and unknown statuses to TO DO", () => {
    expect(normalizeEpicStatus("TO DO")).toBe("TO DO");
    expect(normalizeEpicStatus("BACKLOG")).toBe("TO DO");
    expect(normalizeEpicStatus("")).toBe("TO DO");
    expect(normalizeEpicStatus(null)).toBe("TO DO");
    expect(normalizeEpicStatus(undefined)).toBe("TO DO");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(normalizeEpicStatus("  done  ")).toBe("DONE");
    expect(normalizeEpicStatus("in progress")).toBe("IN PROGRESS");
  });
});
