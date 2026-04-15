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

import { POST } from "./route";
import { activityLog } from "@/db/schema";

describe("POST /api/activity-log/acknowledge-all", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns { ok: true }", async () => {
    const response = await POST();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ ok: true });
  });

  it("marks all unacknowledged failed entries as acknowledged", async () => {
    const now = new Date().toISOString();
    testDb.insert(activityLog).values([
      { id: "a1", type: "sprint-sync", status: "failed", acknowledged: false, startedAt: now },
      { id: "a2", type: "sprint-sync", status: "failed", acknowledged: false, startedAt: now },
      { id: "a3", type: "sprint-sync", status: "success", acknowledged: false, startedAt: now },
    ]).run();

    await POST();

    const all = testDb.select().from(activityLog).all();
    const failed = all.filter((r) => r.status === "failed");
    expect(failed.every((r) => r.acknowledged === true)).toBe(true);
    // Successful entry should remain unacknowledged
    const success = all.find((r) => r.id === "a3");
    expect(success?.acknowledged).toBe(false);
  });
});
