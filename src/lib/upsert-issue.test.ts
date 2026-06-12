// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, ticketSubtask, ticketMetadata, storyVersion, storyWriterSession, conversation } from "@/db/schema";
import { eq } from "drizzle-orm";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/jira-client", () => ({
  jiraClient: {
    getLastChangeAuthor: vi.fn().mockResolvedValue(null),
  },
  extractStoryPoints: vi.fn().mockReturnValue(null),
  extractSprints: vi.fn().mockReturnValue([]),
  extractEpicLink: vi.fn().mockReturnValue(null),
  extractAcceptanceCriteria: vi.fn().mockReturnValue(null),
  extractLastChangeAuthor: vi.fn().mockReturnValue(null),
  FLAGGED_FIELD: "customfield_10002",
}));

vi.mock("@/lib/adf-to-markdown", () => ({
  adfToMarkdown: vi.fn().mockReturnValue(""),
}));

vi.mock("@/lib/ticket-events", () => ({
  emitTicketEvent: vi.fn(),
}));

import { normalizeIssueType, normalizeStatus, userColor, upsertIssue } from "./upsert-issue";
import { extractSprints, extractStoryPoints } from "@/lib/jira-client";
import { emitTicketEvent } from "@/lib/ticket-events";
import type { JiraIssue, JiraSprint } from "@/lib/jira-client";

function makeIssue(overrides: Partial<JiraIssue["fields"]> = {}): JiraIssue {
  return {
    id: "10001",
    key: "VPL-1",
    fields: {
      summary: "Test issue",
      issuetype: { name: "Story" },
      status: { name: "To Do" },
      assignee: null,
      reporter: null,
      priority: undefined,
      labels: [],
      customfield_10002: null,
      description: null,
      created: "2024-01-01T00:00:00.000Z",
      updated: "2024-01-01T00:00:00.000Z",
      components: [],
      attachment: [],
      subtasks: [],
      issuelinks: [],
      comment: { total: 0, comments: [] },
      ...overrides,
    },
  };
}

describe("normalizeIssueType", () => {
  it("maps bug variations to bug", () => {
    expect(normalizeIssueType("Bug")).toBe("bug");
    expect(normalizeIssueType("Critical Bug")).toBe("bug");
  });

  it("maps subtask variations to subtask", () => {
    expect(normalizeIssueType("Sub-task")).toBe("subtask");
    expect(normalizeIssueType("Subtask")).toBe("subtask");
  });

  it("maps story to story", () => {
    expect(normalizeIssueType("Story")).toBe("story");
    expect(normalizeIssueType("User Story")).toBe("story");
  });

  it("maps spike to spike", () => {
    expect(normalizeIssueType("Spike")).toBe("spike");
  });

  it("returns task as default", () => {
    expect(normalizeIssueType("Task")).toBe("task");
    expect(normalizeIssueType("Unknown")).toBe("task");
  });
});

describe("normalizeStatus", () => {
  it("maps TO DO variants to TO DO", () => {
    expect(normalizeStatus("To Do")).toBe("TO DO");
    expect(normalizeStatus("Backlog")).toBe("TO DO");
    expect(normalizeStatus("Open")).toBe("TO DO");
  });

  it("maps in-progress variants to IN PROGRESS", () => {
    expect(normalizeStatus("In Progress")).toBe("IN PROGRESS");
    expect(normalizeStatus("In Progress...")).toBe("IN PROGRESS");
  });

  it("maps review/test variants to TEST", () => {
    expect(normalizeStatus("Test")).toBe("TEST");
    expect(normalizeStatus("In Review")).toBe("TEST");
    expect(normalizeStatus("Review")).toBe("TEST");
  });

  it("maps done variants to DONE", () => {
    expect(normalizeStatus("Done")).toBe("DONE");
    expect(normalizeStatus("Closed")).toBe("DONE");
    expect(normalizeStatus("Resolved")).toBe("DONE");
  });
});

