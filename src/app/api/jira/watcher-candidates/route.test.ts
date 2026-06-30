// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createJiraClientMock } from "@/test/mocks";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { favoriteUser, userTeamAssignment } from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

vi.mock("@/lib/jira-client", () => createJiraClientMock({
  jiraClient: {
    getAssignableUsers: vi.fn().mockResolvedValue([]),
  },
}));

import { GET } from "./route";
import { jiraClient } from "@/lib/jira-client";

describe("GET /api/jira/watcher-candidates", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
  });

  it("returns Jira users with their real accountIds", async () => {
    vi.mocked(jiraClient.getAssignableUsers).mockResolvedValueOnce([
      { accountId: "acc-1", displayName: "Alice Smith", avatarUrl: "https://x/a.png" },
      { accountId: "acc-2", displayName: "Bob Jones", avatarUrl: null },
    ]);

    const res = await GET();
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.users).toHaveLength(2);
    expect(data.users[0].accountId).toBe("acc-1");
    expect(data.users[0].avatarUrl).toBe("https://x/a.png");
  });

  it("enriches with isFavorite matched by display name", async () => {
    vi.mocked(jiraClient.getAssignableUsers).mockResolvedValueOnce([
      { accountId: "acc-1", displayName: "Alice Smith", avatarUrl: null },
      { accountId: "acc-2", displayName: "Bob Jones", avatarUrl: null },
    ]);
    testDb.insert(favoriteUser).values({ id: "fav-1", displayName: "Alice Smith" }).run();

    const res = await GET();
    const data = await res.json();
    const alice = data.users.find((u: { displayName: string }) => u.displayName === "Alice Smith");
    const bob = data.users.find((u: { displayName: string }) => u.displayName === "Bob Jones");
    expect(alice.isFavorite).toBe(true);
    expect(bob.isFavorite).toBe(false);
  });

  it("enriches with teams matched by display name", async () => {
    vi.mocked(jiraClient.getAssignableUsers).mockResolvedValueOnce([
      { accountId: "acc-1", displayName: "Alice Smith", avatarUrl: null },
    ]);
    testDb.insert(userTeamAssignment).values([
      { id: "uta-1", displayName: "Alice Smith", team: "BT" },
      { id: "uta-2", displayName: "Alice Smith", team: "BM" },
    ]).run();

    const res = await GET();
    const data = await res.json();
    expect(data.users[0].teams).toEqual(expect.arrayContaining(["BT", "BM"]));
  });

  it("returns 500 with empty users array when Jira fails", async () => {
    vi.mocked(jiraClient.getAssignableUsers).mockRejectedValueOnce(new Error("Jira down"));

    const res = await GET();
    const data = await res.json();
    expect(res.status).toBe(500);
    expect(data.users).toEqual([]);
    expect(data.error).toBeDefined();
  });
});
