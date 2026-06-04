import { describe, it, expect } from "vitest";
import {
  filterRows,
  sortRows,
  scoreHeat,
  revivalHeat,
  isRevivalCandidate,
  lastActivityBucket,
  type CleanupFilters,
} from "./cleanup-utils";
import type { CleanupRow } from "@/lib/cleanup-types";

function row(key: string, over: number | null, opts: Partial<CleanupRow> = {}): CleanupRow {
  return {
    key,
    title: `Ticket ${key}`,
    status: "TO DO",
    type: opts.type ?? "story",
    epic: opts.epic ?? null,
    epicKey: opts.epicKey ?? null,
    storyPoints: opts.storyPoints ?? null,
    openSubtaskCount: opts.openSubtaskCount ?? 0,
    totalSubtaskCount: opts.totalSubtaskCount ?? 0,
    assignee: opts.assignee ?? null,
    reporter: opts.reporter ?? null,
    jiraUpdatedAt: opts.jiraUpdatedAt ?? null,
    lastScannedAt: opts.lastScannedAt ?? null,
    topicScores: opts.topicScores ?? {},
    scanOverall: over,
    disposition: opts.disposition ?? null,
    revivalScore: opts.revivalScore ?? null,
    revivalRationale: opts.revivalRationale ?? null,
  };
}

// Filters default to "show everything"; tests override only the field under test.
function filters(over: Partial<CleanupFilters> = {}): CleanupFilters {
  return {
    scanned: "all",
    disposition: "all",
    minOverall: 0,
    revivalOnly: false,
    types: new Set(),
    epicKeys: new Set(),
    assignees: new Set(),
    reporters: new Set(),
    lastActivity: new Set(),
    ...over,
  };
}

function person(name: string) {
  return { name, initials: name.slice(0, 2).toUpperCase(), color: "hsl(1, 50%, 50%)" };
}

describe("sortRows", () => {
  it("orders by overall descending, nulls last", () => {
    const rows = [row("A", 0.3), row("B", null), row("C", 0.9)];
    expect(sortRows(rows, "overall").map((r) => r.key)).toEqual(["C", "A", "B"]);
  });

  it("orders by staleness topic descending, nulls last", () => {
    const rows = [
      row("A", null, { topicScores: { staleness: 0.5 } }),
      row("B", null, { topicScores: {} }),
      row("C", null, { topicScores: { staleness: 0.8 } }),
    ];
    expect(sortRows(rows, "staleness").map((r) => r.key)).toEqual(["C", "A", "B"]);
  });

  it("orders by last scanned oldest first, never-scanned last", () => {
    const rows = [
      row("NEW", null, { lastScannedAt: "2026-06-03T00:00:00Z" }),
      row("NONE", null, {}),
      row("OLD", null, { lastScannedAt: "2026-01-01T00:00:00Z" }),
    ];
    expect(sortRows(rows, "lastScanned-oldest").map((r) => r.key)).toEqual(["OLD", "NEW", "NONE"]);
  });

  it("orders by last scanned newest first", () => {
    const rows = [
      row("OLD", null, { lastScannedAt: "2026-01-01T00:00:00Z" }),
      row("NEW", null, { lastScannedAt: "2026-06-03T00:00:00Z" }),
    ];
    expect(sortRows(rows, "lastScanned-newest").map((r) => r.key)).toEqual(["NEW", "OLD"]);
  });

  it("orders by key numerically", () => {
    const rows = [row("BT-10", null), row("BT-2", null), row("BT-1", null)];
    expect(sortRows(rows, "key").map((r) => r.key)).toEqual(["BT-1", "BT-2", "BT-10"]);
  });

  it("orders by revival score descending, nulls last", () => {
    const rows = [
      row("A", null, { revivalScore: 0.4 }),
      row("B", null, {}),
      row("C", null, { revivalScore: 0.9 }),
    ];
    expect(sortRows(rows, "revival").map((r) => r.key)).toEqual(["C", "A", "B"]);
  });

  it("does not mutate the input array", () => {
    const rows = [row("A", 0.3), row("C", 0.9)];
    const before = rows.map((r) => r.key);
    sortRows(rows, "overall");
    expect(rows.map((r) => r.key)).toEqual(before);
  });
});

