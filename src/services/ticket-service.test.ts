// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, storyVersion, ticketLocalEdit, storyWriterSession, conversation } from "@/db/schema";
import { eq } from "drizzle-orm";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/jira-client", () => ({
  jiraClient: {
    get isLive() {
      return mockJiraLive;
    },
    getIssue: vi.fn(),
    updateIssue: vi.fn(),
  },
  FLAGGED_FIELD: "customfield_10002",
  JiraApiError: class JiraApiError extends Error {
    status: number;
    statusText: string;
    responseBody: string;
    path: string;
    constructor(status: number, statusText: string, responseBody: string, path: string) {
      super(`${status} ${statusText}`);
      this.status = status;
      this.statusText = statusText;
      this.responseBody = responseBody;
      this.path = path;
    }
  },
}));

vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/env", () => ({
  env: { NEXT_PUBLIC_APP_URL: "http://localhost:3100" },
}));

vi.mock("@/lib/cache", () => ({
  cache: {
    invalidate: vi.fn(),
  },
}));

vi.mock("@/lib/sync-tickets-service", () => ({
  syncIndividualTickets: vi.fn().mockResolvedValue(undefined),
  ingestIssue: vi.fn().mockResolvedValue(undefined),
}));

// fetch is not available in test env, so stub globally
const fetchMock = vi.fn().mockResolvedValue({ ok: true });
vi.stubGlobal("fetch", fetchMock);

let mockJiraLive = false;

import {
  getLocalEdits,
  upsertLocalEdit,
  deleteLocalEdits,
  rebaseLocalEdits,
  promoteDrafts,
  updateTicketMetadata,
  pullFromJira,
  pushToJira,
} from "./ticket-service";
import {
  ValidationError,
  NotFoundError,
  JiraUnavailableError,
  JiraOperationError,
} from "./errors";
import { jiraClient } from "@/lib/jira-client";
import { syncIndividualTickets, ingestIssue } from "@/lib/sync-tickets-service";

function seedTicket(db: BetterSQLite3Database<typeof schema>, key: string) {
  db.insert(ticket)
    .values({ jiraKey: key, title: `Ticket ${key}`, status: "TO DO" })
    .run();
}

function seedStoryVersion(
  db: BetterSQLite3Database<typeof schema>,
  key: string,
  hash: string,
  createdAt?: string,
) {
  db.insert(storyVersion)
    .values({
      id: `sv-${Math.random().toString(36).slice(2)}`,
      jiraKey: key,
      description: "desc",
      contentHash: hash,
      createdAt: createdAt ?? new Date().toISOString(),
    })
    .run();
}

// ---------------------------------------------------------------------------
// getLocalEdits
// ---------------------------------------------------------------------------

describe("getLocalEdits", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns empty array when no edits exist", async () => {
    const result = await getLocalEdits("VPL-1");
    expect(result).toEqual([]);
  });

  it("returns edits after upsert", async () => {
    seedTicket(testDb, "VPL-1");
    await upsertLocalEdit("VPL-1", { field: "title", localValue: "Hello" });
    const result = await getLocalEdits("VPL-1");
    expect(result).toHaveLength(1);
    expect(result[0].field).toBe("title");
  });
});

// ---------------------------------------------------------------------------
// upsertLocalEdit
// ---------------------------------------------------------------------------

