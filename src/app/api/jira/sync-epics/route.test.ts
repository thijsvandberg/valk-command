// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { activityLog } from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn().mockReturnValue(null) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/cache", () => ({ cache: { get: vi.fn(), set: vi.fn(), invalidate: vi.fn() } }));
vi.mock("@/lib/env", () => ({
  env: { JIRA_PROJECT_KEY: "VPL" },
}));
vi.mock("@/lib/agent-fetch", () => ({
  agentFetch: vi.fn().mockResolvedValue({}),
}));

const mockUpsertIssue = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/lib/upsert-issue", () => ({
  upsertIssue: mockUpsertIssue,
}));

vi.mock("@/lib/jira-client", () => ({
  jiraClient: {
    searchAllIssues: vi.fn().mockResolvedValue([]),
  },
  ISSUE_FIELDS: "summary,status,issuetype,priority,assignee",
}));

vi.mock("next/server", async (importOriginal) => {
  const orig = await importOriginal<typeof import("next/server")>();
  return {
    ...orig,
    after: vi.fn((cb: () => unknown) => cb()),
  };
});

import { POST } from "./route";
import { jiraClient } from "@/lib/jira-client";
import { cache } from "@/lib/cache";

function makeRequest(): Request {
  return new Request("http://localhost:3100/api/jira/sync-epics", { method: "POST" });
}

describe("POST /api/jira/sync-epics", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
    vi.mocked(jiraClient.searchAllIssues).mockResolvedValue([]);
    mockUpsertIssue.mockResolvedValue(undefined);
  });

  it("returns count of upserted epics", async () => {
    vi.mocked(jiraClient.searchAllIssues).mockResolvedValue([
      { id: "1", key: "VPL-E1", fields: { summary: "Epic 1" } },
      { id: "2", key: "VPL-E2", fields: { summary: "Epic 2" } },
    ] as never);

    const res = await POST(makeRequest());
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.count).toBe(2);
    expect(mockUpsertIssue).toHaveBeenCalledTimes(2);
  });

  it("returns count 0 when no epics found", async () => {
    const res = await POST(makeRequest());
    const data = await res.json();
    expect(data.count).toBe(0);
  });

  it("invalidates cache for epics and tickets", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(vi.mocked(cache.invalidate)).toHaveBeenCalledWith("/api/epics");
    expect(vi.mocked(cache.invalidate)).toHaveBeenCalledWith(/^\/api\/tickets/);
  });

  it("creates activity log with success status", async () => {
    await POST(makeRequest());

    const logs = testDb.select().from(activityLog).all();
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe("success");
    expect(logs[0].type).toBe("ticket-sync");
  });

  it("returns 500 and marks activity as failed on error", async () => {
    vi.mocked(jiraClient.searchAllIssues).mockRejectedValue(new Error("Network error"));

    const res = await POST(makeRequest());
    expect(res.status).toBe(500);

    const logs = testDb.select().from(activityLog).all();
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe("failed");
  });
});
