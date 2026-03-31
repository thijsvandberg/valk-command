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

describe("POST /api/jira/sync-sprints", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("fetches and caches sprints", async () => {
    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.count).toBeGreaterThan(0);
    expect(data.live).toBe(false);
  });

  it("stores sprints in app_setting table", async () => {
    await POST();

    const { appSetting } = await import("@/db/schema");
    const rows = testDb.select().from(appSetting).all();
    const sprintRow = rows.find((r) => r.key === "jira_sprints");

    expect(sprintRow).toBeDefined();
    const parsed = JSON.parse(sprintRow!.value);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed[0]).toHaveProperty("id");
    expect(parsed[0]).toHaveProperty("name");
  });

  it("updates existing cache on re-sync", async () => {
    await POST();
    await POST();

    const { appSetting } = await import("@/db/schema");
    const rows = testDb
      .select()
      .from(appSetting)
      .all()
      .filter((r) => r.key === "jira_sprints");

    expect(rows).toHaveLength(1);
  });
});
