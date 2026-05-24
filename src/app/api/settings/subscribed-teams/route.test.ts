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

vi.mock("server-only", () => ({}));

import { GET, PUT } from "./route";
import { appSetting, sprintNameCache } from "@/db/schema";

function makeRequest(body: unknown) {
  return new Request("http://localhost:3100/api/settings/subscribed-teams", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("GET /api/settings/subscribed-teams", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns empty teams when nothing is configured", async () => {
    const response = await GET();
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.teams).toEqual([]);
    expect(data.available).toEqual([]);
  });

  it("returns saved subscribed teams", async () => {
    testDb.insert(appSetting).values({
      key: "subscribed_teams",
      value: JSON.stringify({ teams: ["BT", "HT"] }),
    }).run();

    const response = await GET();
    const data = await response.json();
    expect(data.teams).toEqual(["BT", "HT"]);
  });

  it("returns available teams from sprint name cache", async () => {
    testDb.insert(sprintNameCache).values([
      { sprintId: "sprint-1", displayName: "BT: 137" },
      { sprintId: "sprint-2", displayName: "HT: 42" },
      { sprintId: "sprint-3", displayName: "BT: 138" },
    ]).run();

    const response = await GET();
    const data = await response.json();
    expect(data.available).toEqual(["BT", "HT"]);
  });
});

describe("PUT /api/settings/subscribed-teams", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("saves subscribed teams", async () => {
    const response = await PUT(makeRequest({ teams: ["BT", "GXP"] }));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.teams).toEqual(["BT", "GXP"]);
  });

  it("updates existing subscribed teams", async () => {
    testDb.insert(appSetting).values({
      key: "subscribed_teams",
      value: JSON.stringify({ teams: ["BT"] }),
    }).run();

    const response = await PUT(makeRequest({ teams: ["HT", "BM"] }));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.teams).toEqual(["HT", "BM"]);
  });

  it("returns 400 for invalid format", async () => {
    const response = await PUT(makeRequest({ teams: "not-array" }));
    expect(response.status).toBe(400);
  });

  it("allows empty teams array (unsubscribe all)", async () => {
    const response = await PUT(makeRequest({ teams: [] }));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.teams).toEqual([]);
  });
});
