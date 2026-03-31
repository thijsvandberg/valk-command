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

function makeRequest(sprintId?: string): Request {
  const url = sprintId
    ? `http://localhost:3100/api/jira/sync-tickets?sprintId=${sprintId}`
    : "http://localhost:3100/api/jira/sync-tickets";
  return new Request(url, { method: "POST" });
}

describe("POST /api/jira/sync-tickets", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns 400 when sprintId is missing", async () => {
    const response = await POST(makeRequest());
    expect(response.status).toBe(400);
  });

  it("syncs tickets for a sprint", async () => {
    const response = await POST(makeRequest("134"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.count).toBeGreaterThan(0);
    expect(data.live).toBe(false);
  });

  it("creates ticket rows in the database", async () => {
    await POST(makeRequest("134"));

    const { ticket } = await import("@/db/schema");
    const rows = testDb.select().from(ticket).all();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toHaveProperty("jiraKey");
    expect(rows[0]).toHaveProperty("title");
    expect(rows[0]).toHaveProperty("status");
  });

  it("creates ticket_metadata rows", async () => {
    await POST(makeRequest("134"));

    const { ticketMetadata } = await import("@/db/schema");
    const rows = testDb.select().from(ticketMetadata).all();
    expect(rows.length).toBeGreaterThan(0);
  });

  it("creates story_version rows", async () => {
    await POST(makeRequest("134"));

    const { storyVersion } = await import("@/db/schema");
    const rows = testDb.select().from(storyVersion).all();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toHaveProperty("contentHash");
  });

  it("handles re-sync without duplicating data", async () => {
    await POST(makeRequest("134"));
    await POST(makeRequest("134"));

    const { ticket } = await import("@/db/schema");
    const rows = testDb.select().from(ticket).all();

    // Each unique ticket key should appear exactly once
    const keys = rows.map((r) => r.jiraKey);
    const uniqueKeys = new Set(keys);
    expect(keys.length).toBe(uniqueKeys.size);
  });

  it("does not duplicate story versions when content unchanged", async () => {
    await POST(makeRequest("134"));
    await POST(makeRequest("134"));

    const { storyVersion } = await import("@/db/schema");
    const rows = testDb.select().from(storyVersion).all();

    // Group by jiraKey: each should have exactly 1 version (content didn't change)
    const byKey: Record<string, number> = {};
    for (const row of rows) {
      byKey[row.jiraKey] = (byKey[row.jiraKey] ?? 0) + 1;
    }
    for (const count of Object.values(byKey)) {
      expect(count).toBe(1);
    }
  });
});
