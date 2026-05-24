// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  normalizeErrorDetail,
  computeDayStats,
  computeRecurringFailures,
  computeTimeline,
  computeHealthScore,
} from "./compute-stats";
import type { ActivityLog } from "@/db/schema";

function makeRow(overrides: Partial<ActivityLog> = {}): ActivityLog {
  return {
    id: "test-id",
    type: "sprint-sync",
    scope: null,
    status: "success",
    summary: null,
    errorDetail: null,
    durationMs: null,
    startedAt: new Date().toISOString(),
    completedAt: null,
    acknowledged: false,
    ...overrides,
  };
}

describe("normalizeErrorDetail", () => {
  it("strips ticket keys", () => {
    expect(normalizeErrorDetail("Failed for VPL-12345 and PROJ-99")).toBe(
      "Failed for <KEY> and <KEY>",
    );
  });

  it("strips ISO timestamps", () => {
    expect(normalizeErrorDetail("Error at 2024-01-15T10:30:00Z")).toBe(
      "Error at <TS>",
    );
  });

  it("strips UUIDs", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    expect(normalizeErrorDetail(`Resource ${uuid} not found`)).toBe(
      "Resource <ID> not found",
    );
  });

  it("strips large integers", () => {
    expect(normalizeErrorDetail("Timeout after 123456ms")).toBe(
      "Timeout after <NUM>ms",
    );
  });

  it("leaves short numbers intact", () => {
    const result = normalizeErrorDetail("HTTP 404 error");
    expect(result).toBe("HTTP 404 error");
  });
});

describe("computeDayStats", () => {
  it("returns defaults for empty input", () => {
    const stats = computeDayStats([], []);
    expect(stats).toEqual({
      totalEvents: 0,
      successRate: 100,
      avgDurationMs: 0,
      activeErrorCount: 0,
    });
  });

  it("computes success rate correctly", () => {
    const rows = [
      makeRow({ status: "success" }),
      makeRow({ status: "success" }),
      makeRow({ status: "failed" }),
      makeRow({ status: "failed" }),
    ];
    const stats = computeDayStats(rows, []);
    expect(stats.totalEvents).toBe(4);
    expect(stats.successRate).toBe(50);
  });

  it("computes average duration from entries with duration only", () => {
    const rows = [
      makeRow({ durationMs: 1000 }),
      makeRow({ durationMs: 3000 }),
      makeRow({ durationMs: null }),
    ];
    const stats = computeDayStats(rows, []);
    expect(stats.avgDurationMs).toBe(2000);
  });

  it("counts active errors from failedAndUnacked arg", () => {
    const failedUnacked = [makeRow({ status: "failed", acknowledged: false })];
    const stats = computeDayStats([], failedUnacked);
    expect(stats.activeErrorCount).toBe(1);
  });
});

describe("computeRecurringFailures", () => {
  it("returns empty array when no failures", () => {
    expect(computeRecurringFailures([])).toEqual([]);
  });

  it("returns empty when failures < 3 for any pattern", () => {
    const rows = [
      makeRow({ status: "failed", errorDetail: "Network timeout" }),
      makeRow({ status: "failed", errorDetail: "Network timeout" }),
    ];
    expect(computeRecurringFailures(rows)).toHaveLength(0);
  });

  it("groups identical normalized patterns", () => {
    const rows = Array.from({ length: 4 }, (_, i) =>
      makeRow({
        id: `fail-${i}`,
        status: "failed",
        errorDetail: "Sync failed for VPL-1000",
        startedAt: new Date(Date.now() - i * 1000).toISOString(),
      }),
    );
    const result = computeRecurringFailures(rows);
    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(4);
    expect(result[0].pattern).toContain("<KEY>");
  });

  it("separates different types even with same error", () => {
    const sprintRows = Array.from({ length: 3 }, (_, i) =>
      makeRow({ id: `sprint-${i}`, type: "sprint-sync", status: "failed", errorDetail: "Timeout" }),
    );
    const ticketRows = Array.from({ length: 3 }, (_, i) =>
      makeRow({ id: `ticket-${i}`, type: "ticket-sync", status: "failed", errorDetail: "Timeout" }),
    );
    const result = computeRecurringFailures([...sprintRows, ...ticketRows]);
    expect(result).toHaveLength(2);
  });

  it("collects unique affected scopes", () => {
    const rows = [
      makeRow({ id: "f1", status: "failed", errorDetail: "err", scope: "VPL-1" }),
      makeRow({ id: "f2", status: "failed", errorDetail: "err", scope: "VPL-2" }),
      makeRow({ id: "f3", status: "failed", errorDetail: "err", scope: "VPL-1" }),
    ];
    const result = computeRecurringFailures(rows);
    expect(result[0].affectedScopes).toEqual(["VPL-1", "VPL-2"]);
  });

  it("excludes non-failed entries", () => {
    const rows = [
      makeRow({ status: "success", errorDetail: "irrelevant" }),
      makeRow({ status: "success", errorDetail: "irrelevant" }),
      makeRow({ status: "success", errorDetail: "irrelevant" }),
    ];
    expect(computeRecurringFailures(rows)).toHaveLength(0);
  });
});

