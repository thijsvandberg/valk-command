import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import { GET } from "./route";
import { syncLog } from "@/db/schema";

function makeRequest(params?: Record<string, string>): Request {
  const search = params ? "?" + new URLSearchParams(params).toString() : "";
  return new Request(`http://localhost:3100/api/sync-log${search}`);
}

describe("GET /api/sync-log", () => {
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
    testDb.insert(syncLog).values({
      id: "sync-1",
      type: "sprint-sync",
      scope: "sprints",
      status: "success",
      startedAt: new Date(now - 2000).toISOString(),
    }).run();
    testDb.insert(syncLog).values({
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

  it("marks stale running syncs as failed", async () => {
    const staleTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    testDb.insert(syncLog).values({
      id: "sync-stale",
      type: "sprint-sync",
      scope: "sprints",
      status: "running",
      startedAt: staleTime,
    }).run();

    const response = await GET(makeRequest());
    const data = await response.json();

    expect(data[0].status).toBe("failed");
    expect(data[0].errorDetail).toContain("timed out");
  });

  it("deletes entries older than 7 days", async () => {
    const oldTime = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const recentTime = new Date().toISOString();

    testDb.insert(syncLog).values({
      id: "sync-old",
      type: "sprint-sync",
      scope: "sprints",
      status: "success",
      startedAt: oldTime,
    }).run();
    testDb.insert(syncLog).values({
      id: "sync-recent",
      type: "sprint-sync",
      scope: "sprints",
      status: "success",
      startedAt: recentTime,
    }).run();

    const response = await GET(makeRequest());
    const data = await response.json();

    expect(data).toHaveLength(1);
    expect(data[0].id).toBe("sync-recent");
  });

  it("keeps max 200 entries and deletes oldest", async () => {
    for (let i = 0; i < 210; i++) {
      const time = new Date(Date.now() - i * 1000).toISOString();
      testDb.insert(syncLog).values({
        id: `sync-${i.toString().padStart(3, "0")}`,
        type: "sprint-sync",
        scope: "sprints",
        status: "success",
        startedAt: time,
      }).run();
    }

    await GET(makeRequest());

    const remaining = testDb.select().from(syncLog).all();
    expect(remaining.length).toBe(200);
  });

  it("respects limit parameter", async () => {
    for (let i = 0; i < 5; i++) {
      testDb.insert(syncLog).values({
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
});
