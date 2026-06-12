import { describe, it, expect } from "vitest";
import { sessionLabel, formatSessionDate, compareSessions } from "./refinement-utils";

describe("formatSessionDate", () => {
  it("formats a YYYY-MM-DD date as a readable label", () => {
    expect(formatSessionDate("2026-06-18")).toBe("18 Jun 2026");
  });

  it("returns the raw value when it is not a parseable date", () => {
    expect(formatSessionDate("not-a-date")).toBe("not-a-date");
  });
});

describe("sessionLabel", () => {
  it("combines date and name when both are set", () => {
    expect(sessionLabel({ name: "Sprint 44", scheduledFor: "2026-06-18" })).toBe(
      "18 Jun 2026 - Sprint 44",
    );
  });

  it("returns just the date when name is empty", () => {
    expect(sessionLabel({ name: null, scheduledFor: "2026-06-18" })).toBe("18 Jun 2026");
    expect(sessionLabel({ name: "  ", scheduledFor: "2026-06-18" })).toBe("18 Jun 2026");
  });

  it("returns just the name when no date is set", () => {
    expect(sessionLabel({ name: "Sprint 44" })).toBe("Sprint 44");
    expect(sessionLabel({ name: "Sprint 44", scheduledFor: null })).toBe("Sprint 44");
  });

  it("falls back to a generic label when both are empty", () => {
    expect(sessionLabel({ name: null, scheduledFor: null })).toBe("Untitled session");
  });
});

describe("compareSessions", () => {
  const dated = (scheduledFor: string, createdAt = "2026-01-01") => ({ scheduledFor, createdAt });
  const undated = (createdAt: string) => ({ scheduledFor: null, createdAt });

  it("sorts scheduled sessions before undated ones", () => {
    const list = [undated("2026-06-01"), dated("2026-06-20")];
    list.sort(compareSessions);
    expect(list[0].scheduledFor).toBe("2026-06-20");
  });

  it("sorts scheduled sessions ascending by date", () => {
    const list = [dated("2026-07-01"), dated("2026-06-18"), dated("2026-06-25")];
    list.sort(compareSessions);
    expect(list.map((s) => s.scheduledFor)).toEqual([
      "2026-06-18",
      "2026-06-25",
      "2026-07-01",
    ]);
  });

  it("sorts undated sessions by newest created first", () => {
    const list = [undated("2026-06-01"), undated("2026-06-10"), undated("2026-06-05")];
    list.sort(compareSessions);
    expect(list.map((s) => s.createdAt)).toEqual([
      "2026-06-10",
      "2026-06-05",
      "2026-06-01",
    ]);
  });
});