describe("computeTimeline", () => {
  it("returns entries sorted ascending by startedAt", () => {
    const now = Date.now();
    const rows = [
      makeRow({ id: "c", startedAt: new Date(now - 1000).toISOString() }),
      makeRow({ id: "a", startedAt: new Date(now - 3000).toISOString() }),
      makeRow({ id: "b", startedAt: new Date(now - 2000).toISOString() }),
    ];
    const result = computeTimeline(rows);
    expect(result.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("maps fields correctly", () => {
    const row = makeRow({
      id: "t1",
      type: "ticket-sync",
      status: "failed",
      scope: "VPL-1",
      durationMs: 500,
      startedAt: "2024-01-01T10:00:00Z",
    });
    const result = computeTimeline([row]);
    expect(result[0]).toMatchObject({
      id: "t1",
      type: "ticket-sync",
      status: "failed",
      scope: "VPL-1",
      durationMs: 500,
    });
  });
});

describe("computeHealthScore", () => {
  it("returns 100 green score for all-success rows with no failures", () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      makeRow({ id: `r${i}`, status: "success", durationMs: 1000 }),
    );
    const result = computeHealthScore(rows, [], rows, []);
    expect(result.score).toBe(100);
    expect(result.band).toBe("green");
  });

  it("returns red band for score < 50", () => {
    // 0 success entries means successRate=0 and errorFreeStreak=0 (all failed recently)
    const now = new Date().toISOString();
    const rows = Array.from({ length: 5 }, (_, i) =>
      makeRow({ id: `f${i}`, status: "failed", startedAt: now }),
    );
    const result = computeHealthScore(rows, rows, rows, rows);
    expect(result.band).toBe("red");
  });

  it("returns amber band for score 50-79", () => {
    const now = Date.now();
    // 70% success, recent failure
    const rows = [
      ...Array.from({ length: 7 }, (_, i) => makeRow({ id: `s${i}`, status: "success", durationMs: 1000 })),
      ...Array.from({ length: 3 }, (_, i) =>
        makeRow({ id: `f${i}`, status: "failed", startedAt: new Date(now - 5 * 60 * 60 * 1000).toISOString() }),
      ),
    ];
    const failed = rows.filter((r) => r.status === "failed");
    const result = computeHealthScore(rows, failed, rows, failed);
    expect(result.band).toBe("amber");
  });

  it("trend is up when current score is significantly higher than past", () => {
    const successRows = Array.from({ length: 10 }, (_, i) =>
      makeRow({ id: `s${i}`, status: "success", durationMs: 1000 }),
    );
    const failedRows = Array.from({ length: 10 }, (_, i) =>
      makeRow({ id: `f${i}`, status: "failed", startedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString() }),
    );
    const result = computeHealthScore(successRows, [], failedRows, failedRows);
    expect(result.trend).toBe("up");
  });

  it("exposes component values", () => {
    const rows = Array.from({ length: 4 }, (_, i) =>
      makeRow({ id: `r${i}`, status: "success", durationMs: 1000 }),
    );
    const result = computeHealthScore(rows, [], rows, []);
    expect(result.components).toMatchObject({
      successRate: expect.any(Number),
      durationConsistency: expect.any(Number),
      errorFreeStreak: expect.any(Number),
    });
  });
});