describe("userColor", () => {
  it("returns an hsl color string", () => {
    const color = userColor("Alice");
    expect(color).toMatch(/^hsl\(\d+, 55%, 50%\)$/);
  });

  it("returns the same color for the same name", () => {
    expect(userColor("Alice")).toBe(userColor("Alice"));
    expect(userColor("Bob")).toBe(userColor("Bob"));
  });

  it("returns different colors for different names", () => {
    expect(userColor("Alice")).not.toBe(userColor("Bob"));
  });
});

describe("upsertIssue", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.mocked(extractSprints).mockReturnValue([]);
    vi.mocked(extractStoryPoints).mockReturnValue(null);
  });

  it("inserts a new ticket into the database", async () => {
    const issue = makeIssue();
    await upsertIssue(issue, "Sprint 1");

    const all = testDb.select().from(ticket).all();
    expect(all).toHaveLength(1);
    expect(all[0].jiraKey).toBe("VPL-1");
    expect(all[0].title).toBe("Test issue");
  });

  it("stores every sprint the issue belongs to in sprint_ids", async () => {
    vi.mocked(extractSprints).mockReturnValue([
      { id: 100, name: "Sprint A", state: "closed" },
      { id: 200, name: "Sprint B", state: "active" },
    ] as JiraSprint[]);

    await upsertIssue(makeIssue(), "200");

    const row = testDb.select().from(ticket).all()[0];
    expect(row.sprintIds).toBe(JSON.stringify(["100", "200"]));
    // sprintName remains the single primary passed by the caller.
    expect(row.sprintName).toBe("200");
  });

  it("leaves sprint_ids null when the issue is in no sprint (backlog)", async () => {
    vi.mocked(extractSprints).mockReturnValue([]);

    await upsertIssue(makeIssue(), "");

    const row = testDb.select().from(ticket).all()[0];
    expect(row.sprintIds).toBeNull();
  });

  it("updates an existing ticket on second upsert", async () => {
    const issue = makeIssue({ summary: "Original title" });
    await upsertIssue(issue, "Sprint 1");

    const updated = makeIssue({ summary: "Updated title" });
    await upsertIssue(updated, "Sprint 1");

    const all = testDb.select().from(ticket).all();
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe("Updated title");
  });

  it("preserves a local 0 (\"-\"/N/A) when Jira returns no story points", async () => {
    // "-" is a Bridge-only marker stored as 0; Jira has no 0, so its field is
    // empty. A sync must not revert the local "-" back to unestimated.
    testDb.insert(ticket).values({ jiraKey: "VPL-1", title: "Spike", status: "TO DO", storyPoints: 0 }).run();
    vi.mocked(extractStoryPoints).mockReturnValue(null);

    await upsertIssue(makeIssue(), "Sprint 1");

    const row = testDb.select().from(ticket).all()[0];
    expect(row.storyPoints).toBe(0);
  });

  it("lets a real Jira story-point value overwrite a local 0", async () => {
    testDb.insert(ticket).values({ jiraKey: "VPL-1", title: "Spike", status: "TO DO", storyPoints: 0 }).run();
    vi.mocked(extractStoryPoints).mockReturnValue(5);

    await upsertIssue(makeIssue(), "Sprint 1");

    const row = testDb.select().from(ticket).all()[0];
    expect(row.storyPoints).toBe(5);
  });

  it("keeps story points null when Jira is empty and there is no local estimate", async () => {
    vi.mocked(extractStoryPoints).mockReturnValue(null);

    await upsertIssue(makeIssue(), "Sprint 1");

    const row = testDb.select().from(ticket).all()[0];
    expect(row.storyPoints).toBeNull();
  });

  it("updates parent ticketSubtask row when syncing a subtask directly", async () => {
    // Simulate a parent with a subtask already stored
    const parent = makeIssue({
      summary: "Parent story",
      subtasks: [{
        id: "20001",
        key: "VPL-2",
        fields: {
          summary: "Child task",
          issuetype: { name: "Sub-task" },
          status: { name: "To Do" },
          assignee: null,
        },
      }],
    });
    parent.key = "VPL-1";
    await upsertIssue(parent, "Sprint 1");

    // Verify subtask row has initial status
    const before = testDb.select().from(ticketSubtask).all();
    expect(before).toHaveLength(1);
    expect(before[0].status).toBe("TO DO");
    expect(before[0].assignee).toBeNull();

    // Now sync the subtask directly (as incremental sync would)
    const subtask = makeIssue({
      summary: "Child task",
      status: { name: "Done" },
      assignee: { accountId: "abc123", displayName: "Robin", avatarUrls: { "48x48": "https://example.com/avatar.png" } },
    });
    subtask.id = "20001";
    subtask.key = "VPL-2";
    await upsertIssue(subtask, "Sprint 1");

    // The ticketSubtask row under the parent should be updated
    const after = testDb.select().from(ticketSubtask).all();
    expect(after).toHaveLength(1);
    expect(after[0].status).toBe("DONE");
    expect(after[0].assignee).toBe("Robin");
    expect(after[0].assigneeAvatar).toBe("https://example.com/avatar.png");
  });
});

