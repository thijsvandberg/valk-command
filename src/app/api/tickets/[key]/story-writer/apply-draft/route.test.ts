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

import { POST, DELETE } from "./route";

function makeParams(key: string) {
  return { params: Promise.resolve({ key }) };
}

function makeRequest(url: string, body?: Record<string, unknown>) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function seedSession(db: BetterSQLite3Database<typeof schema>, key: string) {
  const convId = randomUUID();
  const sessionId = randomUUID();

  db.insert(ticket).values({ jiraKey: key, title: `Ticket ${key}`, status: "TO DO" }).run();
  db.insert(conversation).values({ id: convId, title: `Story Writer: ${key}`, relatedTicket: key }).run();
  db.insert(storyWriterSession).values({
    id: sessionId,
    ticketKey: key,
    conversationId: convId,
    status: "active",
    localDraft: "Original draft content",
  }).run();

  return { convId, sessionId };
}

describe("POST /api/tickets/[key]/story-writer/apply-draft", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("creates an AI draft entry without modifying localDraft", async () => {
    const { sessionId } = seedSession(testDb, "VPL-100");

    const output = `Here is the improved story:

<story-draft>
### User Story

As a guest, I want to see upgrade costs.
</story-draft>

Let me know what you think.`;

    const res = await POST(
      makeRequest("http://localhost:3100/api/tickets/VPL-100/story-writer/apply-draft", {
        output,
        taskId: "task_1",
      }),
      makeParams("VPL-100"),
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.hasDraft).toBe(true);
    expect(data.draftIndex).toBe(0);
    expect(data.draftId).toBeTruthy();

    // AI draft should be saved
    const drafts = testDb.select().from(storyWriterDraft)
      .where(eq(storyWriterDraft.sessionId, sessionId))
      .all();
    expect(drafts).toHaveLength(1);
    expect(drafts[0].content).toContain("As a guest");

    // localDraft should NOT be modified
    const session = testDb.select().from(storyWriterSession)
      .where(eq(storyWriterSession.id, sessionId))
      .get()!;
    expect(session.localDraft).toBe("Original draft content");
  });

  it("increments draft index for multiple drafts", async () => {
    const { sessionId } = seedSession(testDb, "VPL-100");

    // First draft
    await POST(
      makeRequest("http://localhost:3100/api/tickets/VPL-100/story-writer/apply-draft", {
        output: "<story-draft>Draft 1</story-draft>",
      }),
      makeParams("VPL-100"),
    );

    // Second draft
    const res = await POST(
      makeRequest("http://localhost:3100/api/tickets/VPL-100/story-writer/apply-draft", {
        output: "<story-draft>Draft 2</story-draft>",
      }),
      makeParams("VPL-100"),
    );
    const data = await res.json();

    expect(data.draftIndex).toBe(1);

    const drafts = testDb.select().from(storyWriterDraft)
      .where(eq(storyWriterDraft.sessionId, sessionId))
      .all();
    expect(drafts).toHaveLength(2);
  });

  it("returns hasDraft=false when no draft tags in output", async () => {
    seedSession(testDb, "VPL-100");

    const res = await POST(
      makeRequest("http://localhost:3100/api/tickets/VPL-100/story-writer/apply-draft", {
        output: "Sure, what would you like to change?",
      }),
      makeParams("VPL-100"),
    );
    const data = await res.json();

    expect(data.hasDraft).toBe(false);
    expect(data.draftId).toBeNull();
  });

  it("saves assistant message and links it to the draft", async () => {
    const { convId } = seedSession(testDb, "VPL-100");

    await POST(
      makeRequest("http://localhost:3100/api/tickets/VPL-100/story-writer/apply-draft", {
        output: "<story-draft>Draft content</story-draft>",
        taskId: "task_1",
        assistantContent: "Here is the draft",
      }),
      makeParams("VPL-100"),
    );

    const messages = testDb.select().from(message)
      .where(eq(message.conversationId, convId))
      .all();
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("assistant");

    // Draft should reference the message
    const drafts = testDb.select().from(storyWriterDraft).all();
    expect(drafts[0].messageId).toBe(messages[0].id);
  });
});

describe("DELETE /api/tickets/[key]/story-writer/apply-draft", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("dismisses a specific AI draft", async () => {
    const { sessionId } = seedSession(testDb, "VPL-100");

    testDb.insert(storyWriterDraft).values({
      id: "draft-1",
      sessionId,
      draftIndex: 0,
      content: "Draft to dismiss",
    }).run();

    const res = await DELETE(
      new Request("http://localhost:3100/api/tickets/VPL-100/story-writer/apply-draft?draftId=draft-1", {
        method: "DELETE",
      }),
      makeParams("VPL-100"),
    );

    expect(res.status).toBe(200);

    const drafts = testDb.select().from(storyWriterDraft)
      .where(eq(storyWriterDraft.sessionId, sessionId))
      .all();
    expect(drafts).toHaveLength(0);
  });

  it("returns 400 when draftId is missing", async () => {
    seedSession(testDb, "VPL-100");

    const res = await DELETE(
      new Request("http://localhost:3100/api/tickets/VPL-100/story-writer/apply-draft", {
        method: "DELETE",
      }),
      makeParams("VPL-100"),
    );

    expect(res.status).toBe(400);
  });
});
