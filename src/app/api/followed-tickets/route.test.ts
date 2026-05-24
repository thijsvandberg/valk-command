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
import { followedTicket } from "@/db/schema";

function makeRequest(
  method: string,
  body?: unknown,
  search?: string,
): Request {
  const url = `http://localhost:3100/api/followed-tickets${search ?? ""}`;
  return new Request(url, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
  });
}

describe("GET /api/followed-tickets", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns empty array when nothing is followed", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual([]);
  });

  it("returns list of followed ticket keys", async () => {
    testDb.insert(followedTicket).values({ id: "id-1", ticketKey: "VPL-1" }).run();
    testDb.insert(followedTicket).values({ id: "id-2", ticketKey: "VPL-2" }).run();

    const response = await GET();
    const data = await response.json();
    expect(data).toHaveLength(2);
    expect(data).toContain("VPL-1");
    expect(data).toContain("VPL-2");
  });
});

describe("POST /api/followed-tickets", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("follows a ticket and returns { ticketKey }", async () => {
    const response = await POST(makeRequest("POST", { ticketKey: "VPL-10" }));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ ticketKey: "VPL-10" });
  });

  it("is idempotent: following twice does not error", async () => {
    await POST(makeRequest("POST", { ticketKey: "VPL-10" }));
    const response = await POST(makeRequest("POST", { ticketKey: "VPL-10" }));
    expect(response.status).toBe(200);

    const rows = testDb.select().from(followedTicket).all();
    expect(rows).toHaveLength(1);
  });

  it("returns 400 when ticketKey is missing", async () => {
    const response = await POST(makeRequest("POST", {}));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toHaveProperty("error");
  });

  it("returns 400 when body is invalid JSON", async () => {
    const request = new Request("http://localhost:3100/api/followed-tickets", {
      method: "POST",
      body: "not json",
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("returns 400 when ticketKey exceeds max length", async () => {
    const response = await POST(makeRequest("POST", { ticketKey: "A".repeat(101) }));
    expect(response.status).toBe(400);
  });
});

describe("DELETE /api/followed-tickets", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("unfollows a ticket and returns { ticketKey }", async () => {
    testDb.insert(followedTicket).values({ id: "id-1", ticketKey: "VPL-10" }).run();

    const response = await DELETE(makeRequest("DELETE", undefined, "?ticketKey=VPL-10"));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ ticketKey: "VPL-10" });

    const rows = testDb.select().from(followedTicket).all();
    expect(rows).toHaveLength(0);
  });

  it("returns 400 when ticketKey param is missing", async () => {
    const response = await DELETE(makeRequest("DELETE", undefined, ""));
    expect(response.status).toBe(400);
  });
});
