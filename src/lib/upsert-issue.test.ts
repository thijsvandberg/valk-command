// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, ticketSubtask, ticketMetadata, storyVersion, storyWriterSession, conversation, ticketSprint, jiraUser, ticketStatusChange, ticketScopeChange } from "@/db/schema";
import { eq, asc } from "drizzle-orm";

let testDb: BetterSQLite3Database<typeof schema>;

function bridgeFor(key: string): string[] {
  return testDb
    .select({ sprintId: ticketSprint.sprintId })
    .from(ticketSprint)
    .where(eq(ticketSprint.ticketKey, key))
    .orderBy(asc(ticketSprint.sprintId))
    .all()
    .map((r) => r.sprintId);
}

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
  extractLastStatusChangeAuthor: vi.fn().mockReturnValue(null),
  extractLastSprintChangeAuthor: vi.fn().mockReturnValue(null),
  FLAGGED_FIELD: "customfield_10002",
}));

vi.mock("@/lib/adf-to-markdown", () => ({
  adfToMarkdown: vi.fn().mockReturnValue(""),
}));

vi.mock("@/lib/ticket-events", () => ({
  emitTicketEvent: vi.fn(),
}));

import { normalizeIssueType, normalizeStatus, userColor, upsertIssue } from "./upsert-issue";
import { extractSprints, extractStoryPoints, extractLastChangeAuthor, extractLastStatusChangeAuthor, extractLastSprintChangeAuthor } from "@/lib/jira-client";
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
    // The indexed bridge mirrors every membership.
    expect(bridgeFor("VPL-1")).toEqual(["100", "200"]);
  });

  it("leaves sprint_ids null when the issue is in no sprint (backlog)", async () => {
    vi.mocked(extractSprints).mockReturnValue([]);

    await upsertIssue(makeIssue(), "");

    const row = testDb.select().from(ticket).all()[0];
    expect(row.sprintIds).toBeNull();
    expect(bridgeFor("VPL-1")).toEqual([]);
  });

  it("removes stale bridge rows when a re-sync changes the membership", async () => {
    vi.mocked(extractSprints).mockReturnValue([
      { id: 100, name: "Sprint A", state: "closed" },
      { id: 200, name: "Sprint B", state: "active" },
    ] as JiraSprint[]);
    await upsertIssue(makeIssue(), "200");
    expect(bridgeFor("VPL-1")).toEqual(["100", "200"]);

    vi.mocked(extractSprints).mockReturnValue([
      { id: 300, name: "Sprint C", state: "active" },
    ] as JiraSprint[]);
    await upsertIssue(makeIssue(), "300");
    expect(bridgeFor("VPL-1")).toEqual(["300"]);
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

  it("captures the reporter's stable identity (accountId, avatar, email) from the issue payload", async () => {
    const issue = makeIssue({
      reporter: {
        accountId: "acc-reporter-1",
        displayName: "Thijs van den Berg",
        emailAddress: "thijs@newstory.nl",
        avatarUrls: { "48x48": "https://example.com/thijs.png" },
      },
    });
    await upsertIssue(issue, "Sprint 1");

    const row = testDb.select().from(ticket).all()[0];
    expect(row.reporter).toBe("Thijs van den Berg");
    expect(row.reporterAccountId).toBe("acc-reporter-1");
    expect(row.reporterEmail).toBe("thijs@newstory.nl");
    expect(row.reporterAvatar).toBe("https://example.com/thijs.png");
  });

  it("captures the assignee's email alongside the existing accountId", async () => {
    const issue = makeIssue({
      assignee: {
        accountId: "acc-assignee-1",
        displayName: "Robin",
        emailAddress: "robin@newstory.nl",
        avatarUrls: { "48x48": "https://example.com/robin.png" },
      },
    });
    await upsertIssue(issue, "Sprint 1");

    const row = testDb.select().from(ticket).all()[0];
    expect(row.assigneeAccountId).toBe("acc-assignee-1");
    expect(row.assigneeEmail).toBe("robin@newstory.nl");
  });

  it("keeps the same reporter accountId after a display-name rename", async () => {
    await upsertIssue(makeIssue({
      reporter: { accountId: "acc-reporter-1", displayName: "Thijs van den Berg", avatarUrls: {} },
    }), "Sprint 1");

    // Same person, renamed in Jira.
    await upsertIssue(makeIssue({
      reporter: { accountId: "acc-reporter-1", displayName: "Thijs vd Berg", avatarUrls: {} },
    }), "Sprint 1");

    const row = testDb.select().from(ticket).all()[0];
    expect(row.reporter).toBe("Thijs vd Berg");
    expect(row.reporterAccountId).toBe("acc-reporter-1");
  });

  it("populates the jira_user directory for reporter and assignee", async () => {
    await upsertIssue(makeIssue({
      reporter: { accountId: "acc-rep", displayName: "Thijs", emailAddress: "thijs@newstory.nl", avatarUrls: { "48x48": "https://example.com/thijs.png" } },
      assignee: { accountId: "acc-asg", displayName: "Robin", emailAddress: "robin@newstory.nl", avatarUrls: { "48x48": "https://example.com/robin.png" } },
    }), "Sprint 1");

    const users = testDb.select().from(jiraUser).all();
    const byId = new Map(users.map((u) => [u.accountId, u]));
    expect(byId.get("acc-rep")).toMatchObject({ displayName: "Thijs", email: "thijs@newstory.nl", avatar: "https://example.com/thijs.png" });
    expect(byId.get("acc-asg")).toMatchObject({ displayName: "Robin", email: "robin@newstory.nl" });
  });

  it("records comment authors, subtask assignees and linked-issue assignees in jira_user", async () => {
    await upsertIssue(makeIssue({
      comment: {
        total: 1,
        comments: [{ id: "c1", author: { accountId: "acc-author", displayName: "Author", avatarUrls: {} }, body: "hi", created: "2024-01-02T00:00:00.000Z", updated: "2024-01-02T00:00:00.000Z" }],
      },
      subtasks: [{
        id: "20001", key: "VPL-2",
        fields: { summary: "Child", issuetype: { name: "Sub-task" }, status: { name: "To Do" }, assignee: { accountId: "acc-sub", displayName: "Subbie", avatarUrls: {} } },
      }],
      issuelinks: [{
        id: "l1", type: { name: "Blocks", inward: "is blocked by", outward: "blocks" },
        outwardIssue: { id: "30001", key: "VPL-9", fields: { summary: "Linked", status: { name: "Done" }, issuetype: { name: "Story" }, assignee: { accountId: "acc-link", displayName: "Linker", avatarUrls: {} } } },
      }],
    }), "Sprint 1");

    const ids = testDb.select().from(jiraUser).all().map((u) => u.accountId).sort();
    expect(ids).toEqual(["acc-author", "acc-link", "acc-sub"]);
  });

  it("updates the single jira_user row when a person is renamed in Jira", async () => {
    await upsertIssue(makeIssue({ reporter: { accountId: "acc-rep", displayName: "Thijs van den Berg", avatarUrls: {} } }), "Sprint 1");
    await upsertIssue(makeIssue({ reporter: { accountId: "acc-rep", displayName: "Thijs vd Berg", avatarUrls: {} } }), "Sprint 1");

    const users = testDb.select().from(jiraUser).where(eq(jiraUser.accountId, "acc-rep")).all();
    expect(users).toHaveLength(1);
    expect(users[0].displayName).toBe("Thijs vd Berg");
  });

  it("skips people without an accountId (no jira_user row)", async () => {
    await upsertIssue(makeIssue({ reporter: { accountId: "", displayName: "Anon", avatarUrls: {} } as never }), "Sprint 1");
    expect(testDb.select().from(jiraUser).all()).toHaveLength(0);
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

  it("attributes an own-push echo version to the signed-in user, not the Jira changelog author", async () => {
    vi.mocked(extractLastChangeAuthor).mockReturnValue({ name: "Marek van der Hoeven", avatar: "marek.png" });

    await upsertIssue(makeIssue({ description: "Original content" }), "");
    const v1 = testDb.select().from(storyVersion).all()[0];

    // Bridge pushed "New content"; the push wrote the mirror directly
    testDb.update(ticket).set({ description: "New content" }).where(eq(ticket.jiraKey, "VPL-1")).run();

    await tick();
    // The push echoes back through sync, carrying the signed-in user captured at push time
    await upsertIssue(makeIssue({ description: "New content" }), "", undefined, undefined, {
      name: "Robin Bänffer",
      avatar: "robin.png",
    });

    const latest = testDb.select().from(storyVersion).all().find((v) => v.contentHash !== v1.contentHash);
    expect(latest?.updatedBy).toBe("Robin Bänffer");
    expect(latest?.updatedByAvatar).toBe("robin.png");

    vi.mocked(extractLastChangeAuthor).mockReturnValue(null);
  });

  it("keeps the Jira changelog author for a genuine external change even when a push author is absent", async () => {
    vi.mocked(extractLastChangeAuthor).mockReturnValue({ name: "Marek van der Hoeven", avatar: "marek.png" });

    await upsertIssue(makeIssue({ description: "Original content" }), "");
    const v1 = testDb.select().from(storyVersion).all()[0];

    await tick();
    // Someone edited the description in Jira; the mirror still has the old text, so this is not an echo
    await upsertIssue(makeIssue({ description: "External edit from Jira" }), "");

    const latest = testDb.select().from(storyVersion).all().find((v) => v.contentHash !== v1.contentHash);
    expect(latest?.updatedBy).toBe("Marek van der Hoeven");

    vi.mocked(extractLastChangeAuthor).mockReturnValue(null);
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

describe("atomic upsert hardening (BRDG-376)", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.mocked(extractSprints).mockReturnValue([]);
    vi.mocked(extractStoryPoints).mockReturnValue(null);
    vi.mocked(emitTicketEvent).mockClear();
  });

  it("does not abort the ticket sync when two version-creating upserts land on the same millisecond", async () => {
    // Previously the version PK was `sv-<key>-<Date.now()>`; two upserts within
    // one millisecond produced identical ids, so the second insert threw inside
    // the transaction and rolled back the entire ticket upsert. With UUID ids
    // both succeed even with a frozen clock.
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    try {
      await upsertIssue(makeIssue({ description: "First content" }), "Sprint 1");
      await upsertIssue(makeIssue({ description: "Second content" }), "Sprint 1");
    } finally {
      nowSpy.mockRestore();
    }

    const versions = testDb.select().from(storyVersion).all();
    expect(versions).toHaveLength(2);
    // The second upsert committed: the ticket reflects the latest content.
    const row = testDb.select().from(ticket).all()[0];
    expect(row.description).toBe("Second content");
  });

  it("does not abort when two status-changing upserts land on the same millisecond", async () => {
    // ticket_status_change PKs were also `sc-<key>-<Date.now()>`; same collision risk.
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    try {
      await upsertIssue(makeIssue({ status: { name: "To Do" } }), "Sprint 1");
      await upsertIssue(makeIssue({ status: { name: "In Progress" } }), "Sprint 1");
      await upsertIssue(makeIssue({ status: { name: "Done" } }), "Sprint 1");
    } finally {
      nowSpy.mockRestore();
    }

    const row = testDb.select().from(ticket).all()[0];
    expect(row.status).toBe("DONE");
  });

  it("computes the version diff against committed state: identical content never duplicates a version", async () => {
    // The snapshot reads now live inside the write transaction, so the
    // new-version decision is made against committed state. A re-sync of
    // unchanged content must not append a second version row.
    // (True concurrent interleaving cannot be simulated with synchronous
    // better-sqlite3; this asserts the resulting invariant.)
    await upsertIssue(makeIssue({ description: "Stable content" }), "Sprint 1");
    await upsertIssue(makeIssue({ description: "Stable content" }), "Sprint 1");
    await upsertIssue(makeIssue({ description: "Stable content" }), "Sprint 1");

    const versions = testDb.select().from(storyVersion).all();
    expect(versions).toHaveLength(1);
  });

  it("appends exactly one new version when content changes", async () => {
    await upsertIssue(makeIssue({ description: "v1" }), "Sprint 1");
    await upsertIssue(makeIssue({ description: "v2" }), "Sprint 1");

    const versions = testDb.select().from(storyVersion).all();
    expect(versions).toHaveLength(2);
    const hashes = new Set(versions.map((v) => v.contentHash));
    expect(hashes.size).toBe(2);
  });
});

describe("status change capture (BRDG-414)", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.mocked(extractSprints).mockReturnValue([]);
    vi.mocked(extractStoryPoints).mockReturnValue(null);
    vi.mocked(extractLastStatusChangeAuthor).mockReturnValue(null);
  });

  it("stores the changelog author and the Jira event time on a status change", async () => {
    await upsertIssue(makeIssue(), "Sprint 1");
    vi.mocked(extractLastStatusChangeAuthor).mockReturnValue({
      name: "Carol Smit",
      accountId: "acc-carol",
      avatar: "carol.png",
      changedAt: "2024-02-02T10:00:00.000Z",
    });

    await upsertIssue(makeIssue({ status: { name: "In Progress" } }), "Sprint 1");

    const rows = testDb.select().from(ticketStatusChange).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].fromStatus).toBe("TO DO");
    expect(rows[0].toStatus).toBe("IN PROGRESS");
    expect(rows[0].changedBy).toBe("Carol Smit");
    expect(rows[0].changedByAccountId).toBe("acc-carol");
    expect(rows[0].changedByAvatar).toBe("carol.png");
    // The Jira event time, not the local sync time.
    expect(rows[0].changedAt).toBe("2024-02-02T10:00:00.000Z");
  });

  it("falls back to fields.updated and null author when the changelog has no status entry", async () => {
    await upsertIssue(makeIssue(), "Sprint 1");
    await upsertIssue(makeIssue({ status: { name: "Done" }, updated: "2024-03-03T12:00:00.000Z" }), "Sprint 1");

    const rows = testDb.select().from(ticketStatusChange).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].toStatus).toBe("DONE");
    expect(rows[0].changedBy).toBeNull();
    expect(rows[0].changedAt).toBe("2024-03-03T12:00:00.000Z");
  });

  it("does not record a row when the status is unchanged", async () => {
    await upsertIssue(makeIssue(), "Sprint 1");
    await upsertIssue(makeIssue({ summary: "Renamed" }), "Sprint 1");
    expect(testDb.select().from(ticketStatusChange).all()).toHaveLength(0);
  });
});

