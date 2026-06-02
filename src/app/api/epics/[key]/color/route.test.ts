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

// A real palette base (red) and an off-palette value.
const PALETTE_RED = "#e05252";
const OFF_PALETTE = "#123456";

function makeRequest(body?: unknown): Request {
  return new Request("http://localhost:3100/api/epics/VPL-E1/color", {
    method: "PUT",
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
  });
}

function makeParams(key: string) {
  return { params: Promise.resolve({ key }) };
}

describe("GET /api/epics/[key]/color", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
  });

  it("returns null when the epic has no color", async () => {
    const res = await GET(new Request("http://x"), makeParams("VPL-E1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ epicKey: "VPL-E1", color: null });
  });

  it("returns the stored color", async () => {
    testDb.insert(epicMetadata).values({ epicKey: "VPL-E1", color: PALETTE_RED }).run();
    const res = await GET(new Request("http://x"), makeParams("VPL-E1"));
    expect(await res.json()).toEqual({ epicKey: "VPL-E1", color: PALETTE_RED });
  });
});

describe("PUT /api/epics/[key]/color", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
  });

  it("sets a palette color on an epic", async () => {
    const res = await PUT(makeRequest({ color: PALETTE_RED }), makeParams("VPL-E1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ epicKey: "VPL-E1", color: PALETTE_RED });

    const rows = testDb.select().from(epicMetadata).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].color).toBe(PALETTE_RED);
  });

  it("replaces an existing color on a second PUT", async () => {
    await PUT(makeRequest({ color: PALETTE_RED }), makeParams("VPL-E1"));
    await PUT(makeRequest({ color: "#9b6cd4" }), makeParams("VPL-E1"));

    const rows = testDb.select().from(epicMetadata).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].color).toBe("#9b6cd4");
  });

  it("clears the color with null (reset to default)", async () => {
    await PUT(makeRequest({ color: PALETTE_RED }), makeParams("VPL-E1"));
    const res = await PUT(makeRequest({ color: null }), makeParams("VPL-E1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ epicKey: "VPL-E1", color: null });

    const rows = testDb.select().from(epicMetadata).all();
    expect(rows[0].color).toBeNull();
  });

  it("preserves an existing team assignment when setting a color", async () => {
    testDb.insert(epicMetadata).values({ epicKey: "VPL-E1", teams: JSON.stringify(["BT"]) }).run();
    await PUT(makeRequest({ color: PALETTE_RED }), makeParams("VPL-E1"));

    const rows = testDb.select().from(epicMetadata).all();
    expect(rows[0].color).toBe(PALETTE_RED);
    expect(JSON.parse(rows[0].teams)).toEqual(["BT"]);
  });

  it("rejects an off-palette color", async () => {
    const res = await PUT(makeRequest({ color: OFF_PALETTE }), makeParams("VPL-E1"));
    expect(res.status).toBe(400);
    expect(await res.json()).toHaveProperty("error");
    expect(testDb.select().from(epicMetadata).all()).toHaveLength(0);
  });

  it("invalidates the progress cache on write", async () => {
    await PUT(makeRequest({ color: PALETTE_RED }), makeParams("VPL-E1"));
    expect(mockCache.invalidate).toHaveBeenCalledWith("/api/epics/progress");
  });

  it("returns 400 for invalid JSON", async () => {
    const req = new Request("http://localhost:3100/api/epics/VPL-E1/color", {
      method: "PUT",
      body: "not json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await PUT(req, makeParams("VPL-E1"));
    expect(res.status).toBe(400);
  });
});
