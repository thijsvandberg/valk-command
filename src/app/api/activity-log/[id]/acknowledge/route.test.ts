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

vi.mock("server-only", () => ({}));

import { POST } from "./route";
import { activityLog } from "@/db/schema";

function makeRequest(method: string, body?: unknown, search?: string): Request {
  const url = `http://localhost:3100/api/activity-log/fake-id/acknowledge${search ?? ""}`;
  return new Request(url, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
  });
}

function insertEntry(id: string, acknowledged = false) {
  testDb.insert(activityLog).values({
    id,
    type: "sprint-sync",
    status: "success",
    summary: `Entry ${id}`,
    acknowledged,
    startedAt: new Date().toISOString(),
  }).run();
}

describe("POST /api/activity-log/:id/acknowledge", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns 404 for nonexistent entry", async () => {
    const response = await POST(makeRequest("POST"), {
      params: Promise.resolve({ id: "nonexistent" }),
    });
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data).toEqual({ error: "Activity log entry not found" });
  });

  it("acknowledges an existing entry and returns ok", async () => {
    insertEntry("entry-1");

    const response = await POST(makeRequest("POST"), {
      params: Promise.resolve({ id: "entry-1" }),
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ ok: true });
  });
});
