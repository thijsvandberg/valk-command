// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createJiraClientMock } from "@/test/mocks";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { seedTicket } from "@/test/builders";
import { ticket } from "@/db/schema";
import { eq } from "drizzle-orm";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn().mockReturnValue(null) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/cache", () => ({ cache: { get: vi.fn(), set: vi.fn(), invalidate: vi.fn() } }));
vi.mock("@/lib/sync-jira-timestamp", () => ({ syncJiraTimestamp: vi.fn().mockResolvedValue(undefined) }));

vi.mock("@/lib/jira-client", () => createJiraClientMock({
  jiraClient: {
    assignIssue: vi.fn().mockResolvedValue(undefined),
  },
}));

import { POST } from "./route";
import { jiraClient } from "@/lib/jira-client";
import { cache } from "@/lib/cache";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost:3100/api/jira/assign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/jira/assign", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
  });

  it("returns 400 when issueKey is missing", async () => {
    const res = await POST(makeRequest({ accountId: "user-1" }));
    expect(res.status).toBe(400);
  });

  it("assigns using the real accountId and stores the display name locally", async () => {
    seedTicket(testDb, { jiraKey: "VPL-100", assignee: "Old User" });

    const res = await POST(makeRequest({
      issueKey: "VPL-100",
      accountId: "acc-real-123",
      name: "New User",
    }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(vi.mocked(jiraClient.assignIssue)).toHaveBeenCalledWith("VPL-100", "acc-real-123");

    const row = testDb.select().from(ticket).where(eq(ticket.jiraKey, "VPL-100")).get();
    expect(row?.assignee).toBe("New User");
  });

  it("returns 422 when a name is given without an accountId (not yet synced)", async () => {
    seedTicket(testDb, { jiraKey: "VPL-100", assignee: "Old User" });

    const res = await POST(makeRequest({ issueKey: "VPL-100", accountId: null, name: "Ghost" }));
    expect(res.status).toBe(422);
    expect(vi.mocked(jiraClient.assignIssue)).not.toHaveBeenCalled();

    const row = testDb.select().from(ticket).where(eq(ticket.jiraKey, "VPL-100")).get();
    expect(row?.assignee).toBe("Old User");
  });

  it("unassigns when accountId is null", async () => {
    seedTicket(testDb, { jiraKey: "VPL-100", assignee: "Some User" });

    const res = await POST(makeRequest({
      issueKey: "VPL-100",
      accountId: null,
      name: null,
    }));
    expect(res.status).toBe(200);
    expect(vi.mocked(jiraClient.assignIssue)).toHaveBeenCalledWith("VPL-100", null);

    const row = testDb.select().from(ticket).where(eq(ticket.jiraKey, "VPL-100")).get();
    expect(row?.assignee).toBeNull();
  });

  it("returns 500 when Jira API fails", async () => {
    vi.mocked(jiraClient.assignIssue).mockRejectedValueOnce(new Error("Jira down"));

    const res = await POST(makeRequest({ issueKey: "VPL-100", accountId: "acc-1" }));
    expect(res.status).toBe(500);
  });

  it("invalidates ticket cache on success", async () => {
    seedTicket(testDb, { jiraKey: "VPL-100" });

    await POST(makeRequest({ issueKey: "VPL-100", accountId: "acc-1", name: "User" }));
    expect(vi.mocked(cache.invalidate)).toHaveBeenCalledWith("/api/tickets");
  });
});
