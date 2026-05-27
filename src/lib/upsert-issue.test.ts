// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, ticketSubtask, ticketMetadata } from "@/db/schema";

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
  extractEpicLink: vi.fn().mockReturnValue(null),
  extractAcceptanceCriteria: vi.fn().mockReturnValue(null),
  extractLastChangeAuthor: vi.fn().mockReturnValue(null),
  FLAGGED_FIELD: "customfield_10002",
}));

vi.mock("@/lib/adf-to-markdown", () => ({
  adfToMarkdown: vi.fn().mockReturnValue(""),
}));

import { normalizeIssueType, normalizeStatus, userColor, upsertIssue } from "./upsert-issue";
import type { JiraIssue } from "@/lib/jira-client";

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
  });

  it("inserts a new ticket into the database", async () => {
    const issue = makeIssue();
    await upsertIssue(issue, "Sprint 1");

    const all = testDb.select().from(ticket).all();
    expect(all).toHaveLength(1);
    expect(all[0].jiraKey).toBe("VPL-1");
    expect(all[0].title).toBe("Test issue");
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
