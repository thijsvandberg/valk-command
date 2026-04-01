import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { NextRequest } from "next/server";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import { POST } from "./route";

function makeRequest(scope?: string): NextRequest {
  const url = scope
    ? `http://localhost:3100/api/jira/sync-sprints?scope=${scope}`
    : "http://localhost:3100/api/jira/sync-sprints";
  return new NextRequest(url, { method: "POST" });
}

describe("POST /api/jira/sync-sprints", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("fetches and caches sprints (default scope)", async () => {
    const response = await POST(makeRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.scope).toBe("sprints");
    expect(data.live).toBe(false);
  });

  it("stores sprints in app_setting table", async () => {
    await POST(makeRequest());

    const { appSetting } = await import("@/db/schema");
    const rows = testDb.select().from(appSetting).all();
    const sprintRow = rows.find((r) => r.key === "jira_sprints");

    expect(sprintRow).toBeDefined();
    const parsed = JSON.parse(sprintRow!.value);
    expect(Array.isArray(parsed)).toBe(true);
  });

  it("updates existing cache on re-sync", async () => {
    await POST(makeRequest());
    await POST(makeRequest());

    const { appSetting } = await import("@/db/schema");
    const rows = testDb
      .select()
      .from(appSetting)
      .all()
      .filter((r) => r.key === "jira_sprints");

    expect(rows).toHaveLength(1);
  });

  it("accepts scope=history for closed sprints", async () => {
    const response = await POST(makeRequest("history"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.scope).toBe("history");
  });

  it("merges sprints and history without overwriting each other", async () => {
    await POST(makeRequest("sprints"));
    await POST(makeRequest("history"));

    const { appSetting } = await import("@/db/schema");
    const rows = testDb.select().from(appSetting).all();
    const sprintRow = rows.find((r) => r.key === "jira_sprints");

    expect(sprintRow).toBeDefined();
    const parsed = JSON.parse(sprintRow!.value);
    expect(Array.isArray(parsed)).toBe(true);
  });
});