describe("own-push echo suppression", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.mocked(extractSprints).mockReturnValue([]);
    vi.mocked(extractStoryPoints).mockReturnValue(null);
    vi.mocked(emitTicketEvent).mockClear();
  });

  function seedActiveSession(key: string, baseVersionHash: string | null) {
    testDb.insert(conversation).values({ id: "conv-1", title: "SW", relatedTicket: key }).run();
    testDb.insert(storyWriterSession).values({
      id: "sws-1",
      ticketKey: key,
      conversationId: "conv-1",
      status: "active",
      localDraft: "New content",
      baseVersionHash,
    }).run();
  }

  // storyVersion ids are timestamp-based; space consecutive upserts apart so
  // two versions for the same key never collide on the same millisecond.
  const tick = () => new Promise((resolve) => setTimeout(resolve, 2));

  it("suppresses content:changed and rebases the session when the new version matches the mirror", async () => {
    await upsertIssue(makeIssue({ description: "Original content" }), "");
    const v1 = testDb.select().from(storyVersion).all()[0];
    seedActiveSession("VPL-1", v1.contentHash);
    vi.mocked(emitTicketEvent).mockClear();

    // Bridge pushed "New content"; the push wrote the mirror directly
    testDb.update(ticket).set({ description: "New content" }).where(eq(ticket.jiraKey, "VPL-1")).run();

    // The push echoes back through sync with a new raw content hash
    await tick();
    await upsertIssue(makeIssue({ description: "New content" }), "");

    const versions = testDb.select().from(storyVersion).all();
    expect(versions).toHaveLength(2);
    expect(emitTicketEvent).not.toHaveBeenCalled();

    const latest = versions.find((v) => v.contentHash !== v1.contentHash);
    const session = testDb.select().from(storyWriterSession).all()[0];
    expect(latest).toBeDefined();
    expect(session.baseVersionHash).toBe(latest?.contentHash);
  });

  it("emits a content event and keeps the baseline for a genuine external change", async () => {
    await upsertIssue(makeIssue({ description: "Original content" }), "");
    const v1 = testDb.select().from(storyVersion).all()[0];
    seedActiveSession("VPL-1", v1.contentHash);
    vi.mocked(emitTicketEvent).mockClear();

    // Someone edited the description in Jira; the mirror still has the old text
    await tick();
    await upsertIssue(makeIssue({ description: "External edit from Jira" }), "");

    expect(emitTicketEvent).toHaveBeenCalledWith({ type: "ticket:changed", ticketKey: "VPL-1", kinds: ["content"], origin: null });
    const session = testDb.select().from(storyWriterSession).all()[0];
    expect(session.baseVersionHash).toBe(v1.contentHash);
  });
});

