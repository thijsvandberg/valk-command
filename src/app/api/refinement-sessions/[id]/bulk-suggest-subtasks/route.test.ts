// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { randomUUID } from "crypto";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

// Mock agent-related modules since POST calls VRW
vi.mock("@/lib/agent-fetch", () => ({
  agentFetch: vi.fn().mockResolvedValue({
    ok: true,
    data: { id: "task-123" },
    status: 200,
    retryCount: 0,
  }),
}));

vi.mock("@/lib/agent-proxy", () => ({
  agentUrl: (path: string) => `http://mock-agent${path}`,
  agentHeaders: () => ({ "Content-Type": "application/json" }),
}));

vi.mock("@/lib/notifications", () => ({
  createNotification: vi.fn(),
}));

// Mock next/server's after() to capture callback without executing
vi.mock("next/server", async (importOriginal) => {
  const orig = await importOriginal<typeof import("next/server")>();
  return {
    ...orig,
    after: vi.fn(),
  };
});

import { GET, POST } from "./route";
import { POST as CreateSession } from "../../route";
import { ticket, conversation, message } from "@/db/schema";
import { eq, and } from "drizzle-orm";

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function jsonRequest(method: string, body?: unknown): Request {
  if (body === undefined) {
    return new Request("http://localhost", { method });
  }
  return new Request("http://localhost", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function createSession(overrides?: object) {
  const req = new Request("http://localhost:3100/api/refinement-sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Test session", ticketKeys: ["VPL-1", "VPL-2"], ...overrides }),
  });
  const res = await CreateSession(req);
  return res.json();
}

function seedTicket(key: string) {
  testDb.insert(ticket).values({
    jiraKey: key,
    title: `Title for ${key}`,
    type: "story",
    status: "TO DO",
    jiraUpdatedAt: new Date().toISOString(),
  }).run();
}

function seedConversation(convId: string, messages: { role: string; content: string }[]) {
  testDb.insert(conversation).values({
    id: convId,
    title: "Test conv",
    createdAt: new Date().toISOString(),
  }).run();
  let seq = 1;
  for (const msg of messages) {
    testDb.insert(message).values({
      id: randomUUID(),
      conversationId: convId,
      role: msg.role as "user" | "assistant",
      content: msg.content,
      timestamp: new Date().toISOString(),
      sequence: seq++,
    }).run();
  }
}

describe("GET /api/refinement-sessions/[id]/bulk-suggest-subtasks", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns hasRun=false when no conversation exists", async () => {
    const session = await createSession();
    const response = await GET(new Request("http://localhost"), makeParams(session.id));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.conversationId).toBeNull();
    expect(data.hasRun).toBe(false);
    expect(data.isRunning).toBe(false);
  });

  it("returns isRunning=true when job is in progress", async () => {
    const session = await createSession();
    const convId = `bulk-suggest-${session.id}`;

    seedConversation(convId, [
      { role: "user", content: "Generate subtask suggestions for 2 tickets..." },
      { role: "assistant", content: "Generating subtasks for [VPL-1](/tickets/VPL-1)..." },
    ]);

    const response = await GET(new Request("http://localhost"), makeParams(session.id));
    const data = await response.json();

    expect(data.conversationId).toBe(convId);
    expect(data.hasRun).toBe(true);
    expect(data.isRunning).toBe(true);
  });

  it("returns isRunning=false when job is complete", async () => {
    const session = await createSession();
    const convId = `bulk-suggest-${session.id}`;

    seedConversation(convId, [
      { role: "user", content: "Generate subtask suggestions..." },
      { role: "assistant", content: "Bulk suggestion complete. 2 generated (2 total)." },
    ]);

    const response = await GET(new Request("http://localhost"), makeParams(session.id));
    const data = await response.json();

    expect(data.conversationId).toBe(convId);
    expect(data.hasRun).toBe(true);
    expect(data.isRunning).toBe(false);
  });
});

describe("POST /api/refinement-sessions/[id]/bulk-suggest-subtasks", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns 404 for unknown session", async () => {
    const response = await POST(jsonRequest("POST", {}), makeParams("nonexistent"));
    expect(response.status).toBe(404);
  });

  it("returns 400 for session with no tickets", async () => {
    const session = await createSession({ ticketKeys: [] });
    const response = await POST(jsonRequest("POST", {}), makeParams(session.id));
    expect(response.status).toBe(400);
  });

  it("returns 202 with conversationId", async () => {
    seedTicket("VPL-1");
    seedTicket("VPL-2");
    const session = await createSession();
    const response = await POST(jsonRequest("POST"), makeParams(session.id));
    const data = await response.json();

    expect(response.status).toBe(202);
    expect(data.conversationId).toBe(`bulk-suggest-${session.id}`);
  });

  it("creates a conversation and initial user message", async () => {
    seedTicket("VPL-1");
    seedTicket("VPL-2");
    const session = await createSession();
    await POST(jsonRequest("POST"), makeParams(session.id));

    const convId = `bulk-suggest-${session.id}`;

    // Verify conversation exists
    const conv = testDb
      .select()
      .from(conversation)
      .where(eq(conversation.id, convId))
      .get();
    expect(conv).toBeDefined();
    expect(conv!.title).toContain("Bulk Subtask Suggestions");
    expect(JSON.parse(conv!.metadata!).refinementSessionId).toBe(session.id);

    // Verify user message was posted
    const msgs = testDb
      .select()
      .from(message)
      .where(eq(message.conversationId, convId))
      .all();
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe("user");
    expect(msgs[0].content).toContain("2 tickets");
  });

  it("reuses existing conversation on re-trigger", async () => {
    seedTicket("VPL-1");
    seedTicket("VPL-2");
    const session = await createSession();
    const convId = `bulk-suggest-${session.id}`;

    seedConversation(convId, [
      { role: "user", content: "Previous run" },
      { role: "assistant", content: "Bulk suggestion complete." },
    ]);

    await POST(jsonRequest("POST"), makeParams(session.id));

    // Should not create a duplicate conversation
    const convs = testDb
      .select()
      .from(conversation)
      .where(eq(conversation.id, convId))
      .all();
    expect(convs).toHaveLength(1);

    // Should have added a new user message (2 from seed + 1 new)
    const msgs = testDb
      .select()
      .from(message)
      .where(and(eq(message.conversationId, convId), eq(message.role, "user")))
      .all();
    expect(msgs.length).toBeGreaterThanOrEqual(2);
  });

  it("includes force label in message when force=true", async () => {
    seedTicket("VPL-1");
    seedTicket("VPL-2");
    const session = await createSession();
    await POST(jsonRequest("POST", { force: true }), makeParams(session.id));

    const convId = `bulk-suggest-${session.id}`;
    const msgs = testDb
      .select()
      .from(message)
      .where(and(eq(message.conversationId, convId), eq(message.role, "user")))
      .all();
    expect(msgs[0].content).toContain("force regenerate");
  });
});
