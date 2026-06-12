// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, conversation, storyWriterSession, message } from "@/db/schema";
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

import { POST } from "./route";

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
    seedSession(testDb, "VPL-100");
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const res = await POST(
      makeRequest("VPL-100", { content: "test" }),
      makeParams("VPL-100"),
    );

    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.code).toBe("UNREACHABLE");
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