describe("sprint-add capture (BRDG-439)", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.mocked(extractSprints).mockReturnValue([]);
    vi.mocked(extractStoryPoints).mockReturnValue(null);
    vi.mocked(extractLastStatusChangeAuthor).mockReturnValue(null);
    vi.mocked(extractLastSprintChangeAuthor).mockReturnValue(null);
  });

  it("records an 'added' scope change with the Sprint changelog author when a ticket gains a sprint", async () => {
    // First sync: not in any sprint -> no add event.
    await upsertIssue(makeIssue(), "");
    expect(testDb.select().from(ticketScopeChange).all()).toHaveLength(0);

    // Second sync: dragged into sprint 200 by Frank.
    vi.mocked(extractSprints).mockReturnValue([{ id: 200, name: "Sprint X", state: "active" }] as JiraSprint[]);
    vi.mocked(extractLastSprintChangeAuthor).mockReturnValue({
      name: "Frank van den Nouland",
      accountId: "acc-frank",
      avatar: "frank.png",
      changedAt: "2026-06-27T10:00:00.000Z",
    });
    await upsertIssue(makeIssue(), "200");

    const rows = testDb.select().from(ticketScopeChange).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("added");
    expect(rows[0].ticketKey).toBe("VPL-1");
    expect(rows[0].sprintName).toBe("200");
    expect(rows[0].changedBy).toBe("Frank van den Nouland");
    expect(rows[0].changedByAccountId).toBe("acc-frank");
    expect(rows[0].id).toBe(`scope-VPL-1-add-${new Date("2026-06-27T10:00:00.000Z").getTime()}`);
  });

  it("falls back to the reporter + created time for a ticket created straight into a sprint", async () => {
    vi.mocked(extractSprints).mockReturnValue([{ id: 200, name: "Sprint X", state: "active" }] as JiraSprint[]);
    vi.mocked(extractLastSprintChangeAuthor).mockReturnValue(null); // no Sprint changelog on a fresh ticket
    const issue = makeIssue({
      reporter: { accountId: "acc-rep", displayName: "Thijs van den Berg", avatarUrls: { "48x48": "thijs.png" } },
      created: "2026-06-26T08:00:00.000Z",
    });
    await upsertIssue(issue, "200");

    const rows = testDb.select().from(ticketScopeChange).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].changedBy).toBe("Thijs van den Berg");
    expect(rows[0].changedByAccountId).toBe("acc-rep");
    expect(rows[0].changedAt).toBe("2026-06-26T08:00:00.000Z");
  });

  it("does not duplicate the 'added' row on a re-sync that keeps the ticket in the sprint", async () => {
    vi.mocked(extractSprints).mockReturnValue([{ id: 200, name: "Sprint X", state: "active" }] as JiraSprint[]);
    vi.mocked(extractLastSprintChangeAuthor).mockReturnValue({
      name: "Frank", accountId: null, avatar: null, changedAt: "2026-06-27T10:00:00.000Z",
    });
    await upsertIssue(makeIssue(), "200");
    await upsertIssue(makeIssue({ summary: "Renamed" }), "200");
    expect(testDb.select().from(ticketScopeChange).all()).toHaveLength(1);
  });

  it("does not record an add for a ticket that is in no sprint", async () => {
    await upsertIssue(makeIssue(), "");
    expect(testDb.select().from(ticketScopeChange).all()).toHaveLength(0);
  });
});
