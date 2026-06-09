// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import {
  seedTicket,
  seedTicketMetadata,
  seedTicketSubtask,
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

  it("returns the board-row fields the table needs (BRDG-325)", async () => {
    seedTicket(testDb, {
      jiraKey: "VPL-300",
      title: "Rich ticket",
      type: "story",
      status: "IN PROGRESS",
      storyPoints: 5,
      assignee: "Jane Doe",
      flagged: true,
    });
    seedTicketMetadata(testDb, {
      jiraKey: "VPL-300",
      businessValue: 4,
      qualityScore: 80,
      guestimation: 3,
      poNotes: "Some notes",
    });
    const conv = seedConversation(testDb, { id: "conv-rich" });
    seedMessage(testDb, { conversationId: conv.id });
    seedStoryWriterSession(testDb, {
      id: "sess-rich",
      ticketKey: "VPL-300",
      conversationId: conv.id,
      status: "active",
    });

    const res = await GET();
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].storyPoints).toBe(5);
    expect(data[0].businessValue).toBe(4);
    expect(data[0].qualityScore).toBe(80);
    expect(data[0].guestimation).toBe(3);
    expect(data[0].flagged).toBe(true);
    expect(data[0].notes).toBe("Some notes");
    // Assignee is returned as the built display shape, not a bare name string.
    expect(data[0].assignee).toMatchObject({ name: "Jane Doe" });
    expect(typeof data[0].assignee.initials).toBe("string");
  });

  it("includes open/total subtask counts (BRDG-325)", async () => {
    seedTicket(testDb, { jiraKey: "VPL-400", title: "Parent" });
    seedTicketSubtask(testDb, { ticketKey: "VPL-400", subtaskKey: "VPL-401", status: "DONE" });
    seedTicketSubtask(testDb, { ticketKey: "VPL-400", subtaskKey: "VPL-402", status: "TO DO" });
    seedTicketSubtask(testDb, { ticketKey: "VPL-400", subtaskKey: "VPL-403", status: "IN PROGRESS" });
    const conv = seedConversation(testDb, { id: "conv-sub" });
    seedMessage(testDb, { conversationId: conv.id });
    seedStoryWriterSession(testDb, {
      id: "sess-sub",
      ticketKey: "VPL-400",
      conversationId: conv.id,
      status: "active",
    });

    const res = await GET();
    const data = await res.json();
    expect(data[0].totalSubtaskCount).toBe(3);
    expect(data[0].openSubtaskCount).toBe(2);
  });

  it("does not strike through removed-from-Jira tickets — exposes removedFromJira but no pill change", async () => {
    seedTicket(testDb, { jiraKey: "VPL-500", title: "Removed", removedFromJiraAt: "2026-01-01T00:00:00Z" });
    const conv = seedConversation(testDb, { id: "conv-rm" });
    seedMessage(testDb, { conversationId: conv.id });
    seedStoryWriterSession(testDb, {
      id: "sess-rm",
      ticketKey: "VPL-500",
      conversationId: conv.id,
      status: "active",
    });

    const res = await GET();
    const data = await res.json();
    expect(data[0].removedFromJira).toBe(true);
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