describe("upsertLocalEdit", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("creates a title edit", async () => {
    seedTicket(testDb, "VPL-1");
    const result = await upsertLocalEdit("VPL-1", {
      field: "title",
      localValue: "New title",
    });
    expect(result.field).toBe("title");
    expect(result.localValue).toBe("New title");
    expect(result.ticketKey).toBe("VPL-1");
    expect(result.isDraft).toBe(false);
  });

  it("creates a description draft edit", async () => {
    seedTicket(testDb, "VPL-1");
    const result = await upsertLocalEdit("VPL-1", {
      field: "description",
      localValue: "Draft desc",
      isDraft: true,
    });
    expect(result.isDraft).toBe(true);
  });

  it("updates existing edit for same field", async () => {
    seedTicket(testDb, "VPL-1");
    await upsertLocalEdit("VPL-1", { field: "title", localValue: "First" });
    const result = await upsertLocalEdit("VPL-1", {
      field: "title",
      localValue: "Second",
    });
    expect(result.localValue).toBe("Second");
    const all = await getLocalEdits("VPL-1");
    expect(all).toHaveLength(1);
  });

  it("promotes draft to saved when saving over existing draft", async () => {
    seedTicket(testDb, "VPL-1");
    await upsertLocalEdit("VPL-1", {
      field: "description",
      localValue: "Draft v1",
      isDraft: true,
    });
    const result = await upsertLocalEdit("VPL-1", {
      field: "description",
      localValue: "Saved v1",
    });
    expect(result.isDraft).toBe(false);
  });

  it("keeps saved status when auto-saving over saved edit", async () => {
    seedTicket(testDb, "VPL-1");
    await upsertLocalEdit("VPL-1", {
      field: "description",
      localValue: "Saved",
    });
    const result = await upsertLocalEdit("VPL-1", {
      field: "description",
      localValue: "Updated",
      isDraft: true,
    });
    expect(result.isDraft).toBe(false);
  });

  it("throws ValidationError for invalid field", async () => {
    await expect(
      upsertLocalEdit("VPL-1", { field: "invalid", localValue: "test" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws ValidationError for non-string localValue", async () => {
    await expect(
      upsertLocalEdit("VPL-1", { field: "title", localValue: 123 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a title over Jira's 255-char limit with a friendly message (BRDG-349)", async () => {
    await expect(
      upsertLocalEdit("VPL-1", { field: "title", localValue: "x".repeat(256) }),
    ).rejects.toThrow(/too long for Jira \(max 255 characters\)/);
  });

  it("accepts a title at exactly Jira's 255-char limit (BRDG-349)", async () => {
    seedTicket(testDb, "VPL-1");
    const result = await upsertLocalEdit("VPL-1", { field: "title", localValue: "x".repeat(255) });
    expect(result.localValue).toHaveLength(255);
  });

  it("rejects a description over Jira's 32,767-char limit with a friendly message (BRDG-349)", async () => {
    await expect(
      upsertLocalEdit("VPL-1", { field: "description", localValue: "x".repeat(32768), isDraft: true }),
    ).rejects.toThrow(/too large for Jira/);
  });

  it("accepts a description at exactly Jira's 32,767-char limit (BRDG-349)", async () => {
    seedTicket(testDb, "VPL-1");
    const result = await upsertLocalEdit("VPL-1", {
      field: "description",
      localValue: "x".repeat(32767),
      isDraft: true,
    });
    expect(result.localValue).toHaveLength(32767);
  });

  it("uses provided baseJiraVersion", async () => {
    seedTicket(testDb, "VPL-1");
    const result = await upsertLocalEdit("VPL-1", {
      field: "title",
      localValue: "T",
      baseJiraVersion: "abc123",
    });
    expect(result.baseJiraVersion).toBe("abc123");
  });
});

// ---------------------------------------------------------------------------
// deleteLocalEdits
// ---------------------------------------------------------------------------

describe("deleteLocalEdits", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("deletes all local edits and returns clean", async () => {
    seedTicket(testDb, "VPL-1");
    await upsertLocalEdit("VPL-1", { field: "title", localValue: "t" });
    const editState = await deleteLocalEdits("VPL-1", { draftsOnly: false });
    const remaining = await getLocalEdits("VPL-1");
    expect(remaining).toHaveLength(0);
    expect(editState).toBe("clean");
  });

  it("deletes only drafts when draftsOnly=true and returns the remaining state", async () => {
    seedTicket(testDb, "VPL-1");
    await upsertLocalEdit("VPL-1", { field: "title", localValue: "saved" });
    await upsertLocalEdit("VPL-1", {
      field: "description",
      localValue: "draft",
      isDraft: true,
    });
    const editState = await deleteLocalEdits("VPL-1", { draftsOnly: true });
    const remaining = await getLocalEdits("VPL-1");
    expect(remaining).toHaveLength(1);
    expect(remaining[0].field).toBe("title");
    // A saved (non-draft) edit survives the drafts-only delete.
    expect(editState).toBe("local_edits");
  });

  it("returns clean when a drafts-only delete removes the last edit", async () => {
    seedTicket(testDb, "VPL-1");
    await upsertLocalEdit("VPL-1", {
      field: "description",
      localValue: "draft",
      isDraft: true,
    });
    const editState = await deleteLocalEdits("VPL-1", { draftsOnly: true });
    expect(await getLocalEdits("VPL-1")).toHaveLength(0);
    expect(editState).toBe("clean");
  });
});

// ---------------------------------------------------------------------------
// rebaseLocalEdits
// ---------------------------------------------------------------------------

describe("rebaseLocalEdits", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("throws NotFoundError when no story version exists", async () => {
    await expect(rebaseLocalEdits("VPL-1")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("updates baseJiraVersion on all edits and returns newBase", async () => {
    seedTicket(testDb, "VPL-1");
    seedStoryVersion(testDb, "VPL-1", "hash-abc");
    await upsertLocalEdit("VPL-1", { field: "title", localValue: "t" });
    const result = await rebaseLocalEdits("VPL-1");
    expect(result.newBase).toBe("hash-abc");
    const edits = await getLocalEdits("VPL-1");
    expect(edits[0].baseJiraVersion).toBe("hash-abc");
  });
});

// ---------------------------------------------------------------------------
// promoteDrafts
// ---------------------------------------------------------------------------

describe("promoteDrafts", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("promotes all drafts to saved", async () => {
    seedTicket(testDb, "VPL-1");
    await upsertLocalEdit("VPL-1", {
      field: "description",
      localValue: "draft",
      isDraft: true,
    });
    await promoteDrafts("VPL-1");
    const edits = await getLocalEdits("VPL-1");
    expect(edits[0].isDraft).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateTicketMetadata
// ---------------------------------------------------------------------------

describe("updateTicketMetadata", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("creates metadata for a ticket with none", async () => {
    seedTicket(testDb, "VPL-1");
    const result = await updateTicketMetadata("VPL-1", { poStatus: "New" });
    expect(result.poStatus).toBe("New");
    expect(result.jiraKey).toBe("VPL-1");
  });

  it("updates existing metadata", async () => {
    seedTicket(testDb, "VPL-1");
    await updateTicketMetadata("VPL-1", { poStatus: "New" });
    const result = await updateTicketMetadata("VPL-1", {
      poStatus: "Ready",
      qualityScore: 90,
    });
    expect(result.poStatus).toBe("Ready");
    expect(result.qualityScore).toBe(90);
  });

  it("allows setting poStatus to null", async () => {
    seedTicket(testDb, "VPL-1");
    await updateTicketMetadata("VPL-1", { poStatus: "Ready" });
    const result = await updateTicketMetadata("VPL-1", { poStatus: null });
    expect(result.poStatus).toBeNull();
  });

  it("throws NotFoundError when ticket not found", async () => {
    await expect(
      updateTicketMetadata("VPL-999", { poStatus: "Ready" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws ValidationError for invalid poStatus", async () => {
    seedTicket(testDb, "VPL-1");
    await expect(
      updateTicketMetadata("VPL-1", { poStatus: "Invalid" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws ValidationError for qualityScore out of range", async () => {
    seedTicket(testDb, "VPL-1");
    await expect(
      updateTicketMetadata("VPL-1", { qualityScore: 150 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws ValidationError for non-string poNotes", async () => {
    seedTicket(testDb, "VPL-1");
    await expect(
      updateTicketMetadata("VPL-1", { poNotes: 123 as unknown as string }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws ValidationError for poNotes exceeding 5000 chars", async () => {
    seedTicket(testDb, "VPL-1");
    await expect(
      updateTicketMetadata("VPL-1", { poNotes: "x".repeat(5001) }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("stores a valid Fibonacci guestimation", async () => {
    seedTicket(testDb, "VPL-1");
    const result = await updateTicketMetadata("VPL-1", { guestimation: 5 });
    expect(result.guestimation).toBe(5);
  });

  it("allows clearing the guestimation with null", async () => {
    seedTicket(testDb, "VPL-1");
    await updateTicketMetadata("VPL-1", { guestimation: 3 });
    const result = await updateTicketMetadata("VPL-1", { guestimation: null });
    expect(result.guestimation).toBeNull();
  });

  it("allows a 0 (N/A) guestimation", async () => {
    seedTicket(testDb, "VPL-1");
    const result = await updateTicketMetadata("VPL-1", { guestimation: 0 });
    expect(result.guestimation).toBe(0);
  });

  it("throws ValidationError for a non-Fibonacci guestimation", async () => {
    seedTicket(testDb, "VPL-1");
    await expect(
      updateTicketMetadata("VPL-1", { guestimation: 4 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

// ---------------------------------------------------------------------------
// pullFromJira
// ---------------------------------------------------------------------------

describe("pullFromJira", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.mocked(jiraClient.getIssue).mockReset();
  });

  it("returns description as markdown when ADF object", async () => {
    vi.mocked(jiraClient.getIssue).mockResolvedValue({
      fields: { description: { type: "doc", content: [] } },
    } as never);
    const result = await pullFromJira("VPL-1");
    expect(typeof result.description).toBe("string");
  });

  it("returns description as-is when already a string", async () => {
    vi.mocked(jiraClient.getIssue).mockResolvedValue({
      fields: { description: "plain text" },
    } as never);
    const result = await pullFromJira("VPL-1");
    expect(result.description).toBe("plain text");
  });

  it("returns empty string when description is null", async () => {
    vi.mocked(jiraClient.getIssue).mockResolvedValue({
      fields: { description: null },
    } as never);
    const result = await pullFromJira("VPL-1");
    expect(result.description).toBe("");
  });
});

// ---------------------------------------------------------------------------
// pushToJira
// ---------------------------------------------------------------------------

describe("pushToJira", () => {
  beforeEach(() => {
    testDb = createTestDb();
    mockJiraLive = false;
    vi.mocked(jiraClient.getIssue).mockReset();
    vi.mocked(jiraClient.updateIssue).mockReset();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true });
    vi.mocked(syncIndividualTickets).mockReset();
    vi.mocked(syncIndividualTickets).mockResolvedValue(undefined as never);
    vi.mocked(ingestIssue).mockReset();
    vi.mocked(ingestIssue).mockResolvedValue(undefined as never);
  });

  it("throws JiraUnavailableError when jiraClient is not live", async () => {
    mockJiraLive = false;
    await expect(pushToJira("VPL-1")).rejects.toBeInstanceOf(
      JiraUnavailableError,
    );
  });

  it("throws ValidationError when no local edits exist", async () => {
    mockJiraLive = true;
    await expect(pushToJira("VPL-1")).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("throws NotFoundError when ticket not in local db", async () => {
    mockJiraLive = true;
    // Disable FK checks so we can insert a local edit without a ticket row
    testDb.run("PRAGMA foreign_keys = OFF");
    testDb
      .insert(ticketLocalEdit)
      .values({
        id: "edit-1",
        ticketKey: "VPL-GHOST",
        field: "title",
        localValue: "orphaned",
        isDraft: false,
        modifiedAt: new Date().toISOString(),
      })
      .run();
    testDb.run("PRAGMA foreign_keys = ON");
    vi.mocked(jiraClient.getIssue).mockResolvedValue({
      fields: { updated: "2024-01-01T00:00:00Z" },
    } as never);
    await expect(pushToJira("VPL-GHOST")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws JiraOperationError when jiraClient.updateIssue throws JiraApiError", async () => {
    mockJiraLive = true;
    seedTicket(testDb, "VPL-1");
    await upsertLocalEdit("VPL-1", { field: "title", localValue: "t" });
    // Make local ticket's jiraUpdatedAt match remote so no conflict sync
    testDb
      .update(ticket)
      .set({ jiraUpdatedAt: "2024-01-01T00:00:00Z" })
      .where(eq(ticket.jiraKey, "VPL-1"))
      .run();
    vi.mocked(jiraClient.getIssue).mockResolvedValue({
      fields: { updated: "2024-01-01T00:00:00Z" },
    } as never);
    const { JiraApiError: Err } = await import("@/lib/jira-client");
    vi.mocked(jiraClient.updateIssue).mockRejectedValue(
      new Err(400, "Bad Request", '{"errorMessages":["field error"]}', "/issue/VPL-1"),
    );
    await expect(pushToJira("VPL-1")).rejects.toBeInstanceOf(
      JiraOperationError,
    );
  });

  it("returns success result when everything is fine", async () => {
    mockJiraLive = true;
    seedTicket(testDb, "VPL-1");
    testDb
      .update(ticket)
      .set({ jiraUpdatedAt: "2024-01-01T00:00:00Z" })
      .where(eq(ticket.jiraKey, "VPL-1"))
      .run();
    await upsertLocalEdit("VPL-1", { field: "title", localValue: "t" });
    vi.mocked(jiraClient.getIssue)
      .mockResolvedValueOnce({
        fields: { updated: "2024-01-01T00:00:00Z" },
      } as never)
      .mockResolvedValue({
        fields: { updated: "2024-01-02T00:00:00Z" },
      } as never);
    vi.mocked(jiraClient.updateIssue).mockResolvedValue(undefined as never);
    const result = await pushToJira("VPL-1");
    expect("success" in result && result.success).toBe(true);
    expect(ingestIssue).toHaveBeenCalledTimes(1);
  });

  it("succeeds without false conflict when Bridge synced jiraUpdatedAt after metadata push", async () => {
    mockJiraLive = true;
    seedTicket(testDb, "VPL-1");
    seedStoryVersion(testDb, "VPL-1", "hash-current", "2024-01-01T00:00:00.000Z");

    // Simulate: Bridge pushed a metadata change and synced the new timestamp
    testDb
      .update(ticket)
      .set({ jiraUpdatedAt: "2024-06-01T00:00:00Z" })
      .where(eq(ticket.jiraKey, "VPL-1"))
      .run();

    await upsertLocalEdit("VPL-1", {
      field: "title",
      localValue: "New title",
      baseJiraVersion: "hash-current",
    });

    // Remote returns the same timestamp that Bridge synced
    vi.mocked(jiraClient.getIssue)
      .mockResolvedValueOnce({
        fields: { updated: "2024-06-01T00:00:00Z" },
      } as never)
      .mockResolvedValue({
        fields: { updated: "2024-06-02T00:00:00Z" },
      } as never);
    vi.mocked(jiraClient.updateIssue).mockResolvedValue(undefined as never);

    const result = await pushToJira("VPL-1");
    expect("success" in result && result.success).toBe(true);
  });

  it("pushes without prompting when only metadata changed externally", async () => {
    mockJiraLive = true;
    seedTicket(testDb, "VPL-1");
    seedStoryVersion(testDb, "VPL-1", "hash-current", "2024-01-01T00:00:00.000Z");
    testDb
      .update(ticket)
      .set({ jiraUpdatedAt: "2024-01-01T00:00:00Z" })
      .where(eq(ticket.jiraKey, "VPL-1"))
      .run();

    await upsertLocalEdit("VPL-1", {
      field: "title",
      localValue: "New title",
      baseJiraVersion: "hash-current",
    });

    // Someone changed metadata directly in Jira (status, assignee, ...)
    vi.mocked(jiraClient.getIssue)
      .mockResolvedValueOnce({
        fields: { updated: "2024-07-01T00:00:00Z" },
      } as never)
      .mockResolvedValue({
        fields: { updated: "2024-07-02T00:00:00Z" },
      } as never);
    vi.mocked(jiraClient.updateIssue).mockResolvedValue(undefined as never);

    // After sync, content hash is unchanged (metadata-only change in Jira)
    vi.mocked(syncIndividualTickets).mockImplementationOnce(async () => {
      seedStoryVersion(testDb, "VPL-1", "hash-current", "2024-07-01T00:00:00.000Z");
      return undefined as never;
    });

    // Pushing title/description cannot clobber metadata, so no prompt
    const result = await pushToJira("VPL-1");
    expect(syncIndividualTickets).toHaveBeenCalledWith(["VPL-1"]);
    expect("success" in result && result.success).toBe(true);
  });

  it("skips conflict check for newly created tickets with no sync baseline", async () => {
    mockJiraLive = true;
    // Ticket created via Bridge: no jiraUpdatedAt, no storyVersion
    seedTicket(testDb, "VPL-1");
    await upsertLocalEdit("VPL-1", {
      field: "description",
      localValue: "New story content",
    });
    await upsertLocalEdit("VPL-1", {
      field: "title",
      localValue: "New title",
    });
    // Promote drafts to saved edits
    await promoteDrafts("VPL-1");

    // Remote returns a timestamp (Jira always has one)
    vi.mocked(jiraClient.getIssue)
      .mockResolvedValueOnce({
        fields: { updated: "2024-07-01T00:00:00Z" },
      } as never)
      .mockResolvedValue({
        fields: { updated: "2024-07-02T00:00:00Z" },
      } as never);

    // Sync creates the first storyVersion
    vi.mocked(syncIndividualTickets).mockImplementationOnce(async () => {
      seedStoryVersion(testDb, "VPL-1", "hash-from-jira", "2024-07-01T00:00:00.000Z");
      return undefined as never;
    });
    vi.mocked(jiraClient.updateIssue).mockResolvedValue(undefined as never);

    const result = await pushToJira("VPL-1");
    expect("success" in result && result.success).toBe(true);
    // The throwaway conflict-check sync must be skipped for brand-new tickets:
    // it is slow Jira work whose result is discarded and can time out, aborting
    // the very first wrap-up (BRDG-353).
    expect(syncIndividualTickets).not.toHaveBeenCalled();
  });

  it("returns conflict result when remote content changed", async () => {
    mockJiraLive = true;
    seedTicket(testDb, "VPL-1");
    // Seed the old version with an early timestamp so the new one sorts later
    seedStoryVersion(testDb, "VPL-1", "hash-old", "2024-01-01T00:00:00.000Z");
    testDb
      .update(ticket)
      .set({ jiraUpdatedAt: "2024-01-01T00:00:00Z" })
      .where(eq(ticket.jiraKey, "VPL-1"))
      .run();
    // Create edit with old baseJiraVersion
    await upsertLocalEdit("VPL-1", {
      field: "title",
      localValue: "t",
      baseJiraVersion: "hash-old",
    });
    // Remote reports a new updated timestamp
    vi.mocked(jiraClient.getIssue).mockResolvedValue({
      fields: { updated: "2024-12-01T00:00:00Z" },
    } as never);
    // After sync-tickets runs, a new story version row appears with a newer timestamp and different hash
    vi.mocked(syncIndividualTickets).mockImplementationOnce(async () => {
      seedStoryVersion(testDb, "VPL-1", "hash-new", "2024-12-01T00:00:00.000Z");
      return undefined as never;
    });
    const result = await pushToJira("VPL-1");
    expect("conflict" in result && result.conflict).toBe(true);
    if ("conflict" in result) {
      expect(result.contentChanged).toBe(true);
    }
  });

  it("rebases an active Story Writer session baseline onto the pushed version", async () => {
    mockJiraLive = true;
    seedTicket(testDb, "VPL-1");
    seedStoryVersion(testDb, "VPL-1", "hash-current", "2024-01-01T00:00:00.000Z");
    testDb
      .update(ticket)
      .set({ jiraUpdatedAt: "2024-01-01T00:00:00Z" })
      .where(eq(ticket.jiraKey, "VPL-1"))
      .run();

    // An active session whose baseline is stale relative to the version above
    testDb.insert(conversation).values({ id: "conv-1", title: "SW", relatedTicket: "VPL-1" }).run();
    testDb.insert(storyWriterSession).values({
      id: "sws-1",
      ticketKey: "VPL-1",
      conversationId: "conv-1",
      status: "active",
      localDraft: "draft",
      baseVersionHash: "stale-hash",
    }).run();

    await upsertLocalEdit("VPL-1", { field: "title", localValue: "t", baseJiraVersion: "hash-current" });
    vi.mocked(jiraClient.getIssue)
      .mockResolvedValueOnce({
        fields: { updated: "2024-01-01T00:00:00Z" },
      } as never)
      .mockResolvedValue({
        fields: { updated: "2024-01-02T00:00:00Z" },
      } as never);
    vi.mocked(jiraClient.updateIssue).mockResolvedValue(undefined as never);

    const result = await pushToJira("VPL-1");
    expect("success" in result && result.success).toBe(true);

    const session = testDb
      .select()
      .from(storyWriterSession)
      .where(eq(storyWriterSession.id, "sws-1"))
      .get();
    expect(session?.baseVersionHash).toBe("hash-current");
  });

  it("ingests the confirmed post-push state and rebases the session onto it", async () => {
    mockJiraLive = true;
    seedTicket(testDb, "VPL-1");
    seedStoryVersion(testDb, "VPL-1", "hash-old", "2024-01-01T00:00:00.000Z");
    testDb
      .update(ticket)
      .set({ jiraUpdatedAt: "2024-01-01T00:00:00Z" })
      .where(eq(ticket.jiraKey, "VPL-1"))
      .run();
    testDb.insert(conversation).values({ id: "conv-1", title: "SW", relatedTicket: "VPL-1" }).run();
    testDb.insert(storyWriterSession).values({
      id: "sws-1",
      ticketKey: "VPL-1",
      conversationId: "conv-1",
      status: "active",
      localDraft: "new draft",
      baseVersionHash: "hash-old",
    }).run();
    await upsertLocalEdit("VPL-1", {
      field: "description",
      localValue: "new draft",
      baseJiraVersion: "hash-old",
    });

    vi.mocked(jiraClient.getIssue)
      .mockResolvedValueOnce({
        fields: { updated: "2024-01-01T00:00:00Z" },
      } as never)
      .mockResolvedValue({
        fields: { updated: "2024-06-01T00:00:00Z" },
      } as never);
    vi.mocked(jiraClient.updateIssue).mockResolvedValue(undefined as never);
    // The ingest records the pushed content as the newest story version
    vi.mocked(ingestIssue).mockImplementationOnce(async () => {
      seedStoryVersion(testDb, "VPL-1", "hash-pushed", "2024-06-01T00:00:00.000Z");
      return undefined as never;
    });

    const result = await pushToJira("VPL-1");
    expect("success" in result && result.success).toBe(true);
    expect(ingestIssue).toHaveBeenCalledTimes(1);
    if ("success" in result) {
      expect(result.newContentHash).toBe("hash-pushed");
    }

    const session = testDb
      .select()
      .from(storyWriterSession)
      .where(eq(storyWriterSession.id, "sws-1"))
      .get();
    expect(session?.baseVersionHash).toBe("hash-pushed");
  });

  it("succeeds without ingesting when Jira keeps returning the pre-push state", async () => {
    mockJiraLive = true;
    seedTicket(testDb, "VPL-1");
    testDb
      .update(ticket)
      .set({ jiraUpdatedAt: "2024-01-01T00:00:00Z" })
      .where(eq(ticket.jiraKey, "VPL-1"))
      .run();
    await upsertLocalEdit("VPL-1", { field: "title", localValue: "t" });
    // Jira keeps serving the stale pre-push read after the update
    vi.mocked(jiraClient.getIssue).mockResolvedValue({
      fields: { updated: "2024-01-01T00:00:00Z" },
    } as never);
    vi.mocked(jiraClient.updateIssue).mockResolvedValue(undefined as never);

    vi.useFakeTimers();
    try {
      const pushPromise = pushToJira("VPL-1");
      await vi.advanceTimersByTimeAsync(2000);
      const result = await pushPromise;
      expect("success" in result && result.success).toBe(true);
      expect(ingestIssue).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not fail the push when the post-push ingest throws", async () => {
    mockJiraLive = true;
    seedTicket(testDb, "VPL-1");
    testDb
      .update(ticket)
      .set({ jiraUpdatedAt: "2024-01-01T00:00:00Z" })
      .where(eq(ticket.jiraKey, "VPL-1"))
      .run();
    await upsertLocalEdit("VPL-1", { field: "title", localValue: "t" });
    vi.mocked(jiraClient.getIssue)
      .mockResolvedValueOnce({
        fields: { updated: "2024-01-01T00:00:00Z" },
      } as never)
      .mockResolvedValue({
        fields: { updated: "2024-01-02T00:00:00Z" },
      } as never);
    vi.mocked(jiraClient.updateIssue).mockResolvedValue(undefined as never);
    vi.mocked(ingestIssue).mockRejectedValue(new Error("ingest boom"));

    const result = await pushToJira("VPL-1");
    expect("success" in result && result.success).toBe(true);
  });
});
