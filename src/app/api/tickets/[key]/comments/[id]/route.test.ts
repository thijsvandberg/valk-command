// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { poComment, ticket } from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

function seedTicket(db: BetterSQLite3Database<typeof schema>, key: string) {
  db.insert(ticket).values({ jiraKey: key, title: `Ticket ${key}`, status: "TO DO" }).run();
}

import { DELETE } from "./route";

function makeParams(key: string, id: string): { params: Promise<{ key: string; id: string }> } {
  return { params: Promise.resolve({ key, id }) };
}

function deleteRequest(key: string, id: string): Request {
  return new Request(`http://localhost:3100/api/tickets/${key}/comments/${id}`, {
    method: "DELETE",
  });
}

describe("DELETE /api/tickets/[key]/comments/[id]", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("deletes an existing comment", async () => {
    seedTicket(testDb, "VPL-100");
    testDb.insert(poComment).values({
      id: "comment-1",
      ticketKey: "VPL-100",
      author: "PO",
      content: "A comment",
      createdAt: new Date().toISOString(),
    }).run();

    const res = await DELETE(
      deleteRequest("VPL-100", "comment-1"),
      makeParams("VPL-100", "comment-1"),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it("returns 404 for non-existent comment", async () => {
    const res = await DELETE(
      deleteRequest("VPL-100", "nonexistent"),
      makeParams("VPL-100", "nonexistent"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when comment belongs to different ticket", async () => {
    seedTicket(testDb, "VPL-200");
    testDb.insert(poComment).values({
      id: "comment-2",
      ticketKey: "VPL-200",
      author: "PO",
      content: "Another comment",
      createdAt: new Date().toISOString(),
    }).run();

    const res = await DELETE(
      deleteRequest("VPL-100", "comment-2"),
      makeParams("VPL-100", "comment-2"),
    );
    expect(res.status).toBe(404);
  });
});
