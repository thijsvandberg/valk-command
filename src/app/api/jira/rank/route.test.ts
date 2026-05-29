// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
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

vi.mock("@/lib/jira-client", () => ({
  jiraClient: {
    rankIssues: vi.fn().mockResolvedValue(undefined),
  },
}));

import { POST } from "./route";
import { jiraClient } from "@/lib/jira-client";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost:3100/api/jira/rank", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/jira/rank", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
  });

  it("returns 400 when issueKeys is empty", async () => {
    const res = await POST(makeRequest({ issueKeys: [], rankBeforeKey: "VPL-2" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when issueKeys is missing", async () => {
    const res = await POST(makeRequest({ rankBeforeKey: "VPL-2" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when neither rankBeforeKey nor rankAfterKey provided", async () => {
    const res = await POST(makeRequest({ issueKeys: ["VPL-1"] }));
    expect(res.status).toBe(400);
  });

  it("ranks with rankBeforeKey and returns ok", async () => {
    const res = await POST(makeRequest({
      issueKeys: ["VPL-1"],
      rankBeforeKey: "VPL-2",
    }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(vi.mocked(jiraClient.rankIssues)).toHaveBeenCalledWith(
      ["VPL-1"], "VPL-2", undefined,
    );
  });

  it("ranks with rankAfterKey", async () => {
    const res = await POST(makeRequest({
      issueKeys: ["VPL-1"],
      rankAfterKey: "VPL-3",
    }));
    expect(res.status).toBe(200);
    expect(vi.mocked(jiraClient.rankIssues)).toHaveBeenCalledWith(
      ["VPL-1"], undefined, "VPL-3",
    );
  });

  it("recalculates local jiraRank values when sprintId provided", async () => {
    seedTicket(testDb, { jiraKey: "VPL-1", sprintName: "sprint-10", jiraRank: 0 });
    seedTicket(testDb, { jiraKey: "VPL-2", sprintName: "sprint-10", jiraRank: 1 });
    seedTicket(testDb, { jiraKey: "VPL-3", sprintName: "sprint-10", jiraRank: 2 });

    await POST(makeRequest({
      issueKeys: ["VPL-3"],
      rankBeforeKey: "VPL-1",
      sprintId: "sprint-10",
    }));

    const rows = testDb.select({ jiraKey: ticket.jiraKey, jiraRank: ticket.jiraRank })
      .from(ticket)
      .where(eq(ticket.sprintName, "sprint-10"))
      .all();

    const rankMap = Object.fromEntries(rows.map((r) => [r.jiraKey, r.jiraRank]));
    expect(rankMap["VPL-3"]).toBeLessThan(rankMap["VPL-1"]!);
  });

  it("returns 500 when Jira API fails", async () => {
    vi.mocked(jiraClient.rankIssues).mockRejectedValueOnce(new Error("Jira error"));

    const res = await POST(makeRequest({
      issueKeys: ["VPL-1"],
      rankBeforeKey: "VPL-2",
    }));
    expect(res.status).toBe(500);
  });
});
