// @vitest-environment node
import { describe, it, expect } from "vitest";
import { parseScanScoresRaw, parseScanScores, cleanupRowToTicket } from "./cleanup-types";
import type { CleanupRow } from "./cleanup-types";

describe("parseScanScoresRaw", () => {
  it("returns the parsed object for valid JSON", () => {
    const raw = JSON.stringify({ staleness: { score: 0.8 }, replaced: { score: 0.2 } });
    expect(parseScanScoresRaw(raw)).toEqual({
      staleness: { score: 0.8 },
      replaced: { score: 0.2 },
    });
  });

  it("returns an empty object for null/undefined/empty input", () => {
    expect(parseScanScoresRaw(null)).toEqual({});
    expect(parseScanScoresRaw(undefined)).toEqual({});
    expect(parseScanScoresRaw("")).toEqual({});
  });

  it("returns an empty object for corrupt JSON instead of throwing", () => {
    expect(() => parseScanScoresRaw("{not valid")).not.toThrow();
    expect(parseScanScoresRaw("{not valid")).toEqual({});
  });

  it("returns an empty object for non-object JSON payloads", () => {
    expect(parseScanScoresRaw("42")).toEqual({});
    expect(parseScanScoresRaw('"a string"')).toEqual({});
    expect(parseScanScoresRaw("null")).toEqual({});
  });
});

describe("parseScanScores (narrowed map, built on the raw parser)", () => {
  it("keeps numeric per-topic scores and ignores malformed entries", () => {
    const raw = JSON.stringify({ staleness: { score: 0.5 }, replaced: { notScore: 1 } });
    const out = parseScanScores(raw);
    expect(out.staleness).toBe(0.5);
    expect(out.replaced).toBeUndefined();
  });

  it("degrades to an empty map on corrupt JSON", () => {
    expect(parseScanScores("{broken")).toEqual({});
  });
});

describe("cleanupRowToTicket (BRDG-389 BoardRow adapter)", () => {
  function makeRow(overrides: Partial<CleanupRow> = {}): CleanupRow {
    return {
      key: "BT-1",
      title: "Ancient ticket",
      status: "TO DO",
      type: "bug",
      epic: "Upsell",
      epicKey: "BT-100",
      storyPoints: 3,
      sprintName: "BT: 138",
      openSubtaskCount: 1,
      totalSubtaskCount: 4,
      epicChildCount: 0,
      assignee: { name: "Alice", initials: "AL", color: "#abc" },
      reporter: { name: "Carol", initials: "CA", color: "#def" },
      jiraUpdatedAt: "2026-06-01T00:00:00Z",
      lastScannedAt: "2026-06-02T00:00:00Z",
      lastDeepScannedAt: null,
      scanRationale: null,
      topicScores: {},
      scanOverall: 0.82,
      disposition: "candidate",
      revivalScore: null,
      revivalRationale: null,
      ...overrides,
    };
  }

  it("projects the row's identity, type, epic, status, points and people", () => {
    const t = cleanupRowToTicket(makeRow());
    expect(t.key).toBe("BT-1");
    expect(t.title).toBe("Ancient ticket");
    expect(t.type).toBe("bug");
    expect(t.epic).toBe("Upsell");
    expect(t.epicKey).toBe("BT-100");
    expect(t.jiraStatus).toBe("TO DO");
    expect(t.storyPoints).toBe(3);
    expect(t.assignee?.name).toBe("Alice");
    expect(t.reporter?.name).toBe("Carol");
  });

  it("carries the subtask counts and last-activity timestamp through", () => {
    const t = cleanupRowToTicket(makeRow());
    expect(t.openSubtaskCount).toBe(1);
    expect(t.totalSubtaskCount).toBe(4);
    expect(t.jiraUpdatedAt).toBe("2026-06-01T00:00:00Z");
  });

  it("stores the sprint name as the display name only, leaving sprintId unset (the slot renders the chip)", () => {
    const t = cleanupRowToTicket(makeRow());
    expect(t.sprintDisplayName).toBe("BT: 138");
    expect(t.sprintId).toBeUndefined();
  });

  it("defaults the cleanup-irrelevant planning fields to clean/empty", () => {
    const t = cleanupRowToTicket(makeRow());
    expect(t.flagged).toBe(false);
    expect(t.readiness).toBeNull();
    expect(t.poStatus).toBeNull();
    expect(t.qualityScore).toBeNull();
    expect(t.businessValue).toBeNull();
    expect(t.editState).toBe("clean");
    expect(t.notes).toBe("");
  });

  it("falls back to TO DO when the row has no usable status", () => {
    const t = cleanupRowToTicket(makeRow({ status: "" }));
    expect(t.jiraStatus).toBe("TO DO");
  });
});
