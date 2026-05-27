// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";

const { mockGetIssuesByKeys, mockGetIssue } = vi.hoisted(() => ({
  mockGetIssuesByKeys: vi.fn().mockResolvedValue([]),
  mockGetIssue: vi.fn(),
}));

vi.mock("@/lib/jira-client", () => ({
  jiraClient: {
    isLive: false,
    getUpdatedSince: vi.fn(),
    getIssuesByKeys: mockGetIssuesByKeys,
    getIssue: mockGetIssue,
  },
  JiraApiError: class JiraApiError extends Error {
    status: number;
    constructor(status: number, statusText: string, body: string, path: string) {
      super(`Jira API ${status} ${statusText} on ${path}: ${body}`);
      this.status = status;
      this.name = "JiraApiError";
    }
  },
  extractSprint: vi.fn(),
}));
vi.mock("@/lib/upsert-issue", () => ({
  upsertIssue: vi.fn(),
  cacheSprintName: vi.fn(),
}));
vi.mock("@/lib/search-index-cache", () => ({
  invalidateSearchCache: vi.fn(),
}));
vi.mock("@/lib/sync-abort", () => ({
  registerSync: vi.fn(() => ({ signal: undefined, abort: vi.fn() })),
  unregisterSync: vi.fn(),
}));
vi.mock("@/lib/upsert-setting", () => ({
  upsertSetting: vi.fn(),
}));
vi.mock("@/lib/scheduler", () => ({
  defineTask: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/notifications", () => ({
  createNotification: vi.fn(),
}));

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import { cleanupActivityLog, cleanupOldNotifications, revalidateDeletedTickets } from "./scheduled-tasks";
import { jiraClient, JiraApiError } from "@/lib/jira-client";
import { enqueue, _reset as resetQueue } from "@/lib/revalidation-queue";
import { activityLog, alert, ticket } from "@/db/schema";
import { eq } from "drizzle-orm";

describe("cleanupActivityLog", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("marks stale running entries as failed", async () => {
    const staleTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    testDb.insert(activityLog).values({
      id: "sync-stale",
      type: "sprint-sync",
      scope: "sprints",
      status: "running",
      startedAt: staleTime,
    }).run();

    await cleanupActivityLog();

    const row = testDb.select().from(activityLog).all().find((r) => r.id === "sync-stale");
    expect(row?.status).toBe("failed");
    expect(row?.errorDetail).toContain("timed out");
  });

  it("does not mark recent running entries as failed", async () => {
    const recentTime = new Date(Date.now() - 60 * 1000).toISOString();
    testDb.insert(activityLog).values({
      id: "sync-recent-running",
      type: "sprint-sync",
      scope: "sprints",
      status: "running",
      startedAt: recentTime,
    }).run();

    await cleanupActivityLog();

    const row = testDb.select().from(activityLog).all().find((r) => r.id === "sync-recent-running");
    expect(row?.status).toBe("running");
  });

  it("deletes entries older than 7 days", async () => {
    const oldTime = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const recentTime = new Date().toISOString();

    testDb.insert(activityLog).values({
      id: "sync-old",
      type: "sprint-sync",
      scope: "sprints",
      status: "success",
      startedAt: oldTime,
    }).run();
    testDb.insert(activityLog).values({
      id: "sync-new",
      type: "sprint-sync",
      scope: "sprints",
      status: "success",
      startedAt: recentTime,
    }).run();

    await cleanupActivityLog();

    const remaining = testDb.select().from(activityLog).all();
    expect(remaining.map((r) => r.id)).not.toContain("sync-old");
    expect(remaining.map((r) => r.id)).toContain("sync-new");
  });

  it("keeps at most 200 entries, deleting oldest beyond that", async () => {
    for (let i = 0; i < 210; i++) {
      const time = new Date(Date.now() - i * 1000).toISOString();
      testDb.insert(activityLog).values({
        id: `sync-${i.toString().padStart(3, "0")}`,
        type: "sprint-sync",
        scope: "sprints",
        status: "success",
        startedAt: time,
      }).run();
    }

    await cleanupActivityLog();

    const remaining = testDb.select().from(activityLog).all();
    expect(remaining.length).toBe(200);
  });
});

