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

vi.mock("@/lib/notifications", () => ({
  createNotification: vi.fn(),
}));

import { GET, POST, PATCH, DELETE } from "./route";
import { alert } from "@/db/schema";

function makeRequest(method: string, body?: unknown, search?: string): Request {
  const url = `http://localhost:3100/api/notifications${search ?? ""}`;
  return new Request(url, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
  });
}

function insertAlert(id: string, read = false, createdAt?: string) {
  testDb.insert(alert).values({
    id,
    type: "sync",
    message: `Alert ${id}`,
    read,
    createdAt: createdAt ?? new Date().toISOString(),
  }).run();
}

describe("GET /api/notifications", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns empty notifications list", async () => {
    const response = await GET(makeRequest("GET"));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.notifications).toEqual([]);
    expect(data.unreadCount).toBe(0);
    expect(data.totalCount).toBe(0);
  });

  it("returns all notifications with counts", async () => {
    insertAlert("a1", false);
    insertAlert("a2", true);

    const response = await GET(makeRequest("GET"));
    const data = await response.json();
    expect(data.notifications).toHaveLength(2);
    expect(data.unreadCount).toBe(1);
    expect(data.totalCount).toBe(2);
  });

  it("filters to unread only when unread=true", async () => {
    insertAlert("a1", false);
    insertAlert("a2", true);

    const response = await GET(makeRequest("GET", undefined, "?unread=true"));
    const data = await response.json();
    expect(data.notifications).toHaveLength(1);
    expect(data.notifications[0].id).toBe("a1");
  });

  it("respects limit parameter", async () => {
    for (let i = 0; i < 5; i++) insertAlert(`a${i}`);

    const response = await GET(makeRequest("GET", undefined, "?limit=2"));
    const data = await response.json();
    expect(data.notifications).toHaveLength(2);
  });
});

describe("POST /api/notifications", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns 201 with { type, message } when valid", async () => {
    const response = await POST(makeRequest("POST", { type: "sync", message: "Sync complete" }));
    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data).toEqual({ type: "sync", message: "Sync complete" });
  });

  it("returns 400 when type is missing", async () => {
    const response = await POST(makeRequest("POST", { message: "no type" }));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toHaveProperty("error");
  });

  it("returns 400 when message is missing", async () => {
    const response = await POST(makeRequest("POST", { type: "sync" }));
    expect(response.status).toBe(400);
  });

  it("returns 400 when body is invalid JSON", async () => {
    const request = new Request("http://localhost:3100/api/notifications", {
      method: "POST",
      body: "not json",
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});

describe("PATCH /api/notifications", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("marks all unread as read with { markAll: true }", async () => {
    insertAlert("a1", false);
    insertAlert("a2", false);

    const response = await PATCH(makeRequest("PATCH", { markAll: true }));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ marked: "all" });

    const rows = testDb.select().from(alert).all();
    expect(rows.every((r) => r.read)).toBe(true);
  });

  it("marks specific ids as read with { ids: [...] }", async () => {
    insertAlert("a1", false);
    insertAlert("a2", false);

    const response = await PATCH(makeRequest("PATCH", { ids: ["a1"] }));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ marked: 1 });

    const rows = testDb.select().from(alert).all();
    const a1 = rows.find((r) => r.id === "a1");
    const a2 = rows.find((r) => r.id === "a2");
    expect(a1?.read).toBe(true);
    expect(a2?.read).toBe(false);
  });

  it("marks single notification as read with { id }", async () => {
    insertAlert("a1", false);

    const response = await PATCH(makeRequest("PATCH", { id: "a1" }));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ marked: "a1" });
  });

  it("returns 400 when body is invalid", async () => {
    const response = await PATCH(makeRequest("PATCH", { unknown: true }));
    expect(response.status).toBe(400);
  });
});

describe("DELETE /api/notifications", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("deletes a single notification by ?id=", async () => {
    insertAlert("a1");

    const response = await DELETE(makeRequest("DELETE", undefined, "?id=a1"));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ status: "dismissed" });

    const rows = testDb.select().from(alert).all();
    expect(rows).toHaveLength(0);
  });

  it("batch-deletes read notifications by ?ids=", async () => {
    insertAlert("a1", true);
    insertAlert("a2", true);
    insertAlert("a3", false);

    const response = await DELETE(makeRequest("DELETE", undefined, "?ids=a1,a2"));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ status: "batch_dismissed" });

    const rows = testDb.select().from(alert).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("a3");
  });

  it("clears all read notifications when no params given", async () => {
    insertAlert("a1", true);
    insertAlert("a2", false);

    const response = await DELETE(makeRequest("DELETE"));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ status: "cleared_read" });

    const rows = testDb.select().from(alert).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("a2");
  });
});
