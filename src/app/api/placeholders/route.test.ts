// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { placeholderTicket } from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));
vi.mock("@/lib/cache", () => ({ cache: { invalidate: vi.fn() } }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn().mockResolvedValue(undefined) }));

import { GET, POST } from "./route";

beforeEach(() => {
  testDb = createTestDb();
});

function postReq(body: unknown) {
  return new Request("http://localhost/api/placeholders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/placeholders", () => {
  it("creates a placeholder and returns 201 with a PLH- id", async () => {
    const res = await POST(postReq({ title: "Plan ahead", sprintId: "42" }));
    expect(res.status).toBe(201);
    const row = await res.json();
    expect(row.id).toMatch(/^PLH-/);
    expect(row.title).toBe("Plan ahead");
  });

  it("returns 400 when the title is missing", async () => {
    const res = await POST(postReq({ sprintId: "42" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid guestimation", async () => {
    const res = await POST(postReq({ title: "x", guestimation: 4 }));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/placeholders", () => {
  beforeEach(() => {
    testDb.insert(placeholderTicket).values([
      { id: "PLH-a", title: "A", sprintId: "1", epicKey: "EP-1", status: "active" },
      { id: "PLH-b", title: "B", sprintId: "2", epicKey: "EP-1", status: "active" },
      { id: "PLH-c", title: "C", sprintId: "1", epicKey: null, status: "promoted", promotedToKey: "X-1" },
    ]).run();
  });

  it("lists only active placeholders", async () => {
    const res = await GET(new Request("http://localhost/api/placeholders"));
    const rows = await res.json();
    expect(rows.map((r: { id: string }) => r.id).sort()).toEqual(["PLH-a", "PLH-b"]);
  });

  it("filters by sprintId", async () => {
    const res = await GET(new Request("http://localhost/api/placeholders?sprintId=1"));
    const rows = await res.json();
    expect(rows.map((r: { id: string }) => r.id)).toEqual(["PLH-a"]);
  });

  it("filters by epicKey", async () => {
    const res = await GET(new Request("http://localhost/api/placeholders?epicKey=EP-1"));
    const rows = await res.json();
    expect(rows.map((r: { id: string }) => r.id).sort()).toEqual(["PLH-a", "PLH-b"]);
  });
});