describe("cleanupOldNotifications", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("deletes alerts older than 30 days", async () => {
    const oldTime = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    const recentTime = new Date().toISOString();

    testDb.insert(alert).values({
      id: "alert-old",
      type: "sync",
      message: "old alert",
      createdAt: oldTime,
      read: false,
    }).run();
    testDb.insert(alert).values({
      id: "alert-new",
      type: "sync",
      message: "new alert",
      createdAt: recentTime,
      read: false,
    }).run();

    await cleanupOldNotifications();

    const remaining = testDb.select().from(alert).all();
    expect(remaining.map((r) => r.id)).not.toContain("alert-old");
    expect(remaining.map((r) => r.id)).toContain("alert-new");
  });

  it("keeps alerts within 30 days", async () => {
    const recentTime = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    testDb.insert(alert).values({
      id: "alert-recent",
      type: "sync",
      message: "recent alert",
      createdAt: recentTime,
      read: false,
    }).run();

    await cleanupOldNotifications();

    const remaining = testDb.select().from(alert).all();
    expect(remaining).toHaveLength(1);
  });
});

describe("revalidateDeletedTickets", () => {
  function insertTicket(key: string) {
    testDb.insert(ticket).values({
      jiraKey: key,
      title: `Ticket ${key}`,
      status: "To Do",
    }).run();
  }

  beforeEach(() => {
    testDb = createTestDb();
    resetQueue();
    mockGetIssuesByKeys.mockReset().mockResolvedValue([]);
    mockGetIssue.mockReset();
    (jiraClient as unknown as Record<string, unknown>).isLive = true;
  });

  afterEach(() => {
    (jiraClient as unknown as Record<string, unknown>).isLive = false;
  });

  it("skips when Jira is not configured", async () => {
    (jiraClient as unknown as Record<string, unknown>).isLive = false;
    const result = await revalidateDeletedTickets();
    expect(result).toMatchObject({ skipped: true });
  });

  it("returns zero counts when queue is empty", async () => {
    const result = await revalidateDeletedTickets();
    expect(result).toMatchObject({ checked: 0, removed: 0, queueSize: 0 });
  });

  it("marks a 404 ticket as removed", async () => {
    insertTicket("VPL-100");
    insertTicket("VPL-200");
    enqueue(["VPL-100", "VPL-200"]);

    mockGetIssuesByKeys.mockResolvedValue([{ key: "VPL-200", fields: {} }]);
    mockGetIssue.mockRejectedValue(new JiraApiError(404, "Not Found", "", "/rest/api/3/issue/VPL-100"));

    const result = await revalidateDeletedTickets();

    expect(result).toMatchObject({ checked: 2, removed: 1 });
    const row = testDb.select().from(ticket).where(eq(ticket.jiraKey, "VPL-100")).get();
    expect(row?.removedFromJiraAt).toBeTruthy();
  });

  it("does not mark a ticket as removed if individual fetch succeeds", async () => {
    insertTicket("VPL-100");
    enqueue(["VPL-100"]);

    mockGetIssuesByKeys.mockResolvedValue([]);
    mockGetIssue.mockResolvedValue({ key: "VPL-100", fields: {} });

    const result = await revalidateDeletedTickets();

    expect(result).toMatchObject({ checked: 1, removed: 0 });
    const row = testDb.select().from(ticket).where(eq(ticket.jiraKey, "VPL-100")).get();
    expect(row?.removedFromJiraAt).toBeNull();
  });

  it("only checks tickets in the queue", async () => {
    insertTicket("VPL-100");
    insertTicket("VPL-200");
    enqueue(["VPL-200"]);

    mockGetIssuesByKeys.mockResolvedValue([{ key: "VPL-200", fields: {} }]);

    const result = await revalidateDeletedTickets();

    expect(result).toMatchObject({ checked: 1, removed: 0 });
    expect(mockGetIssuesByKeys).toHaveBeenCalledWith(["VPL-200"]);
  });

  it("reports queue stats in result", async () => {
    insertTicket("VPL-100");
    insertTicket("VPL-200");
    insertTicket("VPL-300");
    enqueue(["VPL-100", "VPL-200", "VPL-300"]);

    mockGetIssuesByKeys.mockResolvedValue([
      { key: "VPL-100", fields: {} },
      { key: "VPL-200", fields: {} },
      { key: "VPL-300", fields: {} },
    ]);

    const result = await revalidateDeletedTickets();

    expect(result).toMatchObject({ checked: 3, removed: 0, queueSize: 0 });
  });
});
