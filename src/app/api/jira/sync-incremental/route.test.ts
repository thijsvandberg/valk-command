import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

const mockGetUpdatedSince = vi.fn().mockResolvedValue([]);
const mockGetIssuesByKeys = vi.fn().mockResolvedValue([]);
const mockGetSprintsLightweight = vi.fn().mockResolvedValue([]);

vi.mock("@/lib/jira-client", () => ({
  jiraClient: {
    isLive: true,
    getUpdatedSince: (...args: unknown[]) => mockGetUpdatedSince(...args),
    getIssuesByKeys: (...args: unknown[]) => mockGetIssuesByKeys(...args),
    getSprintsLightweight: (...args: unknown[]) => mockGetSprintsLightweight(...args),
    getLastChangeAuthor: vi.fn().mockResolvedValue(null),
  },
  extractSprint: () => null,
  extractStoryPoints: () => null,
  extractEpicLink: () => null,
  extractAcceptanceCriteria: () => null,
  extractLastChangeAuthor: () => null,
  FLAGGED_FIELD: "customfield_10002",
}));

vi.mock("@/lib/adf-to-markdown", () => ({
  adfToMarkdown: (doc: unknown) => (typeof doc === "string" ? doc : ""),
}));

vi.mock("@/lib/sync-abort", () => ({
  registerSync: () => new AbortController(),
  unregisterSync: () => {},
}));

import { POST } from "./route";

