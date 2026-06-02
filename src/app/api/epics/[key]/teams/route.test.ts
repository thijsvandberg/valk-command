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

const mockCache = vi.hoisted(() => ({
  get: vi.fn().mockReturnValue(null),
  set: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock("@/lib/cache", () => ({ cache: mockCache }));

import { GET, PUT } from "./route";
import { epicMetadata } from "@/db/schema";

function makeRequest(body?: unknown): Request {
  return new Request("http://localhost:3100/api/epics/VPL-E1/teams", {
    method: "PUT",
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
  });
}

function makeParams(key: string) {
  return { params: Promise.resolve({ key }) };
}

describe("GET /api/epics/[key]/teams", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
  });

  it("returns an empty array when the epic has no metadata", async () => {
    const res = await GET(new Request("http://x"), makeParams("VPL-E1"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ epicKey: "VPL-E1", teams: [] });
  });

  it("returns the stored teams", async () => {
    testDb.insert(epicMetadata).values({ epicKey: "VPL-E1", teams: JSON.stringify(["BT", "GXP"]) }).run();
    const res = await GET(new Request("http://x"), makeParams("VPL-E1"));
    const data = await res.json();
    expect(data.teams).toEqual(["BT", "GXP"]);
  });
});

describe("PUT /api/epics/[key]/teams", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
  });

  it("assigns teams to an epic", async () => {
    const res = await PUT(makeRequest({ teams: ["BT", "BM"] }), makeParams("VPL-E1"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ epicKey: "VPL-E1", teams: ["BM", "BT"] });

    const rows = testDb.select().from(epicMetadata).all();
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].teams)).toEqual(["BM", "BT"]);
  });

  it("replaces existing teams on a second PUT", async () => {
    await PUT(makeRequest({ teams: ["BT", "BM"] }), makeParams("VPL-E1"));
    await PUT(makeRequest({ teams: ["GXP"] }), makeParams("VPL-E1"));

    const rows = testDb.select().from(epicMetadata).all();
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].teams)).toEqual(["GXP"]);
  });

  it("clears the assignment with an empty array", async () => {
    await PUT(makeRequest({ teams: ["BT"] }), makeParams("VPL-E1"));
    const res = await PUT(makeRequest({ teams: [] }), makeParams("VPL-E1"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.teams).toEqual([]);

    const rows = testDb.select().from(epicMetadata).all();
    expect(JSON.parse(rows[0].teams)).toEqual([]);
  });

  it("invalidates the progress cache on write", async () => {
    await PUT(makeRequest({ teams: ["BT"] }), makeParams("VPL-E1"));
    expect(mockCache.invalidate).toHaveBeenCalledWith("/api/epics/progress");
  });

  it("rejects unknown team codes", async () => {
    const res = await PUT(makeRequest({ teams: ["INVALID"] }), makeParams("VPL-E1"));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data).toHaveProperty("error");
  });

  it("returns 400 for invalid JSON", async () => {
    const req = new Request("http://localhost:3100/api/epics/VPL-E1/teams", {
      method: "PUT",
      body: "not json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await PUT(req, makeParams("VPL-E1"));
    expect(res.status).toBe(400);
  });
});
