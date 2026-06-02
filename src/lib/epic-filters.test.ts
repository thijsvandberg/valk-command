import { describe, it, expect } from "vitest";
import { mapJiraStatusToBucket } from "./epic-filters";

describe("mapJiraStatusToBucket", () => {
  it("maps DONE-like statuses to done", () => {
    expect(mapJiraStatusToBucket("DONE")).toBe("done");
    expect(mapJiraStatusToBucket("Closed")).toBe("done");
    expect(mapJiraStatusToBucket("resolved")).toBe("done");
  });

  it("maps DEPRECATED to deprecated", () => {
    expect(mapJiraStatusToBucket("DEPRECATED")).toBe("deprecated");
  });

  it("maps in-progress-like statuses to in_progress", () => {
    expect(mapJiraStatusToBucket("IN PROGRESS")).toBe("in_progress");
    expect(mapJiraStatusToBucket("TEST")).toBe("in_progress");
    expect(mapJiraStatusToBucket("In Review")).toBe("in_progress");
  });

  it("defaults TO DO and unknown statuses to open", () => {
    expect(mapJiraStatusToBucket("TO DO")).toBe("open");
    expect(mapJiraStatusToBucket("BACKLOG")).toBe("open");
    expect(mapJiraStatusToBucket("")).toBe("open");
    expect(mapJiraStatusToBucket(null)).toBe("open");
    expect(mapJiraStatusToBucket(undefined)).toBe("open");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(mapJiraStatusToBucket("  done  ")).toBe("done");
    expect(mapJiraStatusToBucket("in progress")).toBe("in_progress");
  });
});
