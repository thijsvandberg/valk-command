// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, conversation, message, ticketSubtask } from "@/db/schema";
import { eq } from "drizzle-orm";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import { GET, POST } from "./route";

function seedTicket(db: BetterSQLite3Database<typeof schema>, key: string, title = `Ticket ${key}`) {
  db.insert(ticket)
    .values({
      jiraKey: key,
      title,
      status: "TO DO",
      type: "Story",
      priority: "Medium",
      description: "Some description for the ticket",
    })
    .run();
}

function makeParams(key: string): { params: Promise<{ key: string }> } {
  return { params: Promise.resolve({ key }) };
}

describe("POST /api/tickets/[key]/chat", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns 404 for non-existent ticket", async () => {
    const res = await POST(new Request("http://test"), makeParams("NOPE-123"));
    expect(res.status).toBe(404);
  });

  it("creates a new conversation for the ticket", async () => {
    seedTicket(testDb, "VPL-100", "My test ticket");

    const res = await POST(new Request("http://test"), makeParams("VPL-100"));
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(body.title).toContain("Ticket Chat:");
    expect(body.title).toContain("VPL-100");
    expect(body.relatedTicket).toBe("VPL-100");

    // Verify a context message was created
    const msgs = testDb.select().from(message).where(eq(message.conversationId, body.id)).all();
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe("user");
    expect(msgs[0].content).toContain("Ticket Context");
    expect(msgs[0].content).toContain("Some description");
    expect(msgs[0].sequence).toBe(0);
  });

  it("returns existing conversation on second call", async () => {
    seedTicket(testDb, "VPL-200");

    const res1 = await POST(new Request("http://test"), makeParams("VPL-200"));
    const body1 = await res1.json();
    expect(res1.status).toBe(201);

    const res2 = await POST(new Request("http://test"), makeParams("VPL-200"));
    const body2 = await res2.json();
    expect(res2.status).toBe(200);

    expect(body1.id).toBe(body2.id);
  });

  it("includes subtasks in the context message", async () => {
    seedTicket(testDb, "VPL-300");
    testDb.insert(ticketSubtask).values({
      id: "sub-1",
      ticketKey: "VPL-300",
      subtaskKey: "VPL-301",
      title: "Setup database",
      status: "Done",
    }).run();
    testDb.insert(ticketSubtask).values({
      id: "sub-2",
      ticketKey: "VPL-300",
      subtaskKey: "VPL-302",
      title: "Write tests",
      status: "To Do",
    }).run();

    const res = await POST(new Request("http://test"), makeParams("VPL-300"));
    const body = await res.json();

    const msgs = testDb.select().from(message).where(eq(message.conversationId, body.id)).all();
    expect(msgs[0].content).toContain("VPL-301");
    expect(msgs[0].content).toContain("Setup database");
    expect(msgs[0].content).toContain("[x]"); // Done subtask
    expect(msgs[0].content).toContain("[ ]"); // To Do subtask
  });
});

describe("GET /api/tickets/[key]/chat", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns null conversationId when no chat exists", async () => {
    const res = await GET(new Request("http://test"), makeParams("VPL-400"));
    const body = await res.json();
    expect(body.conversationId).toBeNull();
  });

  it("returns conversationId when chat exists", async () => {
    seedTicket(testDb, "VPL-500");

    const createRes = await POST(new Request("http://test"), makeParams("VPL-500"));
    const created = await createRes.json();

    const res = await GET(new Request("http://test"), makeParams("VPL-500"));
    const body = await res.json();
    expect(body.conversationId).toBe(created.id);
  });
});
