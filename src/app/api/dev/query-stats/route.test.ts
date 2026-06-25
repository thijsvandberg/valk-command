// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { GET } from "./route";
import { recordQuery, resetQueryStats, SLOW_QUERY_THRESHOLD_MS } from "@/lib/query-timer";

describe("GET /api/dev/query-stats", () => {
  beforeEach(() => {
    resetQueryStats();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 404 outside development", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = GET();
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Not found");
  });

  it("returns aggregates and the threshold in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    recordQuery("SELECT 1 FROM t WHERE id = ?", 5);
    recordQuery("SELECT 1 FROM t WHERE id = ?", SLOW_QUERY_THRESHOLD_MS + 40);

    const res = GET();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.thresholdMs).toBe(SLOW_QUERY_THRESHOLD_MS);
    const row = body.queries.find(
      (q: { label: string }) => q.label === "SELECT 1 FROM t WHERE id = ?",
    );
    expect(row).toMatchObject({ count: 2, slowCount: 1 });
    expect(row.avgMs).toBeTypeOf("number");
    expect(row.maxMs).toBe(SLOW_QUERY_THRESHOLD_MS + 40);
  });

  it("does not expose any bound parameter values in the returned labels", async () => {
    vi.stubEnv("NODE_ENV", "development");
    // Labels are parameterized SQL; this asserts the endpoint passes them
    // through verbatim without ever interpolating a value.
    recordQuery("SELECT * FROM users WHERE email = ?", 1);
    const res = GET();
    const body = await res.json();
    const labels = body.queries.map((q: { label: string }) => q.label);
    expect(labels).toContain("SELECT * FROM users WHERE email = ?");
    expect(JSON.stringify(body)).not.toContain("@");
  });
});
