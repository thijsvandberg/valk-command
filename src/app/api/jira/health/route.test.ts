import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { appSetting } from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/jira-client", () => ({
  jiraClient: {
    isLive: true,
    checkHealth: vi.fn().mockResolvedValue({ displayName: "Test User" }),
  },
}));

import { GET } from "./route";
import { jiraClient } from "@/lib/jira-client";

describe("GET /api/jira/health", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
    // Reset to default live state
    Object.defineProperty(jiraClient, "isLive", { value: true, writable: true });
    vi.mocked(jiraClient.checkHealth).mockResolvedValue({ displayName: "Test User" });
  });

  it("returns not-ok when jiraClient.isLive is false", async () => {
    Object.defineProperty(jiraClient, "isLive", { value: false, writable: true });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(false);
    expect(data.live).toBe(false);
    expect(data.error).toBe("Jira credentials not configured");
    expect(data.cachedDataAvailable).toBe(false);
  });

  it("returns ok when checkHealth succeeds", async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.live).toBe(true);
    expect(data.user).toEqual({ displayName: "Test User" });
  });

  it("returns error when checkHealth throws", async () => {
    vi.mocked(jiraClient.checkHealth).mockRejectedValueOnce(
      new Error("Connection refused"),
    );

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(false);
    expect(data.live).toBe(false);
    expect(data.error).toBe("Connection refused");
  });

  it("reports cachedDataAvailable when sprint data exists in DB", async () => {
    Object.defineProperty(jiraClient, "isLive", { value: false, writable: true });

    testDb
      .insert(appSetting)
      .values({
        key: "jira_sprints",
        value: JSON.stringify([{ id: 1, name: "Sprint 1" }]),
      })
      .run();

    const response = await GET();
    const data = await response.json();

    expect(data.ok).toBe(false);
    expect(data.cachedDataAvailable).toBe(true);
  });

  it("reports cachedDataAvailable on checkHealth failure with cached data", async () => {
    vi.mocked(jiraClient.checkHealth).mockRejectedValueOnce(
      new Error("Timeout"),
    );

    testDb
      .insert(appSetting)
      .values({
        key: "jira_sprints",
        value: JSON.stringify([{ id: 1, name: "Sprint 1" }]),
      })
      .run();

    const response = await GET();
    const data = await response.json();

    expect(data.ok).toBe(false);
    expect(data.cachedDataAvailable).toBe(true);
  });
});
