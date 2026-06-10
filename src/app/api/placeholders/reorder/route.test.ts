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
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn().mockResolvedValue(undefined) }));

import { POST } from "./route";

beforeEach(() => {
  testDb = createTestDb();
  testDb.insert(placeholderTicket).values([
    { id: "PLH-a", title: "A", sprintId: "9", status: "active", orderIndex: 0 },
    { id: "PLH-b", title: "B", sprintId: "9", status: "active", orderIndex: 1 },
    { id: "PLH-c", title: "C", sprintId: "9", status: "active", orderIndex: 2 },
  ]).run();
});

describe("POST /api/placeholders/reorder", () => {
  it("rewrites orderIndex to match the supplied order", async () => {
    const req = new Request("http://localhost/api/placeholders/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: ["PLH-c", "PLH-a", "PLH-b"] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const rows = testDb.select().from(placeholderTicket).all();
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.orderIndex]));
    expect(byId).toEqual({ "PLH-c": 0, "PLH-a": 1, "PLH-b": 2 });
  });

  it("400s on a non-array body", async () => {
    const req = new Request("http://localhost/api/placeholders/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: "nope" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
