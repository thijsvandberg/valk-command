import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, ticketMetadata, storyWriterSession, conversation, activityLog } from "@/db/schema";
import { eq } from "drizzle-orm";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/jira-client", () => ({
  jiraClient: {
    createIssue: vi.fn(),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

import { finalizeDraft, syncDraftToJira } from "./draft-sync";
import { jiraClient } from "@/lib/jira-client";

function seedDraft(db: BetterSQLite3Database<typeof schema>, draftKey: string) {
  db.insert(ticket)
    .values({ jiraKey: draftKey, title: "Test Draft", type: "story", status: "DRAFTING" })
    .run();
  db.insert(ticketMetadata)
    .values({ jiraKey: draftKey, readiness: "drafting" })
    .run();
  db.insert(conversation)
    .values({ id: "conv-1", title: "Story Writer: DRAFT-abc", relatedTicket: draftKey })
    .run();
  db.insert(storyWriterSession)
    .values({
      id: "sess-1",
      ticketKey: draftKey,
      conversationId: "conv-1",
      status: "active",
    })
    .run();
}

describe("finalizeDraft", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("swaps draft key for real key across all tables", () => {
    seedDraft(testDb, "DRAFT-abc");

    finalizeDraft("DRAFT-abc", "VPL-123");

    // Real ticket exists
    const real = testDb.select().from(ticket).where(eq(ticket.jiraKey, "VPL-123")).get();
    expect(real).toBeDefined();
    expect(real!.title).toBe("Test Draft");
    expect(real!.status).toBe("TO DO");

    // Draft is marked as replaced
    const draft = testDb.select().from(ticket).where(eq(ticket.jiraKey, "DRAFT-abc")).get();
    expect(draft!.status).toBe("REPLACED");
    expect(draft!.description).toBe("VPL-123");

    // Metadata moved
    const meta = testDb.select().from(ticketMetadata).where(eq(ticketMetadata.jiraKey, "VPL-123")).get();
    expect(meta).toBeDefined();
    const oldMeta = testDb.select().from(ticketMetadata).where(eq(ticketMetadata.jiraKey, "DRAFT-abc")).get();
    expect(oldMeta).toBeUndefined();

    // Session updated
    const sess = testDb.select().from(storyWriterSession).where(eq(storyWriterSession.id, "sess-1")).get();
    expect(sess!.ticketKey).toBe("VPL-123");

    // Conversation updated
    const conv = testDb.select().from(conversation).where(eq(conversation.id, "conv-1")).get();
    expect(conv!.relatedTicket).toBe("VPL-123");
  });

  it("handles missing draft gracefully", () => {
    // No draft seeded
    expect(() => finalizeDraft("DRAFT-missing", "VPL-999")).not.toThrow();
  });
});

describe("syncDraftToJira", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
  });

  it("creates Jira issue and finalizes draft", async () => {
    seedDraft(testDb, "DRAFT-xyz");
    vi.mocked(jiraClient.createIssue).mockResolvedValue({ key: "VPL-500", id: "12345" });

    await syncDraftToJira("DRAFT-xyz", { title: "My Story", issueType: "story" });

    expect(jiraClient.createIssue).toHaveBeenCalledWith({
      summary: "My Story",
      sprintId: undefined,
      issueType: "story",
      description: { type: "doc", version: 1, content: [] },
    });

    const real = testDb.select().from(ticket).where(eq(ticket.jiraKey, "VPL-500")).get();
    expect(real).toBeDefined();
    expect(real!.status).toBe("TO DO");
  });

  it("marks draft as DRAFT_FAILED on Jira error", async () => {
    seedDraft(testDb, "DRAFT-fail");
    vi.mocked(jiraClient.createIssue).mockRejectedValue(new Error("Jira is down"));

    await syncDraftToJira("DRAFT-fail", { title: "Fail Story", issueType: "story" });

    const draft = testDb.select().from(ticket).where(eq(ticket.jiraKey, "DRAFT-fail")).get();
    expect(draft!.status).toBe("DRAFT_FAILED");
    expect(draft!.description).toBe("Jira is down");
  });
});
