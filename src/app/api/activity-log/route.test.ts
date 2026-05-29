// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { buildGet } from "@/test/request-helpers";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import { GET } from "./route";
import { activityLog } from "@/db/schema";

function makeRequest(params?: Record<string, string>): Request {
  return buildGet("/api/activity-log", params);
}

describe("GET /api/activity-log", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns empty array when no entries exist", async () => {
    const response = await GET(makeRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual([]);
  });

  it("returns entries ordered by startedAt desc", async () => {
    const now = Date.now();
    testDb.insert(activityLog).values({
      id: "sync-1",
      type: "sprint-sync",
      scope: "sprints",
      status: "success",
      startedAt: new Date(now - 2000).toISOString(),
    }).run();
    testDb.insert(activityLog).values({
      id: "sync-2",
      type: "ticket-sync",
      scope: "134",
      status: "success",
      startedAt: new Date(now - 1000).toISOString(),
    }).run();

    const response = await GET(makeRequest());
    const data = await response.json();

    expect(data).toHaveLength(2);
    expect(data[0].id).toBe("sync-2");
    expect(data[1].id).toBe("sync-1");
  });

  it("respects limit parameter", async () => {
    for (let i = 0; i < 5; i++) {
      testDb.insert(activityLog).values({
        id: `sync-${i}`,
        type: "sprint-sync",
        scope: "sprints",
        status: "success",
        startedAt: new Date(Date.now() - i * 1000).toISOString(),
      }).run();
    }

    const response = await GET(makeRequest({ limit: "2" }));
    const data = await response.json();

    expect(data).toHaveLength(2);
  });

  it("still returns a plain array when include=stats is absent", async () => {
    const response = await GET(makeRequest());
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it("returns { entries, stats } shape when include=stats is present", async () => {
    const response = await GET(makeRequest({ include: "stats" }));
    const data = await response.json();
    expect(data).toHaveProperty("entries");
    expect(data).toHaveProperty("stats");
    expect(Array.isArray(data.entries)).toBe(true);
    expect(data.stats).toHaveProperty("today");
    expect(data.stats).toHaveProperty("yesterday");
    expect(data.stats).toHaveProperty("recurringFailures");
    expect(data.stats).toHaveProperty("timeline");
    expect(data.stats).toHaveProperty("healthScore");
  });

  it("stats.today counts today's events correctly", async () => {
    const now = new Date().toISOString();
    testDb.insert(activityLog).values({ id: "a1", type: "sprint-sync", scope: "sprints", status: "success", startedAt: now }).run();
    testDb.insert(activityLog).values({ id: "a2", type: "sprint-sync", scope: "sprints", status: "failed", startedAt: now }).run();

    const response = await GET(makeRequest({ include: "stats" }));
    const { stats } = await response.json();

    expect(stats.today.totalEvents).toBeGreaterThanOrEqual(2);
    expect(stats.today.successRate).toBeGreaterThan(0);
    expect(stats.today.successRate).toBeLessThanOrEqual(100);
  });

  it("stats.recurringFailures is empty when no failures", async () => {
    const response = await GET(makeRequest({ include: "stats" }));
    const { stats } = await response.json();
    expect(stats.recurringFailures).toEqual([]);
  });

  it("stats.timeline contains last-24h entries", async () => {
    const recent = new Date(Date.now() - 60 * 1000).toISOString();
    testDb.insert(activityLog).values({ id: "tl1", type: "sprint-sync", scope: "sprints", status: "success", startedAt: recent }).run();

    const response = await GET(makeRequest({ include: "stats" }));
    const { stats } = await response.json();
    const found = stats.timeline.find((t: { id: string }) => t.id === "tl1");
    expect(found).toBeDefined();
  });

  it("stats.healthScore has required fields", async () => {
    const response = await GET(makeRequest({ include: "stats" }));
    const { stats } = await response.json();
    expect(stats.healthScore).toMatchObject({
      score: expect.any(Number),
      band: expect.stringMatching(/^(green|amber|red)$/),
      trend: expect.stringMatching(/^(up|flat|down)$/),
      components: {
        successRate: expect.any(Number),
        durationConsistency: expect.any(Number),
        errorFreeStreak: expect.any(Number),
      },
    });
  });
});
