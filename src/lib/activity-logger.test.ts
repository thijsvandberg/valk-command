// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { activityLog } from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import { logActivity } from "./activity-logger";

describe("logActivity", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("inserts an activity log entry with defaults", async () => {
    await logActivity({ type: "sprint-sync" });

    const rows = testDb.select().from(activityLog).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("sprint-sync");
    expect(rows[0].status).toBe("success");
    expect(rows[0].scope).toBeNull();
    expect(rows[0].summary).toBeNull();
    expect(rows[0].errorDetail).toBeNull();
    expect(rows[0].durationMs).toBe(0);
  });

  it("respects explicit status", async () => {
    await logActivity({ type: "ticket-sync", status: "failed", errorDetail: "Something went wrong" });

    const rows = testDb.select().from(activityLog).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("failed");
    expect(rows[0].errorDetail).toBe("Something went wrong");
  });

  it("uses provided startedAt timestamp", async () => {
    const customStart = "2024-01-15T10:00:00.000Z";
    await logActivity({ type: "sprint-sync", startedAt: customStart, durationMs: 1500 });

    const rows = testDb.select().from(activityLog).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].startedAt).toBe(customStart);
    expect(rows[0].durationMs).toBe(1500);
  });
});
