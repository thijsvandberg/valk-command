// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { seedTicket, seedConversation, seedStoryWriterSession } from "@/test/builders";
import { epicChildDraft, ticket, ticketMetadata } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/markdown-to-adf", () => ({
  markdownToAdf: vi.fn().mockReturnValue({ type: "doc", version: 1, content: [] }),
}));
vi.mock("@/lib/jira-client", () => ({
  jiraClient: {
    createIssue: vi.fn().mockResolvedValue({ key: "VPL-201", id: "1" }),
  },
}));

import { POST } from "./route";
import { jiraClient } from "@/lib/jira-client";

function makeParams(key: string): { params: Promise<{ key: string }> } {
  return { params: Promise.resolve({ key }) };
}

function postReq(key: string, body: Record<string, unknown>) {
  return new Request(`http://localhost:3100/api/epics/${key}/writer/create-in-jira`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
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
  });
}

function seedCard(sessionId: string, overrides: Partial<typeof epicChildDraft.$inferInsert>) {
  const data = {
    id: randomUUID(),
    sessionId,
    cardIndex: 0,
    title: "Cart summary",
    bullets: ["Show items", "Show total"],
    body: null,
    status: "draft" as const,
    jiraKey: null,
    suggestedSprintId: null,
    suggestedLinks: [],
    ...overrides,
  };
  testDb.insert(epicChildDraft).values(data).run();
  return data;
}

describe("POST /api/epics/[key]/writer/create-in-jira", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
    vi.mocked(jiraClient.createIssue).mockResolvedValue({ key: "VPL-201", id: "1" } as never);
  });

  it("promotes a DRAFT card to a real Jira issue under the epic", async () => {
    seedEpicSession("VPL-E1", "sess-1");
    seedCard("sess-1", { cardIndex: 0 });

    const res = await POST(postReq("VPL-E1", { cardIndex: 0 }), makeParams("VPL-E1"));
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.ok).toBe(true);
    expect(data.jiraKey).toBe("VPL-201");

    // Created under the epic via parentKey (epic-child link at creation).
    expect(vi.mocked(jiraClient.createIssue)).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(jiraClient.createIssue).mock.calls[0][0];
    expect(arg.parentKey).toBe("VPL-E1");
    expect(arg.summary).toBe("Cart summary");
  });

  it("updates the card to status created with jiraKey set", async () => {
    seedEpicSession("VPL-E1", "sess-1");
    seedCard("sess-1", { cardIndex: 0 });

    await POST(postReq("VPL-E1", { cardIndex: 0 }), makeParams("VPL-E1"));

    const card = testDb
      .select()
      .from(epicChildDraft)
      .where(and(eq(epicChildDraft.sessionId, "sess-1"), eq(epicChildDraft.cardIndex, 0)))
      .get();
    expect(card?.status).toBe("created");
    expect(card?.jiraKey).toBe("VPL-201");
  });

  it("inserts a local ticket tied to the epic via epicKey", async () => {
    seedEpicSession("VPL-E1", "sess-1");
    seedCard("sess-1", { cardIndex: 0 });

    await POST(postReq("VPL-E1", { cardIndex: 0 }), makeParams("VPL-E1"));

    const childTicket = testDb.select().from(ticket).where(eq(ticket.jiraKey, "VPL-201")).get();
    expect(childTicket?.epicKey).toBe("VPL-E1");
    expect(childTicket?.title).toBe("Cart summary");

    const meta = testDb
      .select()
      .from(ticketMetadata)
      .where(eq(ticketMetadata.jiraKey, "VPL-201"))
      .get();
    expect(meta).toBeTruthy();
  });

  it("is idempotent: a created card returns its key without creating a duplicate", async () => {
    seedEpicSession("VPL-E1", "sess-1");
    seedCard("sess-1", { cardIndex: 0, status: "created", jiraKey: "VPL-150" });

    const res = await POST(postReq("VPL-E1", { cardIndex: 0 }), makeParams("VPL-E1"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.alreadyCreated).toBe(true);
    expect(data.jiraKey).toBe("VPL-150");
    expect(vi.mocked(jiraClient.createIssue)).not.toHaveBeenCalled();
  });

  it("does not flip the card to created when Jira creation fails", async () => {
    seedEpicSession("VPL-E1", "sess-1");
    seedCard("sess-1", { cardIndex: 0 });
    vi.mocked(jiraClient.createIssue).mockRejectedValueOnce(new Error("Jira down"));

    const res = await POST(postReq("VPL-E1", { cardIndex: 0 }), makeParams("VPL-E1"));
    expect(res.status).toBe(502);

    const card = testDb
      .select()
      .from(epicChildDraft)
      .where(and(eq(epicChildDraft.sessionId, "sess-1"), eq(epicChildDraft.cardIndex, 0)))
      .get();
    expect(card?.status).toBe("draft");
    expect(card?.jiraKey).toBeNull();
  });

  it("404s when no active epic session exists", async () => {
    seedTicket(testDb, { jiraKey: "VPL-E1", type: "epic", title: "Epic" });
    const res = await POST(postReq("VPL-E1", { cardIndex: 0 }), makeParams("VPL-E1"));
    expect(res.status).toBe(404);
  });

  it("404s for an unknown card index", async () => {
    seedEpicSession("VPL-E1", "sess-1");
    const res = await POST(postReq("VPL-E1", { cardIndex: 9 }), makeParams("VPL-E1"));
    expect(res.status).toBe(404);
  });

  it("400s for an invalid card index", async () => {
    seedEpicSession("VPL-E1", "sess-1");
    const res = await POST(postReq("VPL-E1", { cardIndex: -1 }), makeParams("VPL-E1"));
    expect(res.status).toBe(400);
  });
});
