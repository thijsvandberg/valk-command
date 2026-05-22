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

const mockGetSprintsLightweight = vi.fn().mockResolvedValue([]);

vi.mock("@/lib/jira-client", () => ({
  jiraClient: {
    getSprintsLightweight: (...args: unknown[]) => mockGetSprintsLightweight(...args),
  },
}));

import { refreshSprintMetadata } from "./refresh-sprint-metadata";

describe("refreshSprintMetadata", () => {
  beforeEach(() => {
    testDb = createTestDb();
    mockGetSprintsLightweight.mockReset().mockResolvedValue([]);
  });

  it("refreshes when no previous sync exists", async () => {
    const { appSetting } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");

    mockGetSprintsLightweight.mockResolvedValue([
      { id: 100, name: "Sprint 1", state: "active", startDate: "2026-05-01", endDate: "2026-05-14", goal: "Ship feature X" },
      { id: 101, name: "Sprint 2", state: "future" },
    ]);

    const result = await refreshSprintMetadata();

    expect(result).toBe(true);
    expect(mockGetSprintsLightweight).toHaveBeenCalled();

    const cached = testDb.select().from(appSetting)
      .where(eq(appSetting.key, "jira_sprints")).get();
    const sprints = JSON.parse(cached!.value);
    expect(sprints).toHaveLength(2);
    expect(sprints[0].goal).toBe("Ship feature X");
    expect(sprints[0].completeDate).toBeNull();
  });

  it("skips when cooldown has not elapsed", async () => {
    const { appSetting } = await import("@/db/schema");
    testDb.insert(appSetting).values({
      key: "jira_sprint_sync_watermark",
      value: new Date().toISOString(),
    }).run();

    const result = await refreshSprintMetadata();

    expect(result).toBe(false);
    expect(mockGetSprintsLightweight).not.toHaveBeenCalled();
  });

  it("refreshes when cooldown has elapsed", async () => {
    const { appSetting } = await import("@/db/schema");
    testDb.insert(appSetting).values({
      key: "jira_sprint_sync_watermark",
      value: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
    }).run();

    mockGetSprintsLightweight.mockResolvedValue([
      { id: 100, name: "Sprint 1", state: "active" },
    ]);

    const result = await refreshSprintMetadata();

    expect(result).toBe(true);
    expect(mockGetSprintsLightweight).toHaveBeenCalled();
  });

  it("detects state transitions and logs them", async () => {
    const { appSetting, activityLog } = await import("@/db/schema");
    const { like } = await import("drizzle-orm");

    testDb.insert(appSetting).values({
      key: "jira_sprints",
      value: JSON.stringify([
        { id: 100, name: "Sprint 1", state: "future", startDate: null, endDate: null, completeDate: null, goal: null },
      ]),
    }).run();

    mockGetSprintsLightweight.mockResolvedValue([
      { id: 100, name: "Sprint 1", state: "active", startDate: "2026-05-01", endDate: "2026-05-14", goal: "Go live" },
    ]);

    await refreshSprintMetadata();

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
      key: "jira_sprints",
      value: JSON.stringify([
        { id: 99, name: "Old Sprint", state: "closed", startDate: null, endDate: null, completeDate: "2026-04-30", goal: null },
        { id: 100, name: "Sprint 1", state: "future", startDate: null, endDate: null, completeDate: null, goal: null },
      ]),
    }).run();

    mockGetSprintsLightweight.mockResolvedValue([
      { id: 100, name: "Sprint 1", state: "active", startDate: "2026-05-01" },
    ]);

    await refreshSprintMetadata();

    const cached = testDb.select().from(appSetting)
      .where(eq(appSetting.key, "jira_sprints")).get();
    const sprints = JSON.parse(cached!.value);

    expect(sprints).toHaveLength(2);
    const closed = sprints.find((s: { id: number }) => s.id === 99);
    expect(closed).toBeDefined();
    expect(closed.state).toBe("closed");

    const active = sprints.find((s: { id: number }) => s.id === 100);
    expect(active.state).toBe("active");
  });
});
