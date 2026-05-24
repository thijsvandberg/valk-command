// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, conversation, message, ticketSubtask } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

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

  it("creates a new conversation without injecting messages", async () => {
    seedTicket(testDb, "VPL-100", "My test ticket");

    const res = await POST(new Request("http://test"), makeParams("VPL-100"));
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(body.title).toContain("Ticket Chat:");
    expect(body.title).toContain("VPL-100");
    expect(body.relatedTicket).toBe("VPL-100");
    expect(body.ticketContext).toBeDefined();
    expect(body.ticketContext).toContain("Some description");

    // No messages should be injected (conversation stays hidden in chat list)
    const msgs = testDb.select().from(message).where(eq(message.conversationId, body.id)).all();
    expect(msgs).toHaveLength(0);
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

  it("reuses existing Story Writer conversation for the same ticket", async () => {
    seedTicket(testDb, "VPL-300");

    // Simulate Story Writer creating a conversation first
    const swConvId = randomUUID();
    testDb.insert(conversation).values({
      id: swConvId,
      title: "Story Writer: VPL-300",
      relatedTicket: "VPL-300",
    }).run();

    const res = await POST(new Request("http://test"), makeParams("VPL-300"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.id).toBe(swConvId);
  });

  it("includes subtasks in ticket context", async () => {
    seedTicket(testDb, "VPL-400");
    testDb.insert(ticketSubtask).values({
      id: "sub-1",
      ticketKey: "VPL-400",
      subtaskKey: "VPL-401",
      title: "Setup database",
      status: "Done",
    }).run();

    const res = await POST(new Request("http://test"), makeParams("VPL-400"));
    const body = await res.json();

    expect(body.ticketContext).toContain("VPL-401");
    expect(body.ticketContext).toContain("Setup database");
    expect(body.ticketContext).toContain("[x]");
  });
});

describe("GET /api/tickets/[key]/chat", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns null conversationId when no chat exists", async () => {
    const res = await GET(new Request("http://test"), makeParams("VPL-500"));
    const body = await res.json();
    expect(body.conversationId).toBeNull();
  });

  it("returns conversationId when chat exists", async () => {
    seedTicket(testDb, "VPL-600");

    const createRes = await POST(new Request("http://test"), makeParams("VPL-600"));
    const created = await createRes.json();

    const res = await GET(new Request("http://test"), makeParams("VPL-600"));
    const body = await res.json();
    expect(body.conversationId).toBe(created.id);
  });
});
