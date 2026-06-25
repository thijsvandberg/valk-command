// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  timedQuery,
  recordQuery,
  normalizeSqlLabel,
  getQueryStats,
  resetQueryStats,
  SLOW_QUERY_THRESHOLD_MS,
} from "./query-timer";

describe("timedQuery", () => {
  it("returns the result and duration", async () => {
    const { result, durationMs } = await timedQuery("test", () => 42);
    expect(result).toBe(42);
    expect(typeof durationMs).toBe("number");
    expect(durationMs).toBeGreaterThanOrEqual(0);
  });

  it("works with async functions", async () => {
    const { result } = await timedQuery("test-async", async () => {
      return "hello";
    });
    expect(result).toBe("hello");
  });

  it("logs a warning for slow queries", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await timedQuery("slow-test", async () => {
      await new Promise((r) => setTimeout(r, 120));
      return true;
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[slow-query] slow-test:"),
    );
    warnSpy.mockRestore();
  });

  it("does not log for fast queries", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await timedQuery("fast-test", () => true);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("normalizeSqlLabel", () => {
  it("collapses whitespace runs into single spaces", () => {
    expect(normalizeSqlLabel("SELECT  *\n  FROM   t\tWHERE id = ?")).toBe(
      "SELECT * FROM t WHERE id = ?",
    );
  });

  it("truncates very long SQL so the label cannot bloat the map or a log line", () => {
    const long = `SELECT ${"col, ".repeat(100)} FROM t`;
    const label = normalizeSqlLabel(long);
    expect(label.length).toBeLessThanOrEqual(203); // 200 + "..."
    expect(label.endsWith("...")).toBe(true);
  });

  it("keeps the parameterized placeholders and leaks no value (operates on SQL text only)", () => {
    // The function cannot introduce a value; it only reshapes the text it gets.
    expect(normalizeSqlLabel("SELECT * FROM t WHERE secret = ?")).toBe(
      "SELECT * FROM t WHERE secret = ?",
    );
  });
});

describe("recordQuery + getQueryStats", () => {
  beforeEach(() => {
    resetQueryStats();
  });

  it("aggregates count, totals, max, and avg per label", () => {
    recordQuery("L", 10);
    recordQuery("L", 30);
    const row = getQueryStats().find((s) => s.label === "L");
    expect(row).toMatchObject({ label: "L", count: 2, maxMs: 30, avgMs: 20 });
    expect(row?.lastAt).toBeTypeOf("string");
  });

  it("counts only entries over the threshold as slow and logs once per record", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    recordQuery("L", 5);
    recordQuery("L", SLOW_QUERY_THRESHOLD_MS + 50);
    const row = getQueryStats().find((s) => s.label === "L");
    expect(row?.slowCount).toBe(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });
});
