import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket } from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import { GET, PUT } from "./route";

function seedTicket(db: BetterSQLite3Database<typeof schema>, key: string) {
  db.insert(ticket).values({ jiraKey: key, title: `Ticket ${key}`, status: "TO DO" }).run();
}

function makeParams(key: string): { params: Promise<{ key: string }> } {
  return { params: Promise.resolve({ key }) };
}

function putRequest(key: string, body: unknown): Request {
  return new Request(`http://localhost:3100/api/tickets/${key}/local-edits`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getRequest(key: string): Request {
  return new Request(`http://localhost:3100/api/tickets/${key}/local-edits`);
}

describe("GET /api/tickets/[key]/local-edits", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns empty array when no edits exist", async () => {
    const res = await GET(getRequest("VPL-100"), makeParams("VPL-100"));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data).toEqual([]);
  });
});

describe("PUT /api/tickets/[key]/local-edits", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("creates a title edit", async () => {
    seedTicket(testDb, "VPL-100");
    const res = await PUT(
      putRequest("VPL-100", { field: "title", localValue: "New title" }),
      makeParams("VPL-100"),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.field).toBe("title");
    expect(data.localValue).toBe("New title");
    expect(data.ticketKey).toBe("VPL-100");
  });

  it("creates a description edit", async () => {
    seedTicket(testDb, "VPL-100");
    const res = await PUT(
      putRequest("VPL-100", { field: "description", localValue: "New description" }),
      makeParams("VPL-100"),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.field).toBe("description");
    expect(data.localValue).toBe("New description");
  });

  it("updates an existing edit for the same field", async () => {
    seedTicket(testDb, "VPL-100");
    await PUT(
      putRequest("VPL-100", { field: "title", localValue: "First" }),
      makeParams("VPL-100"),
    );
    const res = await PUT(
      putRequest("VPL-100", { field: "title", localValue: "Updated" }),
      makeParams("VPL-100"),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.localValue).toBe("Updated");

    const getRes = await GET(getRequest("VPL-100"), makeParams("VPL-100"));
    const all = await getRes.json();
    expect(all).toHaveLength(1);
  });

  it("rejects invalid field", async () => {
    const res = await PUT(
      putRequest("VPL-100", { field: "invalid", localValue: "test" }),
      makeParams("VPL-100"),
    );
    expect(res.status).toBe(400);
  });

  it("rejects non-string localValue", async () => {
    const res = await PUT(
      putRequest("VPL-100", { field: "title", localValue: 123 }),
      makeParams("VPL-100"),
    );
    expect(res.status).toBe(400);
  });
});
