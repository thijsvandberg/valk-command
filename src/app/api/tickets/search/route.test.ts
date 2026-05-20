import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket } from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() { return testDb; },
}));

import { GET } from "./route";

function makeRequest(q: string, exclude?: string): Request {
  const params = new URLSearchParams({ q });
  if (exclude) params.set("exclude", exclude);
  return new Request(`http://localhost:3100/api/tickets/search?${params}`);
}

function seedTickets() {
  testDb.insert(ticket).values([
    { jiraKey: "VPL-100", title: "Fix login bug", status: "TO DO", type: "bug" },
    { jiraKey: "VPL-101", title: "Add dark mode", status: "IN PROGRESS", type: "story" },
    { jiraKey: "VPL-102", title: "Login page redesign", status: "DONE", type: "task" },
  ]).run();
}

describe("GET /api/tickets/search", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns empty for short queries", async () => {
    seedTickets();
    const res = await GET(makeRequest("a"));
    const data = await res.json();
    expect(data).toEqual([]);
  });

  it("searches by title", async () => {
    seedTickets();
    const res = await GET(makeRequest("login"));
    const data = await res.json();
    expect(data).toHaveLength(2);
    expect(data.map((r: { key: string }) => r.key).sort()).toEqual(["VPL-100", "VPL-102"]);
  });

  it("searches by key", async () => {
    seedTickets();
    const res = await GET(makeRequest("VPL-101"));
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].key).toBe("VPL-101");
  });

  it("excludes specified key", async () => {
    seedTickets();
    const res = await GET(makeRequest("login", "VPL-100"));
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].key).toBe("VPL-102");
  });

  it("returns empty for no matches", async () => {
    seedTickets();
    const res = await GET(makeRequest("zzzzz"));
    const data = await res.json();
    expect(data).toEqual([]);
  });
});