describe("filterRows", () => {
  const rows = [
    row("SCANNED", 0.8, { lastScannedAt: "2026-06-01T00:00:00Z", disposition: "candidate" }),
    row("NEVER", null, {}),
    row("DISMISSED", 0.3, { lastScannedAt: "2026-06-01T00:00:00Z", disposition: "dismissed" }),
  ];

  it("filters to scanned only", () => {
    const out = filterRows(rows, filters({ scanned: "scanned" }));
    expect(out.map((r) => r.key)).toEqual(["SCANNED", "DISMISSED"]);
  });

  it("filters to never-scanned only", () => {
    const out = filterRows(rows, filters({ scanned: "never" }));
    expect(out.map((r) => r.key)).toEqual(["NEVER"]);
  });

  it("filters by disposition", () => {
    const out = filterRows(rows, filters({ disposition: "dismissed" }));
    expect(out.map((r) => r.key)).toEqual(["DISMISSED"]);
  });

  it("filters by score threshold and excludes unscored rows", () => {
    const out = filterRows(rows, filters({ minOverall: 0.6 }));
    expect(out.map((r) => r.key)).toEqual(["SCANNED"]);
  });

  it("returns everything with the default open filter", () => {
    const out = filterRows(rows, filters());
    expect(out).toHaveLength(3);
  });

  it("filters to revival candidates only (>= threshold)", () => {
    const revivalRows = [
      row("HIGH", null, { revivalScore: 0.7 }),
      row("BORDER", null, { revivalScore: 0.6 }),
      row("LOW", null, { revivalScore: 0.59 }),
      row("NONE", null, {}),
    ];
    const out = filterRows(revivalRows, filters({ revivalOnly: true }));
    expect(out.map((r) => r.key)).toEqual(["HIGH", "BORDER"]);
  });

  it("filters by issue type (OR within the set)", () => {
    const typedRows = [
      row("STORY", null, { type: "story" }),
      row("BUG", null, { type: "bug" }),
      row("TASK", null, { type: "task" }),
    ];
    const out = filterRows(typedRows, filters({ types: new Set(["bug", "task"]) }));
    expect(out.map((r) => r.key)).toEqual(["BUG", "TASK"]);
  });

  it("filters by epic key and excludes unparented rows while active", () => {
    const epicRows = [
      row("A", null, { epicKey: "BT-100", epic: "Upsell" }),
      row("B", null, { epicKey: "BT-200", epic: "Logging" }),
      row("C", null, {}), // no epic
    ];
    const out = filterRows(epicRows, filters({ epicKeys: new Set(["BT-100"]) }));
    expect(out.map((r) => r.key)).toEqual(["A"]);
  });

  it("filters by assignee and reporter name", () => {
    const peopleRows = [
      row("A", null, { assignee: person("Alice"), reporter: person("Carol") }),
      row("B", null, { assignee: person("Bob"), reporter: person("Carol") }),
      row("C", null, {}),
    ];
    expect(filterRows(peopleRows, filters({ assignees: new Set(["Alice"]) })).map((r) => r.key)).toEqual(["A"]);
    expect(filterRows(peopleRows, filters({ reporters: new Set(["Carol"]) })).map((r) => r.key)).toEqual(["A", "B"]);
  });

  it("filters by last-activity bucket", () => {
    const now = Date.parse("2026-06-04T00:00:00Z");
    const activityRows = [
      row("RECENT", null, { jiraUpdatedAt: "2026-05-20T00:00:00Z" }), // < 1mo
      row("OLD", null, { jiraUpdatedAt: "2024-01-01T00:00:00Z" }), // > 1yr
      row("MID", null, { jiraUpdatedAt: "2026-03-01T00:00:00Z" }), // 3-6mo
    ];
    const out = filterRows(activityRows, filters({ lastActivity: new Set(["lt1m", "gt1y"]) }), now);
    expect(out.map((r) => r.key)).toEqual(["RECENT", "OLD"]);
  });

  it("ANDs multiple facet filters together", () => {
    const mixed = [
      row("A", null, { type: "bug", assignee: person("Alice") }),
      row("B", null, { type: "bug", assignee: person("Bob") }),
      row("C", null, { type: "story", assignee: person("Alice") }),
    ];
    const out = filterRows(mixed, filters({ types: new Set(["bug"]), assignees: new Set(["Alice"]) }));
    expect(out.map((r) => r.key)).toEqual(["A"]);
  });
});

describe("lastActivityBucket", () => {
  const now = Date.parse("2026-06-04T00:00:00Z");

  it("classifies into the coarse day windows", () => {
    expect(lastActivityBucket("2026-06-01T00:00:00Z", now)).toBe("lt1m");
    expect(lastActivityBucket("2026-04-15T00:00:00Z", now)).toBe("1to3m");
    expect(lastActivityBucket("2026-02-15T00:00:00Z", now)).toBe("3to6m");
    expect(lastActivityBucket("2025-10-01T00:00:00Z", now)).toBe("6to12m");
    expect(lastActivityBucket("2024-01-01T00:00:00Z", now)).toBe("gt1y");
  });

  it("returns 'unknown' for null or unparseable timestamps", () => {
    expect(lastActivityBucket(null, now)).toBe("unknown");
    expect(lastActivityBucket("not-a-date", now)).toBe("unknown");
  });
});

describe("isRevivalCandidate", () => {
  it("is true at or above the 0.6 threshold and false below or when null", () => {
    expect(isRevivalCandidate(row("A", null, { revivalScore: 0.6 }))).toBe(true);
    expect(isRevivalCandidate(row("B", null, { revivalScore: 0.95 }))).toBe(true);
    expect(isRevivalCandidate(row("C", null, { revivalScore: 0.59 }))).toBe(false);
    expect(isRevivalCandidate(row("D", null, {}))).toBe(false);
  });
});

describe("revivalHeat", () => {
  it("uses the positive success token for a scored revival and neutral when null", () => {
    expect(revivalHeat(0.8).color).toContain("success");
    expect(revivalHeat(null).color).toContain("neutral");
  });
});

describe("scoreHeat", () => {
  it("returns neutral tokens for an unscored value", () => {
    expect(scoreHeat(null).color).toContain("neutral");
  });

  it("ramps from brand to error as the score rises", () => {
    expect(scoreHeat(0.1).color).toContain("brand");
    expect(scoreHeat(0.65).color).toContain("warning");
    expect(scoreHeat(0.9).color).toContain("error");
  });
});