describe("POST /api/jira/sync-incremental", () => {
  beforeEach(() => {
    testDb = createTestDb();
    mockGetUpdatedSince.mockReset().mockResolvedValue([]);
    mockGetIssuesByKeys.mockReset().mockResolvedValue([]);
    mockGetSprintsLightweight.mockReset().mockResolvedValue([]);
  });

  it("returns needsFullSync when no watermark exists", async () => {
    const res = await POST();
    const data = await res.json();

    expect(data.ok).toBe(false);
    expect(data.needsFullSync).toBe(true);
  });

  it("returns count 0 when no tickets changed", async () => {
    const { appSetting } = await import("@/db/schema");
    testDb.insert(appSetting).values({
      key: "jira_sync_watermark",
      value: "2026-04-01T00:00:00.000Z",
    }).run();

    mockGetUpdatedSince.mockResolvedValue([]);

    const res = await POST();
    const data = await res.json();

    expect(data.ok).toBe(true);
    expect(data.count).toBe(0);
  });

  it("syncs changed tickets and advances watermark", async () => {
    const { appSetting } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    testDb.insert(appSetting).values({
      key: "jira_sync_watermark",
      value: "2026-04-01T00:00:00.000Z",
    }).run();

    mockGetUpdatedSince.mockResolvedValue([
      { key: "VPL-200", updated: "2026-04-02T10:00:00.000Z" },
    ]);

    mockGetIssuesByKeys.mockResolvedValue([
      {
        id: "20001",
        key: "VPL-200",
        fields: {
          summary: "New feature",
          issuetype: { name: "Story" },
          status: { name: "To Do" },
          assignee: null,
          reporter: null,
          labels: [],
          flagged: false,
          description: "Some description",
          created: "2026-04-02T09:00:00.000Z",
          updated: "2026-04-02T10:00:00.000Z",
          components: [],
        },
      },
    ]);

    const res = await POST();
    const data = await res.json();

    expect(data.ok).toBe(true);
    expect(data.count).toBe(1);
    expect(data.tickets).toContain("VPL-200");

    // Watermark should be advanced
    const watermark = testDb
      .select()
      .from(appSetting)
      .where(eq(appSetting.key, "jira_sync_watermark"))
      .get();
    expect(watermark?.value).toBe("2026-04-02T10:00:00.000Z");
  });

  it("skips tickets that are already up to date locally", async () => {
    const { appSetting, ticket } = await import("@/db/schema");
    testDb.insert(appSetting).values({
      key: "jira_sync_watermark",
      value: "2026-04-01T00:00:00.000Z",
    }).run();

    // Insert a local ticket that is already up to date
    testDb.insert(ticket).values({
      jiraKey: "VPL-300",
      title: "Already synced",
      status: "TO DO",
      jiraUpdatedAt: "2026-04-02T10:00:00.000Z",
    }).run();

    mockGetUpdatedSince.mockResolvedValue([
      { key: "VPL-300", updated: "2026-04-02T10:00:00.000Z" },
    ]);

    const res = await POST();
    const data = await res.json();

    expect(data.ok).toBe(true);
    expect(data.count).toBe(0);
    expect(mockGetIssuesByKeys).not.toHaveBeenCalled();
  });

  it("returns skipped response when called within cooldown window", async () => {
    const { appSetting } = await import("@/db/schema");
    testDb.insert(appSetting).values({
      key: "jira_sync_watermark",
      value: "2026-04-01T00:00:00.000Z",
    }).run();

    // Set the cooldown key to "just now"
    testDb.insert(appSetting).values({
      key: "jira_sync_last_run",
      value: new Date().toISOString(),
    }).run();

    const res = await POST();
    const data = await res.json();

    expect(data.ok).toBe(true);
    expect(data.skipped).toBe(true);
    expect(data.cooldownRemaining).toBeGreaterThan(0);
    expect(mockGetUpdatedSince).not.toHaveBeenCalled();
  });

  it("proceeds normally when cooldown has expired", async () => {
    const { appSetting } = await import("@/db/schema");
    testDb.insert(appSetting).values({
      key: "jira_sync_watermark",
      value: "2026-04-01T00:00:00.000Z",
    }).run();

    // Set cooldown to 3 minutes ago (past the 120s window)
    testDb.insert(appSetting).values({
      key: "jira_sync_last_run",
      value: new Date(Date.now() - 180_000).toISOString(),
    }).run();

    mockGetUpdatedSince.mockResolvedValue([]);

    const res = await POST();
    const data = await res.json();

    expect(data.ok).toBe(true);
    expect(data.skipped).toBeUndefined();
    expect(mockGetUpdatedSince).toHaveBeenCalled();
  });

  it("returns last result data in skipped response", async () => {
    const { appSetting } = await import("@/db/schema");
    testDb.insert(appSetting).values({
      key: "jira_sync_watermark",
      value: "2026-04-01T00:00:00.000Z",
    }).run();
    testDb.insert(appSetting).values({
      key: "jira_sync_last_run",
      value: new Date().toISOString(),
    }).run();
    testDb.insert(appSetting).values({
      key: "jira_sync_last_result",
      value: JSON.stringify({ count: 5, remaining: 12 }),
    }).run();

    const res = await POST();
    const data = await res.json();

    expect(data.skipped).toBe(true);
    expect(data.count).toBe(5);
    expect(data.remaining).toBe(12);
  });

  it("clears cooldown after a sync failure", async () => {
    const { appSetting } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    testDb.insert(appSetting).values({
      key: "jira_sync_watermark",
      value: "2026-04-01T00:00:00.000Z",
    }).run();

    mockGetUpdatedSince.mockRejectedValue(new Error("Jira unreachable"));

    const res = await POST();
    const data = await res.json();

    expect(data.ok).toBe(false);
    expect(data.error).toBe("Incremental sync failed");

    // Cooldown should be reset (epoch) so next poll is not blocked
    const cooldown = testDb
      .select()
      .from(appSetting)
      .where(eq(appSetting.key, "jira_sync_last_run"))
      .get();
    const elapsed = Date.now() - new Date(cooldown!.value).getTime();
    expect(elapsed).toBeGreaterThan(120_000);
  });

  describe("sprint metadata refresh", () => {
    it("refreshes sprint metadata when no previous sync exists", async () => {
      const { appSetting } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");
      testDb.insert(appSetting).values({
        key: "jira_sync_watermark",
        value: "2026-04-01T00:00:00.000Z",
      }).run();

      mockGetSprintsLightweight.mockResolvedValue([
        { id: 100, name: "Sprint 1", state: "active", startDate: "2026-05-01", endDate: "2026-05-14", goal: "Ship feature X" },
        { id: 101, name: "Sprint 2", state: "future" },
      ]);

      const res = await POST();
      const data = await res.json();

      expect(data.sprintMetaRefreshed).toBe(true);
      expect(mockGetSprintsLightweight).toHaveBeenCalled();

      // Sprint data should be cached
      const cached = testDb.select().from(appSetting)
        .where(eq(appSetting.key, "jira_sprints")).get();
      const sprints = JSON.parse(cached!.value);
      expect(sprints).toHaveLength(2);
      expect(sprints[0].goal).toBe("Ship feature X");
      expect(sprints[0].completeDate).toBeNull();
    });

    it("skips sprint refresh when cooldown has not elapsed", async () => {
      const { appSetting } = await import("@/db/schema");
      testDb.insert(appSetting).values({
        key: "jira_sync_watermark",
        value: "2026-04-01T00:00:00.000Z",
      }).run();
      testDb.insert(appSetting).values({
        key: "jira_sprint_sync_watermark",
        value: new Date().toISOString(),
      }).run();

      const res = await POST();
      const data = await res.json();

      expect(data.sprintMetaRefreshed).toBe(false);
      expect(mockGetSprintsLightweight).not.toHaveBeenCalled();
    });

    it("refreshes when sprint cooldown has elapsed", async () => {
      const { appSetting } = await import("@/db/schema");
      testDb.insert(appSetting).values({
        key: "jira_sync_watermark",
        value: "2026-04-01T00:00:00.000Z",
      }).run();
      testDb.insert(appSetting).values({
        key: "jira_sprint_sync_watermark",
        value: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
      }).run();

      mockGetSprintsLightweight.mockResolvedValue([
        { id: 100, name: "Sprint 1", state: "active" },
      ]);

      const res = await POST();
      const data = await res.json();

      expect(data.sprintMetaRefreshed).toBe(true);
      expect(mockGetSprintsLightweight).toHaveBeenCalled();
    });

    it("detects state transitions and logs them", async () => {
      const { appSetting, activityLog } = await import("@/db/schema");
      const { like } = await import("drizzle-orm");
      testDb.insert(appSetting).values({
        key: "jira_sync_watermark",
        value: "2026-04-01T00:00:00.000Z",
      }).run();

      // Pre-populate with a future sprint
      testDb.insert(appSetting).values({
        key: "jira_sprints",
        value: JSON.stringify([
          { id: 100, name: "Sprint 1", state: "future", startDate: null, endDate: null, completeDate: null, goal: null },
        ]),
      }).run();

      // Now it comes back as active
      mockGetSprintsLightweight.mockResolvedValue([
        { id: 100, name: "Sprint 1", state: "active", startDate: "2026-05-01", endDate: "2026-05-14", goal: "Go live" },
      ]);

      const res = await POST();
      const data = await res.json();

      expect(data.sprintMetaRefreshed).toBe(true);

      // Should have logged the transition
      const logs = testDb.select().from(activityLog)
        .where(like(activityLog.id, "sprint-transition-%")).all();
      expect(logs).toHaveLength(1);
      expect(logs[0].summary).toContain("future");
      expect(logs[0].summary).toContain("active");
    });

    it("preserves closed sprints during merge", async () => {
      const { appSetting } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");
      testDb.insert(appSetting).values({
        key: "jira_sync_watermark",
        value: "2026-04-01T00:00:00.000Z",
      }).run();

      // Pre-populate with a closed sprint and a future sprint
      testDb.insert(appSetting).values({
        key: "jira_sprints",
        value: JSON.stringify([
          { id: 99, name: "Old Sprint", state: "closed", startDate: null, endDate: null, completeDate: "2026-04-30", goal: null },
          { id: 100, name: "Sprint 1", state: "future", startDate: null, endDate: null, completeDate: null, goal: null },
        ]),
      }).run();

      // Lightweight fetch returns only active+future
      mockGetSprintsLightweight.mockResolvedValue([
        { id: 100, name: "Sprint 1", state: "active", startDate: "2026-05-01" },
      ]);

      await POST();

      const cached = testDb.select().from(appSetting)
        .where(eq(appSetting.key, "jira_sprints")).get();
      const sprints = JSON.parse(cached!.value);

      // Closed sprint should still be there
      expect(sprints).toHaveLength(2);
      const closed = sprints.find((s: { id: number }) => s.id === 99);
      expect(closed).toBeDefined();
      expect(closed.state).toBe("closed");

      // The future sprint should now be active
      const active = sprints.find((s: { id: number }) => s.id === 100);
      expect(active.state).toBe("active");
    });

    it("includes sprintMetaRefreshed in cooldown-skipped responses", async () => {
      const { appSetting } = await import("@/db/schema");
      testDb.insert(appSetting).values({
        key: "jira_sync_watermark",
        value: "2026-04-01T00:00:00.000Z",
      }).run();
      // Ticket sync on cooldown
      testDb.insert(appSetting).values({
        key: "jira_sync_last_run",
        value: new Date().toISOString(),
      }).run();

      mockGetSprintsLightweight.mockResolvedValue([
        { id: 100, name: "Sprint 1", state: "active" },
      ]);

      const res = await POST();
      const data = await res.json();

      expect(data.skipped).toBe(true);
      expect(data.sprintMetaRefreshed).toBe(true);
    });

    it("does not block ticket sync when sprint refresh fails", async () => {
      const { appSetting } = await import("@/db/schema");
      testDb.insert(appSetting).values({
        key: "jira_sync_watermark",
        value: "2026-04-01T00:00:00.000Z",
      }).run();

      mockGetSprintsLightweight.mockRejectedValue(new Error("Agile API down"));
      mockGetUpdatedSince.mockResolvedValue([]);

      const res = await POST();
      const data = await res.json();

      // Ticket sync should still succeed
      expect(data.ok).toBe(true);
      expect(data.count).toBe(0);
      expect(data.sprintMetaRefreshed).toBe(false);
    });
  });
});
