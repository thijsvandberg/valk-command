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

vi.mock("@/lib/jira-client", () => ({
  jiraClient: {
    getSprints: vi.fn(),
  },
}));

vi.mock("@/lib/cache", () => ({
  cache: {
    get: vi.fn().mockReturnValue(undefined),
    set: vi.fn(),
    invalidate: vi.fn(),
    flush: vi.fn(),
  },
}));

import { jiraClient } from "@/lib/jira-client";
import { cache } from "@/lib/cache";
import { GET } from "./route";
import { appSetting } from "@/db/schema";

describe("GET /api/jira/sprints", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.resetAllMocks();
    vi.mocked(cache.get).mockReturnValue(undefined);
    vi.mocked(cache.set).mockImplementation(() => {});
  });

  it("returns sprints from DB when jira_sprints setting exists", async () => {
    const sprints = [
      { id: 1, name: "Sprint 1", state: "active", startDate: null, endDate: null, goal: null },
    ];
    testDb.insert(appSetting).values({
      key: "jira_sprints",
      value: JSON.stringify(sprints),
    }).run();

    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data[0].id).toBe(1);
    expect(data[0].name).toBe("Sprint 1");
    expect(typeof data[0].hidden).toBe("boolean");
  });

  it("fetches from Jira client when no DB setting exists", async () => {
    vi.mocked(jiraClient.getSprints).mockResolvedValue([
      { id: 42, name: "Sprint 42", state: "future", startDate: undefined, endDate: undefined, goal: undefined, boardId: undefined, completeDate: undefined },
    ]);

    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data[0].id).toBe(42);
    expect(jiraClient.getSprints).toHaveBeenCalled();
  });

  it("returns cached data when cache has an entry", async () => {
    const cached = [{ id: 99, name: "Cached Sprint", state: "active", hidden: false }];
    vi.mocked(cache.get).mockReturnValue(cached);

    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data[0].id).toBe(99);
    // Jira client should NOT be called when cache is hit
    expect(jiraClient.getSprints).not.toHaveBeenCalled();
  });
});
