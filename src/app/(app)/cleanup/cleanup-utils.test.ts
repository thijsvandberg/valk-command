import { describe, it, expect } from "vitest";
import { filterRows, sortRows, scoreHeat } from "./cleanup-utils";
import type { CleanupRow } from "@/lib/cleanup-types";

function row(key: string, over: number | null, opts: Partial<CleanupRow> = {}): CleanupRow {
  return {
    key,
    title: `Ticket ${key}`,
    status: "TO DO",
    lastScannedAt: opts.lastScannedAt ?? null,
    topicScores: opts.topicScores ?? {},
    scanOverall: over,
    disposition: opts.disposition ?? null,
    revivalScore: opts.revivalScore ?? null,
    revivalRationale: opts.revivalRationale ?? null,
  };
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
    const out = filterRows(rows, { scanned: "scanned", disposition: "all", minOverall: 0 });
    expect(out.map((r) => r.key)).toEqual(["SCANNED", "DISMISSED"]);
  });

  it("filters to never-scanned only", () => {
    const out = filterRows(rows, { scanned: "never", disposition: "all", minOverall: 0 });
    expect(out.map((r) => r.key)).toEqual(["NEVER"]);
  });

  it("filters by disposition", () => {
    const out = filterRows(rows, { scanned: "all", disposition: "dismissed", minOverall: 0 });
    expect(out.map((r) => r.key)).toEqual(["DISMISSED"]);
  });

  it("filters by score threshold and excludes unscored rows", () => {
    const out = filterRows(rows, { scanned: "all", disposition: "all", minOverall: 0.6 });
    expect(out.map((r) => r.key)).toEqual(["SCANNED"]);
  });

  it("returns everything with the default open filter", () => {
    const out = filterRows(rows, { scanned: "all", disposition: "all", minOverall: 0 });
    expect(out).toHaveLength(3);
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
