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

import { GET, PUT } from "./route";
import { userTeamAssignment } from "@/db/schema";

function makeRequest(method: string, body?: unknown): Request {
  const url = "http://localhost:3100/api/settings/user-teams";
  return new Request(url, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
  });
}

describe("GET /api/settings/user-teams", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns empty assignments when none exist", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ assignments: [] });
  });

  it("returns grouped assignments by user", async () => {
    testDb.insert(userTeamAssignment).values({ id: "1", displayName: "Alice", team: "BT" }).run();
    testDb.insert(userTeamAssignment).values({ id: "2", displayName: "Alice", team: "BO" }).run();
    testDb.insert(userTeamAssignment).values({ id: "3", displayName: "Bob", team: "GXP" }).run();

    const res = await GET();
    const data = await res.json();
    expect(data.assignments).toHaveLength(2);

    const alice = data.assignments.find((a: { displayName: string }) => a.displayName === "Alice");
    expect(alice.teams).toHaveLength(2);
    expect(alice.teams).toContain("BT");
    expect(alice.teams).toContain("BO");

    const bob = data.assignments.find((a: { displayName: string }) => a.displayName === "Bob");
    expect(bob.teams).toEqual(["GXP"]);
  });
});

describe("PUT /api/settings/user-teams", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("sets teams for a user", async () => {
    const res = await PUT(makeRequest("PUT", { displayName: "Alice", teams: ["BT", "BM"] }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ displayName: "Alice", teams: ["BT", "BM"] });

    const rows = testDb.select().from(userTeamAssignment).all();
    expect(rows).toHaveLength(2);
  });

  it("persists the accountId on each team row when provided (BRDG-364)", async () => {
    const res = await PUT(makeRequest("PUT", { displayName: "Alice", accountId: "acc-alice", teams: ["BT", "BM"] }));
    expect(res.status).toBe(200);
    const rows = testDb.select().from(userTeamAssignment).all();
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.accountId === "acc-alice")).toBe(true);
  });

  it("replaces existing teams", async () => {
    testDb.insert(userTeamAssignment).values({ id: "1", displayName: "Alice", team: "BT" }).run();
    testDb.insert(userTeamAssignment).values({ id: "2", displayName: "Alice", team: "BM" }).run();

    const res = await PUT(makeRequest("PUT", { displayName: "Alice", teams: ["GXP"] }));
    expect(res.status).toBe(200);

    const rows = testDb.select().from(userTeamAssignment).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].team).toBe("GXP");
  });

  it("with empty teams array removes all assignments", async () => {
    testDb.insert(userTeamAssignment).values({ id: "1", displayName: "Alice", team: "BT" }).run();

    const res = await PUT(makeRequest("PUT", { displayName: "Alice", teams: [] }));
    expect(res.status).toBe(200);

    const rows = testDb.select().from(userTeamAssignment).all();
    expect(rows).toHaveLength(0);
  });

  it("a user can belong to multiple teams", async () => {
    const res = await PUT(makeRequest("PUT", {
      displayName: "Alice",
      teams: ["BT", "BM", "BO", "GXP", "HT"],
    }));
    expect(res.status).toBe(200);

    const rows = testDb.select().from(userTeamAssignment).all();
    expect(rows).toHaveLength(5);
  });

  it("rejects invalid team names", async () => {
    const res = await PUT(makeRequest("PUT", { displayName: "Alice", teams: ["INVALID"] }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data).toHaveProperty("error");
  });

  it("returns 400 for missing displayName", async () => {
    const res = await PUT(makeRequest("PUT", { teams: ["BT"] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON", async () => {
    const req = new Request("http://localhost:3100/api/settings/user-teams", {
      method: "PUT",
      body: "not json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
  });
});
