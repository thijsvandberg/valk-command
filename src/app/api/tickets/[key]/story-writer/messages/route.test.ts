// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, conversation, storyWriterSession, storyWriterDraft, message } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn(),
}));

vi.mock("server-only", () => ({}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

vi.mock("@/lib/agent-proxy", () => ({
  agentUrl: (path: string) => `http://agent:3001${path}`,
  agentHeaders: () => ({ Authorization: "Bearer test", "Content-Type": "application/json" }),
}));

import { POST, DELETE } from "./route";

function makeParams(key: string) {
  return { params: Promise.resolve({ key }) };
}

function makeRequest(key: string, body: Record<string, unknown>) {
  return new Request(`http://localhost:3100/api/tickets/${key}/story-writer/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function seedSession(db: BetterSQLite3Database<typeof schema>, key: string, opts?: { withAssistantMessage?: boolean }) {
  const convId = randomUUID();
  const sessionId = randomUUID();

  db.insert(ticket).values({
    jiraKey: key,
    title: `Ticket ${key}`,
    status: "TO DO",
    description: "Existing Jira description",
  }).run();
  db.insert(conversation).values({ id: convId, title: `Story Writer: ${key}`, relatedTicket: key }).run();
  db.insert(storyWriterSession).values({
    id: sessionId,
    ticketKey: key,
    conversationId: convId,
    status: "active",
    localDraft: "Current local draft",
  }).run();

  if (opts?.withAssistantMessage) {
    db.insert(message).values({
      id: randomUUID(),
      conversationId: convId,
      role: "assistant",
      content: "Previous assistant response",
    }).run();
  }

  return { convId, sessionId };
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/tickets/[key]/story-writer/messages", () => {
  beforeEach(() => {
    testDb = createTestDb();
    mockFetch.mockReset();
  });

  it("sends first message as skill invocation", async () => {
    seedSession(testDb, "VPL-100");
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: "task_abc" }, 201));

    const res = await POST(
      makeRequest("VPL-100", { content: "Improve the acceptance criteria" }),
      makeParams("VPL-100"),
    );
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.isFirstMessage).toBe(true);
    expect(data.taskId).toBe("task_abc");
    expect(data.streamUrl).toBe("/api/workspace-tasks/task_abc/stream");

    // Verify skill invocation was sent to agent
    const fetchCall = mockFetch.mock.calls[0];
    expect(fetchCall[0]).toBe("http://agent:3001/api/tasks");
    const body = JSON.parse(fetchCall[1].body);
    expect(body.skill).toBe("write-story-draft");
    expect(body.args.args).toContain("Improve the acceptance criteria");
    // The editor draft is the source of truth and wins over the Jira-synced
    // description on the first message (see fix: send editor draft as current
    // description on first story-writer message).
    expect(body.args.args).toContain("Current local draft");
    expect(body.args.args).toContain("[codebase-research: off]");
  });

  it("sends follow-up as conversation message", async () => {
    seedSession(testDb, "VPL-100", { withAssistantMessage: true });
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: "task_def" }, 201));

    const res = await POST(
      makeRequest("VPL-100", { content: "Make the scope more specific" }),
      makeParams("VPL-100"),
    );
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.isFirstMessage).toBe(false);

    // Verify conversation endpoint was called (not skill endpoint)
    const fetchCall = mockFetch.mock.calls[0];
    expect(fetchCall[0]).toContain("/api/conversations/");
    expect(fetchCall[0]).toContain("/messages");
    const body = JSON.parse(fetchCall[1].body);
    expect(body.content).toContain("Make the scope more specific");
    expect(body.content).toContain("[codebase-research: off]");
  });

  it("saves user message to database", async () => {
    const { convId } = seedSession(testDb, "VPL-100");
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: "task_abc" }, 201));

    await POST(
      makeRequest("VPL-100", { content: "Test message" }),
      makeParams("VPL-100"),
    );

    const messages = testDb
      .select()
      .from(message)
      .where(eq(message.conversationId, convId))
      .all();

    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toBe("Test message");
  });

  it("recovers on 410 from workspace", async () => {
    seedSession(testDb, "VPL-100", { withAssistantMessage: true });

    // First call returns 410 (session lost)
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: "session_expired" }, 410));
    // Recovery call succeeds
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: "task_recovered" }, 201));

    const res = await POST(
      makeRequest("VPL-100", { content: "Continue working" }),
      makeParams("VPL-100"),
    );
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.recovered).toBe(true);
    expect(data.taskId).toBe("task_recovered");

    // Verify recovery sent a skill invocation with context
    const recoverCall = mockFetch.mock.calls[1];
    expect(recoverCall[0]).toBe("http://agent:3001/api/tasks");
    const body = JSON.parse(recoverCall[1].body);
    expect(body.skill).toBe("write-story-draft");
    expect(body.args.args).toContain("Session recovery");
    expect(body.args.args).toContain("Current local draft");
    expect(body.args.args).toContain("Continue working");
  });

  it("returns 404 when no active session", async () => {
    testDb.insert(ticket).values({ jiraKey: "VPL-999", title: "T", status: "TO DO" }).run();

    const res = await POST(
      makeRequest("VPL-999", { content: "test" }),
      makeParams("VPL-999"),
    );

    expect(res.status).toBe(404);
  });

  it("returns 400 when content is empty", async () => {
    seedSession(testDb, "VPL-100");

    const res = await POST(
      makeRequest("VPL-100", { content: "" }),
      makeParams("VPL-100"),
    );

    expect(res.status).toBe(400);
  });

  it("returns 502 when agent is unreachable", async () => {
    const { convId } = seedSession(testDb, "VPL-100");
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const res = await POST(
      makeRequest("VPL-100", { content: "test" }),
      makeParams("VPL-100"),
    );

    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.code).toBe("UNREACHABLE");

    // The error body carries the persisted failed message id so the client
    // can reconcile its optimistic temp id (BRDG-459).
    const msgs = testDb.select().from(message).where(eq(message.conversationId, convId)).all();
    const failedMsg = msgs.find((m) => m.role === "user");
    expect(failedMsg?.status).toBe("failed");
    expect(data.messageId).toBe(failedMsg?.id);
  });

  describe("follow-up prompt optimization (BRDG-197)", () => {
    it("includes full draft and instructions for edit-intent follow-ups", async () => {
      seedSession(testDb, "VPL-100", { withAssistantMessage: true });
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: "task_edit" }, 201));

      await POST(
        makeRequest("VPL-100", { content: "improve the acceptance criteria" }),
        makeParams("VPL-100"),
      );

      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.content).toContain("[Current story draft]");
      expect(body.content).toContain("Current local draft");
      expect(body.content).toContain("[Remember:");
    });

    it("omits draft and shortens instructions for simple questions", async () => {
      seedSession(testDb, "VPL-100", { withAssistantMessage: true });
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: "task_q" }, 201));

      await POST(
        makeRequest("VPL-100", { content: "what is the ticket key?" }),
        makeParams("VPL-100"),
      );

      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.content).not.toContain("[Current story draft]");
      expect(body.content).not.toContain("[Remember:");
      expect(body.content).toContain("what is the ticket key?");
      expect(body.content).toContain("[If your answer requires editing the story");
    });
  });

  describe("match-epic skill routing", () => {
    function seedWithEpics(db: BetterSQLite3Database<typeof schema>, key: string) {
      const { convId, sessionId } = seedSession(db, key);
      db.insert(ticket).values({ jiraKey: "VPL-EPIC-1", title: "Auth Epic", status: "TO DO", type: "epic", summary: "Auth features" }).run();
      db.insert(ticket).values({ jiraKey: "VPL-EPIC-2", title: "Booking Epic", status: "TO DO", type: "epic", summary: "Booking features" }).run();
      return { convId, sessionId };
    }

    it("routes match-epic to suggest-epic skill with epic context", async () => {
      const { convId } = seedWithEpics(testDb, "VPL-100");
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: "task_epic" }, 201));

      const res = await POST(
        makeRequest("VPL-100", { content: "Suggest the best epic", skill: "match-epic" }),
        makeParams("VPL-100"),
      );
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.taskId).toBe("task_epic");

      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[0]).toBe("http://agent:3001/api/tasks");
      const body = JSON.parse(fetchCall[1].body);
      expect(body.skill).toBe("suggest-epic");
      expect(body.conversationId).toBe(convId);
      expect(body.args.ticketKey).toBe("VPL-100");
      expect(body.args.ticketTitle).toBe("Ticket VPL-100");
      const epics = JSON.parse(body.args.epics);
      expect(epics).toHaveLength(2);
      expect(epics.map((e: { key: string }) => e.key).sort()).toEqual(["VPL-EPIC-1", "VPL-EPIC-2"]);
    });

    it("returns 404 when no epics exist", async () => {
      seedSession(testDb, "VPL-100");

      const res = await POST(
        makeRequest("VPL-100", { content: "Suggest the best epic", skill: "match-epic" }),
        makeParams("VPL-100"),
      );

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe("No epics available");
    });

    it("marks message as failed when agent returns error", async () => {
      const { convId } = seedWithEpics(testDb, "VPL-100");
      mockFetch.mockResolvedValueOnce(jsonResponse({ error: "Agent error", code: "AGENT_ERROR" }, 502));

      const res = await POST(
        makeRequest("VPL-100", { content: "Suggest the best epic", skill: "match-epic" }),
        makeParams("VPL-100"),
      );

      expect(res.status).toBe(502);

      const msgs = testDb.select().from(message).where(eq(message.conversationId, convId)).all();
      const userMsg = msgs.find((m) => m.role === "user");
      expect(userMsg?.status).toBe("failed");
    });

    it("stores user message with correct task ID on success", async () => {
      const { convId } = seedWithEpics(testDb, "VPL-100");
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: "task_epic_2" }, 201));

      await POST(
        makeRequest("VPL-100", { content: "Suggest the best epic", skill: "match-epic" }),
        makeParams("VPL-100"),
      );

      const msgs = testDb.select().from(message).where(eq(message.conversationId, convId)).all();
      const userMsg = msgs.find((m) => m.role === "user");
      expect(userMsg).toBeTruthy();
      expect(userMsg!.content).toBe("Suggest the best epic");
      expect(userMsg!.status).toBe("sent");
      expect(userMsg!.workspaceTaskId).toBe("task_epic_2");
    });
  });
});

describe("DELETE /api/tickets/[key]/story-writer/messages", () => {
  beforeEach(() => {
    testDb = createTestDb();
    mockFetch.mockReset();
  });

  function makeDeleteRequest(key: string, id?: string) {
    const qs = id ? `?id=${encodeURIComponent(id)}` : "";
    return new Request(`http://localhost:3100/api/tickets/${key}/story-writer/messages${qs}`, {
      method: "DELETE",
    });
  }

  function makeClearRequest(key: string) {
    return new Request(`http://localhost:3100/api/tickets/${key}/story-writer/messages?all=true`, {
      method: "DELETE",
    });
  }

  function seedMessage(convId: string, status: "pending" | "sent" | "failed") {
    const id = randomUUID();
    testDb.insert(message).values({
      id,
      conversationId: convId,
      role: "user",
      content: `Message ${id}`,
      status,
    }).run();
    return id;
  }

  it("deletes a single failed message by id", async () => {
    const { convId } = seedSession(testDb, "VPL-100");
    const failedId = seedMessage(convId, "failed");
    const otherFailedId = seedMessage(convId, "failed");

    const res = await DELETE(makeDeleteRequest("VPL-100", failedId), makeParams("VPL-100"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.deleted).toBe(1);

    const remaining = testDb.select().from(message).where(eq(message.conversationId, convId)).all();
    expect(remaining.map((m) => m.id)).toEqual([otherFailedId]);
  });

  it("never deletes sent messages", async () => {
    const { convId } = seedSession(testDb, "VPL-100");
    const sentId = seedMessage(convId, "sent");

    const res = await DELETE(makeDeleteRequest("VPL-100", sentId), makeParams("VPL-100"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.deleted).toBe(0);

    const remaining = testDb.select().from(message).where(eq(message.conversationId, convId)).all();
    expect(remaining).toHaveLength(1);
  });

  it("returns 400 when neither id nor all is given", async () => {
    seedSession(testDb, "VPL-100");

    const res = await DELETE(makeDeleteRequest("VPL-100"), makeParams("VPL-100"));

    expect(res.status).toBe(400);
  });

  it("returns 404 when no active session", async () => {
    testDb.insert(ticket).values({ jiraKey: "VPL-999", title: "T", status: "TO DO" }).run();

    const res = await DELETE(makeDeleteRequest("VPL-999", randomUUID()), makeParams("VPL-999"));

    expect(res.status).toBe(404);
  });

  // BRDG-489: ?all=true clears the whole conversation but keeps session + draft.
  it("clears all messages (any status) with ?all=true, keeping session and draft", async () => {
    const { convId, sessionId } = seedSession(testDb, "VPL-100");
    seedMessage(convId, "sent");
    seedMessage(convId, "sent");
    seedMessage(convId, "failed");

    const res = await DELETE(makeClearRequest("VPL-100"), makeParams("VPL-100"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.deleted).toBe(3);
    expect(testDb.select().from(message).where(eq(message.conversationId, convId)).all()).toHaveLength(0);

    // Session + its draft survive the clear.
    const session = testDb.select().from(storyWriterSession).where(eq(storyWriterSession.id, sessionId)).get();
    expect(session?.status).toBe("active");
    expect(session?.localDraft).toBe("Current local draft");
  });

  it("keeps AI suggestion drafts on a clear, unlinking them from the deleted messages", async () => {
    const { convId, sessionId } = seedSession(testDb, "VPL-100");
    const msgId = seedMessage(convId, "sent");
    const draftId = randomUUID();
    testDb.insert(storyWriterDraft).values({
      id: draftId,
      sessionId,
      draftIndex: 0,
      content: "AI draft body",
      messageId: msgId,
    }).run();

    await DELETE(makeClearRequest("VPL-100"), makeParams("VPL-100"));

    // The draft row survives (message_id FK is ON DELETE SET NULL).
    const draft = testDb.select().from(storyWriterDraft).where(eq(storyWriterDraft.id, draftId)).get();
    expect(draft?.content).toBe("AI draft body");
    expect(draft?.messageId).toBeNull();
  });

  it("returns 404 on ?all=true when no active session exists", async () => {
    testDb.insert(ticket).values({ jiraKey: "VPL-998", title: "T", status: "TO DO" }).run();

    const res = await DELETE(makeClearRequest("VPL-998"), makeParams("VPL-998"));

    expect(res.status).toBe(404);
  });
});

