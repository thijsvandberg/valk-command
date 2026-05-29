// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { jiraComment, activityLog } from "@/db/schema";
import { seedTicket } from "@/test/builders";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn().mockReturnValue(null) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/sync-abort", () => ({
  registerSync: () => new AbortController(),
  unregisterSync: vi.fn(),
}));
vi.mock("@/lib/adf-to-markdown", () => ({
  adfToMarkdown: vi.fn().mockReturnValue("converted markdown"),
}));

vi.mock("@/lib/jira-client", () => ({
  jiraClient: {
    getComments: vi.fn().mockResolvedValue([]),
  },
}));

import { POST } from "./route";
import { jiraClient } from "@/lib/jira-client";

function makeRequest(key?: string): Request {
  const url = key
    ? `http://localhost:3100/api/jira/sync-comments?key=${key}`
    : "http://localhost:3100/api/jira/sync-comments";
  return new Request(url, { method: "POST" });
}

describe("POST /api/jira/sync-comments", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
    vi.mocked(jiraClient.getComments).mockResolvedValue([]);
  });

  it("returns 400 when key query param is missing", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(400);
  });

  it("syncs comments and returns count", async () => {
    seedTicket(testDb, { jiraKey: "VPL-100" });
    vi.mocked(jiraClient.getComments).mockResolvedValue([
      { id: "c1", body: "plain text", author: { accountId: "a1", displayName: "Alice", avatarUrls: { "48x48": "https://img/a.png" } }, created: "2026-01-01T00:00:00Z", updated: "2026-01-01T00:00:00Z" },
      { id: "c2", body: { type: "doc" }, author: { accountId: "a2", displayName: "Bob", avatarUrls: {} }, created: "2026-01-02T00:00:00Z", updated: "2026-01-02T00:00:00Z" },
      { id: "c3", body: "another comment", author: { accountId: "a3", displayName: "Unknown" }, created: "2026-01-03T00:00:00Z", updated: "2026-01-03T00:00:00Z" },
    ]);

    const res = await POST(makeRequest("VPL-100"));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.count).toBe(3);

    const rows = testDb.select().from(jiraComment).all();
    expect(rows).toHaveLength(3);
  });

  it("upserts correctly without duplicates on re-sync", async () => {
    seedTicket(testDb, { jiraKey: "VPL-100" });
    const comments = [
      { id: "c1", body: "original", author: { accountId: "a1", displayName: "Alice", avatarUrls: {} }, created: "2026-01-01T00:00:00Z", updated: "2026-01-01T00:00:00Z" },
    ];
    vi.mocked(jiraClient.getComments).mockResolvedValue(comments);

    await POST(makeRequest("VPL-100"));
    // Change body and re-sync
    comments[0].body = "updated";
    vi.mocked(jiraClient.getComments).mockResolvedValue(comments);
    await POST(makeRequest("VPL-100"));

    const rows = testDb.select().from(jiraComment).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe("updated");
  });

  it("creates activity log entry with success status", async () => {
    seedTicket(testDb, { jiraKey: "VPL-100" });
    vi.mocked(jiraClient.getComments).mockResolvedValue([]);

    await POST(makeRequest("VPL-100"));

    const logs = testDb.select().from(activityLog).all();
    expect(logs).toHaveLength(1);
    expect(logs[0].type).toBe("comment-sync");
    expect(logs[0].status).toBe("success");
    expect(logs[0].durationMs).toBeDefined();
  });

  it("returns 500 and marks activity as failed on Jira error", async () => {
    vi.mocked(jiraClient.getComments).mockRejectedValue(new Error("API error"));

    const res = await POST(makeRequest("VPL-100"));
    expect(res.status).toBe(500);

    const logs = testDb.select().from(activityLog).all();
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe("failed");
  });

  it("returns 499 on AbortError", async () => {
    const abortErr = new DOMException("Aborted", "AbortError");
    vi.mocked(jiraClient.getComments).mockRejectedValue(abortErr);

    const res = await POST(makeRequest("VPL-100"));
    expect(res.status).toBe(499);
  });
});
