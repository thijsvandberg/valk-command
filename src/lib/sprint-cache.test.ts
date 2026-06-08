// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { appSetting, sprintNameCache } from "@/db/schema";
import { eq } from "drizzle-orm";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/jira-client", async () => {
  const { createJiraClientMock } = await import("@/test/mocks/jira-client");
  return createJiraClientMock();
});

vi.mock("@/lib/upsert-issue", () => ({
  cacheSprintName: vi.fn(),
}));

vi.mock("@/lib/cache", () => ({
  cache: { invalidate: vi.fn() },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { ensureSprintsCached } from "./sprint-cache";
import { jiraClient, JiraApiError } from "@/lib/jira-client";
import { cacheSprintName } from "@/lib/upsert-issue";
import { cache } from "@/lib/cache";

function seedSprintCache(sprints: Array<{ id: number; name: string; state: string }>) {
  const payload = JSON.stringify(
    sprints.map((s) => ({ ...s, startDate: null, endDate: null, completeDate: null, goal: null })),
  );
  testDb.insert(appSetting).values({ key: "jira_sprints", value: payload }).run();
}

function readSprintCache(): Array<{ id: number; name: string; endDate?: string | null }> {
  const row = testDb.select().from(appSetting).where(eq(appSetting.key, "jira_sprints")).get();
  return row ? JSON.parse(row.value) : [];
}

function seedSprintName(sprintId: string, displayName: string) {
  testDb.insert(sprintNameCache).values({ sprintId, displayName }).run();
}

function readSprintName(sprintId: string): string | undefined {
  return testDb.select().from(sprintNameCache).where(eq(sprintNameCache.sprintId, sprintId)).get()?.displayName;
}

describe("ensureSprintsCached", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testDb = createTestDb();
  });

  it("fetches and merges an unknown sprint into the cache", async () => {
    seedSprintCache([{ id: 10, name: "Sprint 10", state: "closed" }]);
    vi.mocked(jiraClient.getSprint).mockResolvedValue({
      id: 42,
      name: "Sprint 42",
      state: "future",
      startDate: "2026-07-01",
      endDate: "2026-07-14",
    });

    const added = await ensureSprintsCached(["42"]);

    expect(added).toBe(1);
    expect(jiraClient.getSprint).toHaveBeenCalledWith(42, undefined);
    expect(cacheSprintName).toHaveBeenCalledWith("42", "Sprint 42");
    const cached = readSprintCache();
    expect(cached.map((s) => s.id).sort()).toEqual([10, 42]);
    expect(cache.invalidate).toHaveBeenCalledWith("/api/jira/sprints");
  });

  it("creates the cache row when none exists yet", async () => {
    vi.mocked(jiraClient.getSprint).mockResolvedValue({ id: 7, name: "Sprint 7", state: "active" });

    const added = await ensureSprintsCached(["7"]);

    expect(added).toBe(1);
    expect(readSprintCache().map((s) => s.id)).toEqual([7]);
  });

  it("skips ids already in the cache", async () => {
    seedSprintCache([{ id: 42, name: "Sprint 42", state: "active" }]);

    const added = await ensureSprintsCached(["42"]);

    expect(added).toBe(0);
    expect(jiraClient.getSprint).not.toHaveBeenCalled();
  });

  it("ignores backlog and non-numeric ids", async () => {
    const added = await ensureSprintsCached(["", "__backlog__", "abc"]);

    expect(added).toBe(0);
    expect(jiraClient.getSprint).not.toHaveBeenCalled();
  });

  it("is best-effort: a failed fetch is skipped, not thrown", async () => {
    seedSprintCache([{ id: 1, name: "Sprint 1", state: "active" }]);
    vi.mocked(jiraClient.getSprint).mockRejectedValue(new Error("404"));

    const added = await ensureSprintsCached(["99"]);

    expect(added).toBe(0);
    // Existing cache is left intact.
    expect(readSprintCache().map((s) => s.id)).toEqual([1]);
  });

  it("dedupes repeated ids before fetching", async () => {
    vi.mocked(jiraClient.getSprint).mockResolvedValue({ id: 5, name: "Sprint 5", state: "future" });

    await ensureSprintsCached(["5", "5", "5"]);

    expect(jiraClient.getSprint).toHaveBeenCalledTimes(1);
  });

  it("removes a 404'd sprint from both jira_sprints and sprintNameCache", async () => {
    seedSprintCache([{ id: 10, name: "Sprint 10", state: "active" }]);
    seedSprintName("66", "VP Sprint 66 Angels");
    vi.mocked(jiraClient.getSprint).mockRejectedValue(
      new JiraApiError(404, "Not Found", "", "/rest/agile/1.0/sprint/66"),
    );

    const added = await ensureSprintsCached(["66"]);

    expect(added).toBe(0);
    // Other cached sprints are untouched; the missing one is gone from both stores.
    expect(readSprintCache().map((s) => s.id)).toEqual([10]);
    expect(readSprintName("66")).toBeUndefined();
    expect(cache.invalidate).toHaveBeenCalledWith("/api/jira/sprints");
  });

  it("leaves the cache intact on a transient (non-404) error", async () => {
    seedSprintCache([{ id: 10, name: "Sprint 10", state: "active" }]);
    seedSprintName("99", "Sprint 99");
    vi.mocked(jiraClient.getSprint).mockRejectedValue(
      new JiraApiError(503, "Service Unavailable", "", "/rest/agile/1.0/sprint/99"),
    );

    const added = await ensureSprintsCached(["99"]);

    expect(added).toBe(0);
    expect(readSprintCache().map((s) => s.id)).toEqual([10]);
    // A transient failure must not delete the name mapping.
    expect(readSprintName("99")).toBe("Sprint 99");
  });

  it("re-fetches a partially-known closed sprint and replaces it in place", async () => {
    // A closed sprint cached without an end date is incomplete and must be re-fetched.
    seedSprintCache([{ id: 50, name: "Sprint 50", state: "closed" }]);
    vi.mocked(jiraClient.getSprint).mockResolvedValue({
      id: 50,
      name: "Sprint 50",
      state: "closed",
      startDate: "2025-01-01",
      endDate: "2025-01-14",
    });

    const added = await ensureSprintsCached(["50"]);

    expect(added).toBe(1);
    expect(jiraClient.getSprint).toHaveBeenCalledWith(50, undefined);
    const cached = readSprintCache();
    // Replaced in place, not duplicated, and now carries the end date.
    expect(cached).toHaveLength(1);
    expect(cached[0].endDate).toBe("2025-01-14");
  });

  it("issues a single getSprint for concurrent calls of the same id (in-flight dedup)", async () => {
    let resolveFetch: (s: { id: number; name: string; state: string }) => void = () => {};
    const pending = new Promise<{ id: number; name: string; state: string }>((res) => {
      resolveFetch = res;
    });
    vi.mocked(jiraClient.getSprint).mockReturnValue(pending as ReturnType<typeof jiraClient.getSprint>);

    const first = ensureSprintsCached(["77"]);
    const second = ensureSprintsCached(["77"]);
    // Let both calls advance past their DB read and reach the shared fetch.
    await Promise.resolve();
    await Promise.resolve();
    resolveFetch({ id: 77, name: "Sprint 77", state: "future" });
    await Promise.all([first, second]);

    expect(jiraClient.getSprint).toHaveBeenCalledTimes(1);
  });
});
