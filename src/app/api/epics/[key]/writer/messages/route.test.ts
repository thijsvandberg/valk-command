// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { seedTicket, seedConversation, seedStoryWriterSession, seedMessage } from "@/test/builders";
import { epicChildDraft, message, storyWriterSession } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { DELETE } from "./route";

function makeParams(key: string): { params: Promise<{ key: string }> } {
  return { params: Promise.resolve({ key }) };
}

function clearReq(key: string) {
  return new Request(`http://localhost:3100/api/epics/${key}/writer/messages?all=true`, { method: "DELETE" });
}

function seedEpicSession(key: string, sessionId: string) {
  seedTicket(testDb, { jiraKey: key, type: "epic", title: "Epic" });
  const conv = seedConversation(testDb, { id: `conv-${sessionId}` });
  seedStoryWriterSession(testDb, {
    id: sessionId,
    ticketKey: key,
    conversationId: conv.id,
    status: "active",
    mode: "epic",
    phase: "breakdown",
    localDraft: "Worked-out epic body",
  });
  return conv.id;
}

describe("DELETE /api/epics/[key]/writer/messages", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("clears the conversation (BRDG-489) but keeps the session, draft, and breakdown cards", async () => {
    const convId = seedEpicSession("VPL-E1", "sess-e1");
    seedMessage(testDb, { conversationId: convId, role: "user", content: "hi", status: "sent" });
    seedMessage(testDb, { conversationId: convId, role: "assistant", content: "hello", status: "sent" });
    testDb.insert(epicChildDraft).values({
      id: randomUUID(),
      sessionId: "sess-e1",
      cardIndex: 0,
      title: "Child card",
      bullets: ["a bullet"],
      status: "draft",
      suggestedLinks: [],
    }).run();

    const res = await DELETE(clearReq("VPL-E1"), makeParams("VPL-E1"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.deleted).toBe(2);
    expect(testDb.select().from(message).where(eq(message.conversationId, convId)).all()).toHaveLength(0);

    // Session + its localDraft survive.
    const session = testDb.select().from(storyWriterSession).where(eq(storyWriterSession.id, "sess-e1")).get();
    expect(session?.status).toBe("active");
    expect(session?.localDraft).toBe("Worked-out epic body");

    // Breakdown cards survive.
    const cards = testDb.select().from(epicChildDraft).where(eq(epicChildDraft.sessionId, "sess-e1")).all();
    expect(cards).toHaveLength(1);
    expect(cards[0].title).toBe("Child card");
  });

  it("returns 400 when neither id nor all is given", async () => {
    seedEpicSession("VPL-E1", "sess-e1");
    const res = await DELETE(
      new Request("http://localhost:3100/api/epics/VPL-E1/writer/messages", { method: "DELETE" }),
      makeParams("VPL-E1"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when no active epic session exists", async () => {
    seedTicket(testDb, { jiraKey: "VPL-E2", type: "epic", title: "Epic" });
    const res = await DELETE(clearReq("VPL-E2"), makeParams("VPL-E2"));
    expect(res.status).toBe(404);
  });
});
