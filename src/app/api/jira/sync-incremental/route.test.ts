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

vi.mock("@/lib/jira-client", () => ({
  jiraClient: {
    isLive: true,
    getUpdatedSince: (...args: unknown[]) => mockGetUpdatedSince(...args),
    getIssuesByKeys: (...args: unknown[]) => mockGetIssuesByKeys(...args),
    getLastChangeAuthor: vi.fn().mockResolvedValue(null),
  },
  extractStoryPoints: () => null,
  extractEpicLink: () => null,
  extractAcceptanceCriteria: () => null,
}));

vi.mock("@/lib/sync-abort", () => ({
  registerSync: () => new AbortController(),
  unregisterSync: () => {},
}));

vi.mock("@/lib/adf-to-markdown", () => ({
  adfToMarkdown: (doc: unknown) => (typeof doc === "string" ? doc : ""),
}));

import { POST } from "./route";

describe("POST /api/jira/sync-incremental", () => {
  beforeEach(() => {
    testDb = createTestDb();
    mockGetUpdatedSince.mockReset().mockResolvedValue([]);
    mockGetIssuesByKeys.mockReset().mockResolvedValue([]);
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
});