describe("typed change events (BRDG-338)", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.mocked(extractSprints).mockReturnValue([]);
    vi.mocked(extractStoryPoints).mockReturnValue(null);
    vi.mocked(emitTicketEvent).mockClear();
  });

  function lastEmittedKinds(): string[] {
    const calls = vi.mocked(emitTicketEvent).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    return [...calls[calls.length - 1][0].kinds].sort();
  }

  it("does not emit for a brand-new ticket", async () => {
    await upsertIssue(makeIssue(), "Sprint 1");
    expect(emitTicketEvent).not.toHaveBeenCalled();
  });

  it("does not emit when nothing changed", async () => {
    await upsertIssue(makeIssue(), "Sprint 1");
    vi.mocked(emitTicketEvent).mockClear();
    await upsertIssue(makeIssue(), "Sprint 1");
    expect(emitTicketEvent).not.toHaveBeenCalled();
  });

  it("emits a status kind on a field-only status change", async () => {
    await upsertIssue(makeIssue(), "Sprint 1");
    vi.mocked(emitTicketEvent).mockClear();
    await upsertIssue(makeIssue({ status: { name: "In Progress" } }), "Sprint 1");
    expect(lastEmittedKinds()).toEqual(["status"]);
  });

  it("emits an assignee kind when the assignee moves", async () => {
    await upsertIssue(makeIssue(), "Sprint 1");
    vi.mocked(emitTicketEvent).mockClear();
    await upsertIssue(makeIssue({ assignee: { accountId: "a1", displayName: "Robin", avatarUrls: {} } }), "Sprint 1");
    expect(lastEmittedKinds()).toEqual(["assignee"]);
  });

  it("emits a points kind on a story points change without a content change", async () => {
    await upsertIssue(makeIssue(), "Sprint 1");
    vi.mocked(emitTicketEvent).mockClear();
    vi.mocked(extractStoryPoints).mockReturnValue(8);
    await upsertIssue(makeIssue(), "Sprint 1");
    expect(lastEmittedKinds()).toEqual(["points"]);
  });

  it("emits sprint and labels kinds when those fields move", async () => {
    await upsertIssue(makeIssue(), "Sprint 1");
    vi.mocked(emitTicketEvent).mockClear();
    await upsertIssue(makeIssue({ labels: ["backend"] }), "Sprint 2");
    expect(lastEmittedKinds()).toEqual(["labels", "sprint"]);
  });

  it("emits a comment kind when a new inline comment lands", async () => {
    await upsertIssue(makeIssue(), "Sprint 1");
    vi.mocked(emitTicketEvent).mockClear();
    await upsertIssue(makeIssue({
      comment: {
        total: 1,
        comments: [{ id: "c1", author: { accountId: "u1", displayName: "Robin", avatarUrls: {} }, body: "A new comment", created: "2024-01-02T00:00:00.000Z", updated: "2024-01-02T00:00:00.000Z" }],
      },
    }), "Sprint 1");
    expect(lastEmittedKinds()).toEqual(["comment"]);
  });

  it("emits a subtasks kind when a subtask's status moves", async () => {
    const withSub = (status: string) => makeIssue({
      subtasks: [{
        id: "20001",
        key: "VPL-2",
        fields: { summary: "Child", issuetype: { name: "Sub-task" }, status: { name: status }, assignee: null },
      }],
    });
    await upsertIssue(withSub("To Do"), "Sprint 1");
    vi.mocked(emitTicketEvent).mockClear();
    await upsertIssue(withSub("Done"), "Sprint 1");
    expect(lastEmittedKinds()).toContain("subtasks");
  });

  it("coalesces several field changes into one event", async () => {
    await upsertIssue(makeIssue(), "Sprint 1");
    vi.mocked(emitTicketEvent).mockClear();
    vi.mocked(extractStoryPoints).mockReturnValue(5);
    await upsertIssue(makeIssue({ status: { name: "In Progress" }, assignee: { accountId: "a1", displayName: "Robin", avatarUrls: {} } }), "Sprint 1");
    expect(emitTicketEvent).toHaveBeenCalledTimes(1);
    expect(lastEmittedKinds()).toEqual(["assignee", "points", "status"]);
  });
});
