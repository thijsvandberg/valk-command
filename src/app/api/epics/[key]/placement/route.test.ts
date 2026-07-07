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
import { epicMetadata } from "@/db/schema";

function makeRequest(body?: unknown): Request {
  return new Request("http://localhost:3100/api/epics/VPL-E1/placement", {
    method: "PUT",
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
  });
}

function makeParams(key: string) {
  return { params: Promise.resolve({ key }) };
}

describe("GET /api/epics/[key]/placement", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns null when the epic has no placement", async () => {
    const res = await GET(new Request("http://x"), makeParams("VPL-E1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ epicKey: "VPL-E1", placement: null });
  });

  it("returns the stored placement", async () => {
    testDb.insert(epicMetadata).values({ epicKey: "VPL-E1", childPlacement: "42" }).run();
    const res = await GET(new Request("http://x"), makeParams("VPL-E1"));
    expect(await res.json()).toEqual({ epicKey: "VPL-E1", placement: "42" });
  });
});

describe("PUT /api/epics/[key]/placement", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("sets a concrete sprint placement on an epic", async () => {
    const res = await PUT(makeRequest({ placement: "42" }), makeParams("VPL-E1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ epicKey: "VPL-E1", placement: "42" });

    const rows = testDb.select().from(epicMetadata).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].childPlacement).toBe("42");
  });

  it("accepts the backlog and default-sprint markers", async () => {
    await PUT(makeRequest({ placement: "__backlog__" }), makeParams("VPL-E1"));
    expect(testDb.select().from(epicMetadata).get()?.childPlacement).toBe("__backlog__");

    await PUT(makeRequest({ placement: "__default__" }), makeParams("VPL-E1"));
    expect(testDb.select().from(epicMetadata).get()?.childPlacement).toBe("__default__");
  });

  it("replaces an existing placement on a second PUT", async () => {
    await PUT(makeRequest({ placement: "42" }), makeParams("VPL-E1"));
    await PUT(makeRequest({ placement: "__backlog__" }), makeParams("VPL-E1"));

    const rows = testDb.select().from(epicMetadata).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].childPlacement).toBe("__backlog__");
  });

  it("clears the placement with null (choose each time again)", async () => {
    await PUT(makeRequest({ placement: "42" }), makeParams("VPL-E1"));
    const res = await PUT(makeRequest({ placement: null }), makeParams("VPL-E1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ epicKey: "VPL-E1", placement: null });

    const rows = testDb.select().from(epicMetadata).all();
    expect(rows[0].childPlacement).toBeNull();
  });

  it("preserves an existing color + team assignment when setting a placement", async () => {
    testDb
      .insert(epicMetadata)
      .values({ epicKey: "VPL-E1", color: "#e05252", teams: JSON.stringify(["BT"]) })
      .run();
    await PUT(makeRequest({ placement: "42" }), makeParams("VPL-E1"));

    const rows = testDb.select().from(epicMetadata).all();
    expect(rows[0].childPlacement).toBe("42");
    expect(rows[0].color).toBe("#e05252");
    expect(JSON.parse(rows[0].teams)).toEqual(["BT"]);
  });

  it("rejects an off-shape placement value", async () => {
    const res = await PUT(makeRequest({ placement: "sprint-42" }), makeParams("VPL-E1"));
    expect(res.status).toBe(400);
    expect(await res.json()).toHaveProperty("error");
    expect(testDb.select().from(epicMetadata).all()).toHaveLength(0);
  });

  it("returns 400 for invalid JSON", async () => {
    const req = new Request("http://localhost:3100/api/epics/VPL-E1/placement", {
      method: "PUT",
      body: "not json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await PUT(req, makeParams("VPL-E1"));
    expect(res.status).toBe(400);
  });
});
