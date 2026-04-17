import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";

vi.mock("@/lib/jira-client", () => ({
  jiraClient: { isLive: false, getUpdatedSince: vi.fn() },
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
  logger: { error: vi.fn() },
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

import { cleanupActivityLog, cleanupOldNotifications } from "./scheduled-tasks";
import { activityLog, alert } from "@/db/schema";

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
