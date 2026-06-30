// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createJiraClientMock } from "@/test/mocks";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, ticketMetadata, ticketLocalEdit, storyWriterSession, conversation, activityLog, ticketSprint } from "@/db/schema";
import { eq } from "drizzle-orm";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/jira-client", () => createJiraClientMock({
  jiraClient: {
    createIssue: vi.fn(),
    moveToSprint: vi.fn().mockResolvedValue(undefined),
    rankToTopOfSprint: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/lib/cache", () => ({ cache: { invalidate: vi.fn() } }));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { finalizeDraft, syncDraftToJira, resolveSessionTicketKeys } from "./draft-sync";
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

  it("migrates ticketLocalEdit rows to the real key", () => {
    seedDraft(testDb, "DRAFT-edit");
    testDb.insert(ticketLocalEdit).values({
      id: "edit-1",
      ticketKey: "DRAFT-edit",
      field: "description",
      localValue: "Draft content",
      isDraft: false,
      modifiedAt: new Date().toISOString(),
    }).run();

    finalizeDraft("DRAFT-edit", "VPL-456");

    // Local edit should now be keyed to the real key
    const edit = testDb.select().from(ticketLocalEdit).where(eq(ticketLocalEdit.id, "edit-1")).get();
    expect(edit).toBeDefined();
    expect(edit!.ticketKey).toBe("VPL-456");

    // No edits left under the draft key
    const draftEdits = testDb.select().from(ticketLocalEdit).where(eq(ticketLocalEdit.ticketKey, "DRAFT-edit")).all();
    expect(draftEdits).toHaveLength(0);
  });

  it("handles missing draft gracefully", () => {
    // No draft seeded
    expect(() => finalizeDraft("DRAFT-missing", "VPL-999")).not.toThrow();
  });

  it("marks the draft DRAFT_FAILED when the finalize transaction throws", () => {
    seedDraft(testDb, "DRAFT-boom");
    // Pre-seed the real key so the transaction's insert hits a unique-constraint
    // violation and rolls back, exercising the catch block.
    testDb.insert(ticket)
      .values({ jiraKey: "VPL-911", title: "Existing", type: "story", status: "TO DO" })
      .run();

    expect(() => finalizeDraft("DRAFT-boom", "VPL-911")).not.toThrow();

    // The catch-block write must persist (regression: missing .run()).
    const draft = testDb.select().from(ticket).where(eq(ticket.jiraKey, "DRAFT-boom")).get();
    expect(draft!.status).toBe("DRAFT_FAILED");
    expect(draft!.description).toBe("Internal error during finalization");
  });
});

describe("resolveSessionTicketKeys", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("resolves drafts and dedups, preserving first-occurrence order (injected resolver)", () => {
    const map: Record<string, string> = {
      "DRAFT-aaa": "VPL-100",
      "DRAFT-bbb": "VPL-200", // resolves to a key that appears later as a literal
    };
    const resolve = (k: string) => map[k] ?? k;

    const result = resolveSessionTicketKeys(
      ["VPL-1", "DRAFT-aaa", "DRAFT-bbb", "VPL-200", "VPL-1"],
      resolve,
    );

    // DRAFT-aaa -> VPL-100; DRAFT-bbb -> VPL-200 which then dedups the literal
    // VPL-200; the trailing duplicate VPL-1 is dropped too.
    expect(result).toEqual(["VPL-1", "VPL-100", "VPL-200"]);
  });

  it("leaves non-draft and still-pending draft keys unchanged", () => {
    const result = resolveSessionTicketKeys(
      ["VPL-1", "DRAFT-pending", "VPL-2"],
      (k) => k,
    );
    expect(result).toEqual(["VPL-1", "DRAFT-pending", "VPL-2"]);
  });

  it("promotes a finalized draft to its real key via the DB and dedups against an existing key", () => {
    // Mirrors the real bug: the session holds a DRAFT key that was promoted to a
    // real ticket already present in the queue (so the raw count over-reports).
    testDb.insert(ticket).values({ jiraKey: "VPL-890", title: "Forgot password", type: "story", status: "TO DO" }).run();
    testDb.insert(ticket).values({ jiraKey: "DRAFT-dup", title: "Untitled draft", type: "story", status: "REPLACED", description: "VPL-890" }).run();
    testDb.insert(ticket).values({ jiraKey: "VPL-885", title: "Hotel logout", type: "story", status: "TO DO" }).run();
    testDb.insert(ticket).values({ jiraKey: "DRAFT-new", title: "404 logout", type: "story", status: "REPLACED", description: "VPL-885" }).run();

    const result = resolveSessionTicketKeys(["VPL-1", "DRAFT-new", "DRAFT-dup", "VPL-890"]);

    expect(result).toEqual(["VPL-1", "VPL-885", "VPL-890"]);
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
      issueType: "story",
      description: { type: "doc", version: 1, content: [] },
    });
    // No sprint given → no move/rank.
    expect(jiraClient.moveToSprint).not.toHaveBeenCalled();
    expect(jiraClient.rankToTopOfSprint).not.toHaveBeenCalled();

    const real = testDb.select().from(ticket).where(eq(ticket.jiraKey, "VPL-500")).get();
    expect(real).toBeDefined();
    expect(real!.status).toBe("TO DO");
  });

  it("assigns the sprint and lands the new story at the top (BRDG-354)", async () => {
    seedDraft(testDb, "DRAFT-sprint");
    vi.mocked(jiraClient.createIssue).mockResolvedValue({ key: "VPL-700", id: "70000" });

    await syncDraftToJira("DRAFT-sprint", { title: "Sprint story", sprintId: "42", issueType: "story" });

    // Jira ignores sprint-on-create, so it is applied via the field-edit path...
    expect(jiraClient.moveToSprint).toHaveBeenCalledWith(["VPL-700"], 42);
    // ...then ranked to the top of the sprint.
    expect(jiraClient.rankToTopOfSprint).toHaveBeenCalledWith(["VPL-700"], 42);

    const real = testDb.select().from(ticket).where(eq(ticket.jiraKey, "VPL-700")).get();
    expect(real!.sprintName).toBe("42");
    // Local rank set so the board shows it at the top immediately (no ranked peers → 0).
    expect(real!.jiraRank).toBe(0);

    // Membership bridge written so the by-sprint board shows it in the column.
    const membership = testDb.select().from(ticketSprint).where(eq(ticketSprint.ticketKey, "VPL-700")).all();
    expect(membership.map((m) => m.sprintId)).toContain("42");
  });

  it("tolerates a rank failure: the story is still finalized in the sprint", async () => {
    seedDraft(testDb, "DRAFT-rankfail");
    vi.mocked(jiraClient.createIssue).mockResolvedValue({ key: "VPL-701", id: "70100" });
    vi.mocked(jiraClient.rankToTopOfSprint).mockRejectedValueOnce(new Error("rank API down"));

    await syncDraftToJira("DRAFT-rankfail", { title: "Sprint story", sprintId: "42", issueType: "story" });

    const real = testDb.select().from(ticket).where(eq(ticket.jiraKey, "VPL-701")).get();
    expect(real!.status).toBe("TO DO");
    expect(real!.sprintName).toBe("42");
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
