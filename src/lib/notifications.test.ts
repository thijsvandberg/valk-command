import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { alert } from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/notification-preferences", () => ({
  getPreferences: vi.fn().mockReturnValue({
    general: true,
    pipeline: true,
    deployment: true,
    pr: true,
    sync: true,
    "story-writer": true,
    system: true,
    agent: true,
    scheduler: true,
  }),
}));

import { createNotification, createOrUpdateNotification } from "./notifications";
import { getPreferences } from "@/lib/notification-preferences";

describe("createNotification", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.resetAllMocks();
    vi.mocked(getPreferences).mockReturnValue({
      general: true,
      pipeline: true,
      deployment: true,
      pr: true,
      sync: true,
      "story-writer": true,
      system: true,
      agent: true,
      scheduler: true,
    });
  });

  it("inserts a notification into the alert table", () => {
    createNotification("pipeline", "Build failed", { category: "pipeline" });

    const rows = testDb.select().from(alert).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("pipeline");
    expect(rows[0].message).toBe("Build failed");
    expect(rows[0].category).toBe("pipeline");
  });

  it("skips notification when category is disabled", () => {
    vi.mocked(getPreferences).mockReturnValue({
      general: true,
      pipeline: false,
      deployment: true,
      pr: true,
      sync: true,
      "story-writer": true,
      system: true,
      agent: true,
      scheduler: true,
    });

    createNotification("pipeline", "Build failed", { category: "pipeline" });

    const rows = testDb.select().from(alert).all();
    expect(rows).toHaveLength(0);
  });
});

describe("createOrUpdateNotification", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.resetAllMocks();
    vi.mocked(getPreferences).mockReturnValue({
      general: true,
      pipeline: true,
      deployment: true,
      pr: true,
      sync: true,
      "story-writer": true,
      system: true,
      agent: true,
      scheduler: true,
    });
  });

  it("updates an existing unread notification with the same type and jiraKey", () => {
    const now = new Date().toISOString();
    testDb.insert(alert).values({
      id: "existing-1",
      type: "pr-merged",
      message: "PR merged",
      createdAt: now,
      jiraKey: "VPL-1",
      read: false,
    }).run();

    createOrUpdateNotification("pr-merged", "PR merged (updated)", { jiraKey: "VPL-1" });

    const rows = testDb.select().from(alert).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("existing-1");
    expect(rows[0].message).toBe("PR merged (updated)");
  });

  it("inserts a new notification when no duplicate exists", () => {
    createOrUpdateNotification("pr-merged", "PR merged", { jiraKey: "VPL-2" });

    const rows = testDb.select().from(alert).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("pr-merged");
    expect(rows[0].jiraKey).toBe("VPL-2");
  });

  it("inserts a new notification when no jiraKey is provided", () => {
    createOrUpdateNotification("system", "System notice");
    createOrUpdateNotification("system", "Another system notice");

    const rows = testDb.select().from(alert).all();
    expect(rows).toHaveLength(2);
  });
});
