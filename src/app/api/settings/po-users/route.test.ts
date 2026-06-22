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

import { GET, POST, DELETE } from "./route";
import { poUser } from "@/db/schema";

function makeRequest(
  method: string,
  body?: unknown,
  search?: string,
): Request {
  const url = `http://localhost:3100/api/settings/po-users${search ?? ""}`;
  return new Request(url, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
  });
}

describe("GET /api/settings/po-users", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns empty arrays when none exist", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ pos: [], accountIds: [] });
  });

  it("returns display names and the captured accountIds", async () => {
    testDb.insert(poUser).values({ id: "1", displayName: "Alice", accountId: "acc-alice" }).run();
    testDb.insert(poUser).values({ id: "2", displayName: "Bob" }).run();

    const res = await GET();
    const data = await res.json();
    expect(data.pos).toHaveLength(2);
    expect(data.pos).toContain("Alice");
    expect(data.pos).toContain("Bob");
    // accountIds only carry the rows that have one (Bob has none).
    expect(data.accountIds).toEqual(["acc-alice"]);
  });
});

describe("POST /api/settings/po-users", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("flags a PO and returns { displayName }", async () => {
    const res = await POST(makeRequest("POST", { displayName: "Alice" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ displayName: "Alice" });

    const rows = testDb.select().from(poUser).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].displayName).toBe("Alice");
  });

  it("persists the accountId when provided (keyed on accountId)", async () => {
    const res = await POST(makeRequest("POST", { displayName: "Alice", accountId: "acc-alice" }));
    expect(res.status).toBe(200);
    const rows = testDb.select().from(poUser).all();
    expect(rows[0].accountId).toBe("acc-alice");
  });

  it("backfills the accountId on a repeat add once it becomes available", async () => {
    await POST(makeRequest("POST", { displayName: "Alice" }));
    await POST(makeRequest("POST", { displayName: "Alice", accountId: "acc-alice" }));
    const rows = testDb.select().from(poUser).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].accountId).toBe("acc-alice");
  });

  it("is idempotent: flagging twice does not create duplicates", async () => {
    await POST(makeRequest("POST", { displayName: "Alice" }));
    const res = await POST(makeRequest("POST", { displayName: "Alice" }));
    expect(res.status).toBe(200);

    const rows = testDb.select().from(poUser).all();
    expect(rows).toHaveLength(1);
  });

  it("returns 400 when displayName is missing", async () => {
    const res = await POST(makeRequest("POST", {}));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data).toHaveProperty("error");
  });
});

describe("DELETE /api/settings/po-users", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("unflags a PO and returns { displayName }", async () => {
    testDb.insert(poUser).values({ id: "1", displayName: "Alice" }).run();

    const res = await DELETE(makeRequest("DELETE", undefined, "?displayName=Alice"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ displayName: "Alice" });

    const rows = testDb.select().from(poUser).all();
    expect(rows).toHaveLength(0);
  });

  it("removes by accountId regardless of the current display name", async () => {
    testDb.insert(poUser).values({ id: "1", displayName: "Thijs van den Berg", accountId: "acc-thijs" }).run();

    const res = await DELETE(makeRequest("DELETE", undefined, "?displayName=Thijs%20vd%20Berg&accountId=acc-thijs"));
    expect(res.status).toBe(200);
    const rows = testDb.select().from(poUser).all();
    expect(rows).toHaveLength(0);
  });

  it("returns 400 when neither displayName nor accountId is given", async () => {
    const res = await DELETE(makeRequest("DELETE"));
    expect(res.status).toBe(400);
  });
});
