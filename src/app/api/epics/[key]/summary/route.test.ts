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

vi.mock("@/lib/cache", () => ({
  cache: { get: vi.fn(), set: vi.fn(), invalidate: vi.fn() },
}));

import { PATCH } from "./route";
import { ticket } from "@/db/schema";

function makeParams(key: string): { params: Promise<{ key: string }> } {
  return { params: Promise.resolve({ key }) };
}

function makeRequest(body: unknown): Request {
  return new Request("http://localhost:3100/api/epics/VPL-1/summary", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function seedEpic(key: string, title: string) {
  testDb.insert(ticket).values({
    jiraKey: key,
    title,
    type: "epic",
    status: "TO DO",
  }).run();
}

describe("PATCH /api/epics/[key]/summary", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("updates summary for an existing epic", async () => {
    seedEpic("VPL-1", "Auth Epic");
    const response = await PATCH(makeRequest({ summary: "OAuth2 migration" }), makeParams("VPL-1"));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.key).toBe("VPL-1");
    expect(data.summary).toBe("OAuth2 migration");
    expect(data.summaryUpdatedAt).toBeTruthy();
  });

  it("returns 404 for non-existent epic", async () => {
    const response = await PATCH(makeRequest({ summary: "test" }), makeParams("VPL-999"));
    expect(response.status).toBe(404);
  });

  it("returns 404 for non-epic ticket", async () => {
    testDb.insert(ticket).values({
      jiraKey: "VPL-2",
      title: "A story",
      type: "story",
      status: "TO DO",
    }).run();
    const response = await PATCH(makeRequest({ summary: "test" }), makeParams("VPL-2"));
    expect(response.status).toBe(404);
  });

  it("returns 400 when summary is missing", async () => {
    seedEpic("VPL-1", "Auth Epic");
    const response = await PATCH(makeRequest({}), makeParams("VPL-1"));
    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid JSON", async () => {
    seedEpic("VPL-1", "Auth Epic");
    const request = new Request("http://localhost:3100/api/epics/VPL-1/summary", {
      method: "PATCH",
      body: "not json",
      headers: { "Content-Type": "application/json" },
    });
    const response = await PATCH(request, makeParams("VPL-1"));
    expect(response.status).toBe(400);
  });
});
