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
import { syncLog } from "@/db/schema";
import { eq } from "drizzle-orm";

function makeRequest(id: string): [Request, { params: Promise<{ id: string }> }] {
  return [
    new Request(`http://localhost:3100/api/sync-log/${id}/cancel`, { method: "POST" }),
    { params: Promise.resolve({ id }) },
  ];
}

describe("POST /api/sync-log/:id/cancel", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns 404 when entry does not exist", async () => {
    const response = await POST(...makeRequest("nonexistent"));
    expect(response.status).toBe(404);
  });

  it("returns 409 when sync is not running", async () => {
    testDb.insert(syncLog).values({
      id: "sync-done",
      type: "sprint-sync",
      scope: "sprints",
      status: "success",
      startedAt: new Date().toISOString(),
    }).run();

    const response = await POST(...makeRequest("sync-done"));
    expect(response.status).toBe(409);
  });

  it("cancels a running sync", async () => {
    testDb.insert(syncLog).values({
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

    const entry = testDb.select().from(syncLog).where(eq(syncLog.id, "sync-running")).get();
    expect(entry?.status).toBe("cancelled");
    expect(entry?.summary).toBe("Cancelled by user");
  });

  it("returns 409 when sync completed between check and update (race condition)", async () => {
    testDb.insert(syncLog).values({
      id: "sync-race",
      type: "sprint-sync",
      scope: "sprints",
      status: "running",
      startedAt: new Date().toISOString(),
    }).run();

    // Simulate race: update status to "success" before the cancel route's UPDATE runs
    // by overriding the DB query behavior mid-flight
    const originalFindFirst = testDb.query.syncLog.findFirst;
    vi.spyOn(testDb.query.syncLog, "findFirst").mockImplementation(async (...args) => {
      const result = await originalFindFirst.call(testDb.query.syncLog, ...args);
      // After the initial read, simulate the sync completing
      testDb.update(syncLog).set({ status: "success" }).where(eq(syncLog.id, "sync-race")).run();
      return result;
    });

    const response = await POST(...makeRequest("sync-race"));
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.ok).toBe(false);
    expect(data.error).toContain("already completed");

    // Verify the status stayed as "success" (not overwritten to "cancelled")
    const entry = testDb.select().from(syncLog).where(eq(syncLog.id, "sync-race")).get();
    expect(entry?.status).toBe("success");
  });
});
