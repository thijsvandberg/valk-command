// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import {
  seedTicket,
  seedTicketMetadata,
  seedStoryWriterSession,
  seedConversation,
  seedMessage,
} from "@/test/builders";
import { storyWriterSession } from "@/db/schema";
import { eq } from "drizzle-orm";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn().mockReturnValue(null) }));

import { GET, DELETE } from "./route";

function deleteRequest(sessionId?: string): Request {
  const url = sessionId
    ? `http://localhost:3100/api/story-writer/active-sessions?sessionId=${sessionId}`
    : "http://localhost:3100/api/story-writer/active-sessions";
  return new Request(url, { method: "DELETE" });
}

describe("GET /api/story-writer/active-sessions", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns empty array when no active sessions exist", async () => {
    const res = await GET();
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data).toEqual([]);
  });

  it("returns sessions with ticket data joined", async () => {
    seedTicket(testDb, { jiraKey: "VPL-100", title: "Test ticket", sprintName: "Sprint 5", epic: "My Epic", epicKey: "VPL-E1", type: "story", status: "IN PROGRESS" });
    seedTicketMetadata(testDb, { jiraKey: "VPL-100", readiness: "ready" });
    const conv = seedConversation(testDb, { id: "conv-1" });
    seedMessage(testDb, { conversationId: conv.id });
    seedStoryWriterSession(testDb, {
      id: "sess-1",
      ticketKey: "VPL-100",
      conversationId: conv.id,
      status: "active",
    });

    const res = await GET();
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].ticketKey).toBe("VPL-100");
    expect(data[0].title).toBe("Test ticket");
    expect(data[0].sprintName).toBe("Sprint 5");
    expect(data[0].readiness).toBe("ready");
  });

  it("filters out sessions without messages", async () => {
    seedTicket(testDb, { jiraKey: "VPL-100" });
    const conv = seedConversation(testDb, { id: "conv-no-msg" });
    seedStoryWriterSession(testDb, {
      id: "sess-empty",
      ticketKey: "VPL-100",
      conversationId: conv.id,
      status: "active",
    });

    const res = await GET();
    const data = await res.json();
    expect(data).toEqual([]);
  });

  it("includes targetTitle via subquery", async () => {
    seedTicket(testDb, { jiraKey: "VPL-100", title: "Source" });
    seedTicket(testDb, { jiraKey: "VPL-200", title: "Target ticket" });
    const conv = seedConversation(testDb, { id: "conv-2" });
    seedMessage(testDb, { conversationId: conv.id });
    seedStoryWriterSession(testDb, {
      id: "sess-2",
      ticketKey: "VPL-100",
      conversationId: conv.id,
      status: "active",
      targetTicketKey: "VPL-200",
    });

    const res = await GET();
    const data = await res.json();
    expect(data[0].targetTicketKey).toBe("VPL-200");
    expect(data[0].targetTitle).toBe("Target ticket");
  });
});

describe("DELETE /api/story-writer/active-sessions", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns 400 when sessionId is missing", async () => {
    const res = await DELETE(deleteRequest());
    expect(res.status).toBe(400);
  });

  it("sets session status to discarded", async () => {
    seedTicket(testDb, { jiraKey: "VPL-100" });
    const conv = seedConversation(testDb, { id: "conv-del" });
    seedStoryWriterSession(testDb, {
      id: "sess-del",
      ticketKey: "VPL-100",
      conversationId: conv.id,
      status: "active",
    });

    const res = await DELETE(deleteRequest("sess-del"));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);

    const row = testDb.select().from(storyWriterSession).where(eq(storyWriterSession.id, "sess-del")).get();
    expect(row?.status).toBe("discarded");
  });
});
