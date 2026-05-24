// @vitest-environment node
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
  abortAll: vi.fn().mockReturnValue([]),
}));

import { abortAll } from "@/lib/sync-abort";
import { POST } from "./route";
import { activityLog } from "@/db/schema";

describe("POST /api/activity-log/cancel-all", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.resetAllMocks();
    vi.mocked(abortAll).mockReturnValue([]);
  });

  it("returns { ok: true } with cancelled count", async () => {
    const response = await POST();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(typeof data.cancelled).toBe("number");
    expect(typeof data.aborted).toBe("number");
  });

  it("cancels all running activity log entries", async () => {
    const startedAt = new Date(Date.now() - 5000).toISOString();
    testDb.insert(activityLog).values([
      { id: "r1", type: "sprint-sync", status: "running", startedAt },
      { id: "r2", type: "ticket-sync", status: "running", startedAt },
      { id: "r3", type: "sprint-sync", status: "success", startedAt },
    ]).run();

    const response = await POST();
    const data = await response.json();
    expect(data.cancelled).toBe(2);

    const all = testDb.select().from(activityLog).all();
    const running = all.filter((r) => r.status === "running");
    expect(running).toHaveLength(0);
    const cancelled = all.filter((r) => r.status === "cancelled");
    expect(cancelled).toHaveLength(2);
  });

  it("reports aborted count from sync-abort", async () => {
    vi.mocked(abortAll).mockReturnValue(["sync-1", "sync-2"]);

    const response = await POST();
    const data = await response.json();
    expect(data.aborted).toBe(2);
    expect(abortAll).toHaveBeenCalled();
  });
});
