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

vi.mock("@/lib/sync-abort", () => ({
  abortSync: vi.fn().mockReturnValue(true),
}));

import { POST } from "./route";
import { activityLog } from "@/db/schema";
import { eq } from "drizzle-orm";

function makeRequest(id: string): [Request, { params: Promise<{ id: string }> }] {
  return [
    new Request(`http://localhost:3100/api/activity-log/${id}/cancel`, { method: "POST" }),
    { params: Promise.resolve({ id }) },
  ];
}

describe("POST /api/activity-log/:id/cancel", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns 404 when entry does not exist", async () => {
    const response = await POST(...makeRequest("nonexistent"));
    expect(response.status).toBe(404);
  });

  it("returns 409 when entry is not running", async () => {
    testDb.insert(activityLog).values({
      id: "sync-done",
      type: "sprint-sync",
      scope: "sprints",
      status: "success",
      startedAt: new Date().toISOString(),
    }).run();

    const response = await POST(...makeRequest("sync-done"));
    expect(response.status).toBe(409);
  });

  it("cancels a running entry", async () => {
    testDb.insert(activityLog).values({
      id: "sync-running",
      type: "sprint-sync",
      scope: "sprints",
      status: "running",
      startedAt: new Date().toISOString(),
    }).run();

    const response = await POST(...makeRequest("sync-running"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);

    const entry = testDb.select().from(activityLog).where(eq(activityLog.id, "sync-running")).get();
    expect(entry?.status).toBe("cancelled");
    expect(entry?.summary).toBe("Cancelled by user");
  });

  it("returns 409 when entry completed between check and update (race condition)", async () => {
    testDb.insert(activityLog).values({
      id: "sync-race",
      type: "sprint-sync",
      scope: "sprints",
      status: "running",
      startedAt: new Date().toISOString(),
    }).run();

    const originalFindFirst = testDb.query.activityLog.findFirst;
    vi.spyOn(testDb.query.activityLog, "findFirst").mockImplementation((async (...args: any[]) => {
      const result = await originalFindFirst.call(testDb.query.activityLog, ...args);
      testDb.update(activityLog).set({ status: "success" }).where(eq(activityLog.id, "sync-race")).run();
      return result;
    }) as any);

    const response = await POST(...makeRequest("sync-race"));
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.ok).toBe(false);
    expect(data.error).toContain("already completed");

    const entry = testDb.select().from(activityLog).where(eq(activityLog.id, "sync-race")).get();
    expect(entry?.status).toBe("success");
  });
});
