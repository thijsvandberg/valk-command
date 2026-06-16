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
import { favoriteUser } from "@/db/schema";

function makeRequest(
  method: string,
  body?: unknown,
  search?: string,
): Request {
  const url = `http://localhost:3100/api/settings/favorite-users${search ?? ""}`;
  return new Request(url, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
  });
}

describe("GET /api/settings/favorite-users", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns empty favorites array when none exist", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ favorites: [] });
  });

  it("returns list of favorite display names", async () => {
    testDb.insert(favoriteUser).values({ id: "1", displayName: "Alice" }).run();
    testDb.insert(favoriteUser).values({ id: "2", displayName: "Bob" }).run();

    const res = await GET();
    const data = await res.json();
    expect(data.favorites).toHaveLength(2);
    expect(data.favorites).toContain("Alice");
    expect(data.favorites).toContain("Bob");
  });
});

describe("POST /api/settings/favorite-users", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("adds a favorite and returns { displayName }", async () => {
    const res = await POST(makeRequest("POST", { displayName: "Alice" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ displayName: "Alice" });

    const rows = testDb.select().from(favoriteUser).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].displayName).toBe("Alice");
  });

  it("persists the accountId when provided (BRDG-364)", async () => {
    const res = await POST(makeRequest("POST", { displayName: "Alice", accountId: "acc-alice" }));
    expect(res.status).toBe(200);
    const rows = testDb.select().from(favoriteUser).all();
    expect(rows[0].accountId).toBe("acc-alice");
  });

  it("backfills the accountId on a repeat add once it becomes available", async () => {
    await POST(makeRequest("POST", { displayName: "Alice" }));
    await POST(makeRequest("POST", { displayName: "Alice", accountId: "acc-alice" }));
    const rows = testDb.select().from(favoriteUser).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].accountId).toBe("acc-alice");
  });

  it("is idempotent: adding twice does not create duplicates", async () => {
    await POST(makeRequest("POST", { displayName: "Alice" }));
    const res = await POST(makeRequest("POST", { displayName: "Alice" }));
    expect(res.status).toBe(200);

    const rows = testDb.select().from(favoriteUser).all();
    expect(rows).toHaveLength(1);
  });

  it("returns 400 when displayName is missing", async () => {
    const res = await POST(makeRequest("POST", {}));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data).toHaveProperty("error");
  });

  it("returns 400 for invalid JSON", async () => {
    const req = new Request("http://localhost:3100/api/settings/favorite-users", {
      method: "POST",
      body: "not json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/settings/favorite-users", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("removes a favorite and returns { displayName }", async () => {
    testDb.insert(favoriteUser).values({ id: "1", displayName: "Alice" }).run();

    const res = await DELETE(makeRequest("DELETE", undefined, "?displayName=Alice"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ displayName: "Alice" });

    const rows = testDb.select().from(favoriteUser).all();
    expect(rows).toHaveLength(0);
  });

  it("removes by accountId regardless of the current display name (BRDG-364)", async () => {
    testDb.insert(favoriteUser).values({ id: "1", displayName: "Thijs van den Berg", accountId: "acc-thijs" }).run();

    const res = await DELETE(makeRequest("DELETE", undefined, "?displayName=Thijs%20vd%20Berg&accountId=acc-thijs"));
    expect(res.status).toBe(200);
    const rows = testDb.select().from(favoriteUser).all();
    expect(rows).toHaveLength(0);
  });

  it("returns 400 when neither displayName nor accountId is given", async () => {
    const res = await DELETE(makeRequest("DELETE"));
    expect(res.status).toBe(400);
  });
});
