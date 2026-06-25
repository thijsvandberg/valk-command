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

import { cleanupActivityLog, cleanupOldNotifications, revalidateDeletedTickets, runDeprecationStalenessScan, runAutoEnqueue, reconcileStuckTasks } from "./scheduled-tasks";
import { jiraClient, JiraApiError } from "@/lib/jira-client";
import { logger } from "@/lib/logger";
import { enqueue, _reset as resetQueue } from "@/lib/revalidation-queue";
import { activityLog, alert, ticket, appSetting, workspaceTask } from "@/db/schema";
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

describe("runDeprecationStalenessScan — subtask exclusion", () => {
  function insertTicket(key: string, type: string | null, sprintName = "", status = "TO DO") {
    testDb.insert(ticket).values({
      jiraKey: key,
      title: `Ticket ${key}`,
      status,
      type,
      sprintName,
    }).run();
  }

  beforeEach(() => {
    testDb = createTestDb();
  });

  it("reports backlogSize: 0 when the only backlog ticket is a subtask", async () => {
    // Subtasks must never be eligible for scanning; the scan should see an empty backlog.
    insertTicket("BT-SUB", "subtask");
    const result = await runDeprecationStalenessScan();
    expect(result).toMatchObject({ scanned: 0, candidates: 0, backlogSize: 0 });
  });

  it("counts parent-level types as eligible (story, task, bug, spike, epic)", async () => {
    insertTicket("BT-STORY", "story");
    insertTicket("BT-TASK", "task");
    insertTicket("BT-BUG", "bug");
    insertTicket("BT-SPIKE", "spike");
    insertTicket("BT-EPIC", "epic");
    // The scan batch processes up to STALENESS_SCAN_BATCH_SIZE tickets; all five
    // are eligible so backlogSize should be 5 (scanned may be less if batched).
    const result = await runDeprecationStalenessScan();
    expect((result as { backlogSize: number }).backlogSize).toBe(5);
  });

  it("does not count a subtask alongside eligible parent types", async () => {
    insertTicket("BT-STORY", "story");
    insertTicket("BT-SUB", "subtask"); // must not be counted
    const result = await runDeprecationStalenessScan();
    expect((result as { backlogSize: number }).backlogSize).toBe(1);
  });
});

describe("runAutoEnqueue — subtask exclusion", () => {
  function insertTicket(key: string, type: string | null, sprintName = "", status = "TO DO") {
    testDb.insert(ticket).values({
      jiraKey: key,
      title: `Ticket ${key}`,
      status,
      type,
      sprintName,
    }).run();
  }

  function enableAutoScan() {
    testDb.insert(appSetting).values({ key: "deprecation-auto-scan:enabled", value: "true" }).run();
    testDb.insert(appSetting).values({ key: "deprecation-auto-scan:daily-count", value: "100" }).run();
  }

  beforeEach(() => {
    testDb = createTestDb();
  });

  it("does not enqueue subtasks when selecting worst-staleness candidates", async () => {
    enableAutoScan();
    // Subtask should not appear in the eligible set that drives enqueue selection.
    insertTicket("BT-STORY", "story");
    insertTicket("BT-SUB", "subtask");
    const result = await runAutoEnqueue();
    // Enqueued count must not include BT-SUB; only BT-STORY is eligible.
    expect((result as { enqueued: number }).enqueued).toBe(1);
  });
});

// BRDG-402: the stuck-task reconciler is the final backstop for a background
// capture that crashed before recording an outcome. The 30-minute threshold MUST
// stay well clear of the 10-minute stream timeout so a live task is never killed.
describe("reconcileStuckTasks", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.mocked(logger.warn).mockClear();
  });

  function insertTask(id: string, status: "running" | "completed" | "failed", ageMs: number) {
    testDb.insert(workspaceTask).values({
      id,
      skillName: "review",
      status,
      startedAt: new Date(Date.now() - ageMs).toISOString(),
      conversationId: "conv-1",
    }).run();
  }

  const THIRTY_MIN = 30 * 60 * 1000;

  it("flips a running task older than 30 minutes to failed", async () => {
    insertTask("old-running", "running", THIRTY_MIN + 60_000);

    const result = await reconcileStuckTasks();

    expect((result as { reconciled: number }).reconciled).toBe(1);
    const row = testDb.select().from(workspaceTask).where(eq(workspaceTask.id, "old-running")).get();
    expect(row!.status).toBe("failed");
    expect(row!.completedAt).toBeTruthy();
    expect(row!.error).toContain("stuck in running");
  });

  it("does NOT touch a running task younger than 30 minutes (margin above the 10m stream timeout)", async () => {
    // 20 minutes: older than the 10m stream timeout but still inside the safe window.
    insertTask("live-running", "running", 20 * 60 * 1000);

    const result = await reconcileStuckTasks();

    expect((result as { reconciled: number }).reconciled).toBe(0);
    const row = testDb.select().from(workspaceTask).where(eq(workspaceTask.id, "live-running")).get();
    expect(row!.status).toBe("running");
  });

  it("ignores tasks that already completed or failed even if old", async () => {
    insertTask("done-old", "completed", THIRTY_MIN * 2);
    insertTask("failed-old", "failed", THIRTY_MIN * 2);

    const result = await reconcileStuckTasks();

    expect((result as { reconciled: number }).reconciled).toBe(0);
    expect(testDb.select().from(workspaceTask).where(eq(workspaceTask.id, "done-old")).get()!.status).toBe("completed");
  });

  it("logs a warn naming the reconciled task ids", async () => {
    insertTask("stuck-a", "running", THIRTY_MIN + 60_000);
    insertTask("stuck-b", "running", THIRTY_MIN + 60_000);

    await reconcileStuckTasks();

    const call = vi.mocked(logger.warn).mock.calls.find((c) => c[1] === "reconciled_stuck_tasks");
    expect(call).toBeDefined();
    const ctx = call![2] as Record<string, unknown>;
    expect(ctx.count).toBe(2);
    expect(ctx.taskIds).toEqual(expect.arrayContaining(["stuck-a", "stuck-b"]));
  });
});
