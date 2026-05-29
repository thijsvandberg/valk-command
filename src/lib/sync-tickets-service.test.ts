// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, activityLog, ticketScopeChange } from "@/db/schema";
import { eq } from "drizzle-orm";
import { seedTicket } from "@/test/builders";

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
  upsertIssue: vi.fn().mockResolvedValue({ key: "VPL-100", action: "updated" }),
  cacheSprintName: vi.fn(),
}));

vi.mock("@/lib/upsert-setting", () => ({
  upsertSetting: vi.fn(),
}));

vi.mock("@/lib/search-index-cache", () => ({
  invalidateSearchCache: vi.fn(),
}));

vi.mock("@/lib/sync-abort", () => ({
  registerSync: vi.fn().mockReturnValue(new AbortController()),
  unregisterSync: vi.fn(),
}));

vi.mock("@/lib/cache", () => ({
  cache: { invalidate: vi.fn() },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  syncIndividualTickets,
  syncSprint,
  syncBacklog,
  SyncValidationError,
} from "./sync-tickets-service";
import { jiraClient, extractSprint, JiraApiError } from "@/lib/jira-client";
import { upsertIssue, cacheSprintName } from "@/lib/upsert-issue";
import { upsertSetting } from "@/lib/upsert-setting";

function makeIssue(key: string, updated?: string) {
  return {
    key,
    id: key,
    self: `https://jira/${key}`,
    fields: {
      summary: `Test ${key}`,
      issuetype: { name: "Story" },
      status: { name: "TO DO" },
      assignee: null,
      labels: [],
      created: new Date().toISOString(),
      updated: updated ?? new Date().toISOString(),
    },
  };
}

describe("syncIndividualTickets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testDb = createTestDb();
  });

  it("syncs valid keys and returns result", async () => {
    const issue = makeIssue("VPL-1");
    vi.mocked(jiraClient.getIssue).mockResolvedValue(issue);

    const result = await syncIndividualTickets(["VPL-1"]);

    expect(result.count).toBe(1);
    expect(result.strategy).toBe("individual");
    expect(upsertIssue).toHaveBeenCalledTimes(1);
  });

  it("marks ticket as removed on 404", async () => {
    seedTicket(testDb, { jiraKey: "VPL-404" });
    vi.mocked(jiraClient.getIssue).mockRejectedValue(
      new JiraApiError(404, "Not Found", "", ""),
    );

    const result = await syncIndividualTickets(["VPL-404"]);

    expect(result.count).toBe(1);
    const t = testDb.select().from(ticket).where(eq(ticket.jiraKey, "VPL-404")).get();
    expect(t!.removedFromJiraAt).toBeTruthy();
  });

  it("clears removedFromJiraAt if ticket found again", async () => {
    seedTicket(testDb, { jiraKey: "VPL-BACK", removedFromJiraAt: new Date().toISOString() });
    vi.mocked(jiraClient.getIssue).mockResolvedValue(makeIssue("VPL-BACK"));

    await syncIndividualTickets(["VPL-BACK"]);

    const t = testDb.select().from(ticket).where(eq(ticket.jiraKey, "VPL-BACK")).get();
    expect(t!.removedFromJiraAt).toBeNull();
  });

  it("creates activity log entry with duration", async () => {
    vi.mocked(jiraClient.getIssue).mockResolvedValue(makeIssue("VPL-1"));

    await syncIndividualTickets(["VPL-1"]);

    const logs = testDb.select().from(activityLog).all();
    expect(logs).toHaveLength(1);
    expect(logs[0].type).toBe("ticket-sync");
    expect(logs[0].status).toBe("success");
    expect(logs[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it("records error details on failure", async () => {
    vi.mocked(jiraClient.getIssue).mockRejectedValue(new Error("network error"));

    await expect(syncIndividualTickets(["VPL-1"])).rejects.toThrow(SyncValidationError);

    const logs = testDb.select().from(activityLog).all();
    expect(logs[0].status).toBe("failed");
    expect(logs[0].errorDetail).toContain("network error");
  });
});

describe("syncSprint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testDb = createTestDb();
  });

  it("throws SyncValidationError when sprintId is null", async () => {
    await expect(syncSprint(null, "full")).rejects.toThrow(SyncValidationError);
    await expect(syncSprint(null, "full")).rejects.toThrow("sprintId query parameter is required");
  });

  it("throws SyncValidationError when sprintId is not a number", async () => {
    await expect(syncSprint("abc", "full")).rejects.toThrow(SyncValidationError);
    await expect(syncSprint("abc", "full")).rejects.toThrow("sprintId must be a number");
  });

  it("syncs sprint issues with full strategy", async () => {
    const issues = [makeIssue("VPL-10"), makeIssue("VPL-11")];
    vi.mocked(jiraClient.getSprintIssues).mockResolvedValue(issues);

    const result = await syncSprint("100", "full");

    expect(result.count).toBe(2);
    expect(result.strategy).toBe("full");
    expect(upsertIssue).toHaveBeenCalledTimes(2);
  });

  it("uses timestamp-first strategy when available and live", async () => {
    vi.mocked(jiraClient.getSprintIssueTimestamps).mockResolvedValue([
      { key: "VPL-10", updated: "2026-01-01T00:00:00Z" },
    ] as never);
    vi.mocked(jiraClient.getIssuesByKeys).mockResolvedValue([makeIssue("VPL-10")] as never);
    Object.defineProperty(jiraClient, "isLive", { get: () => true, configurable: true });

    const result = await syncSprint("100", "timestamp-first");

    expect(result.strategy).toBe("timestamp-first");
    Object.defineProperty(jiraClient, "isLive", { get: () => false, configurable: true });
  });

  it("detects tickets removed from sprint and records scope changes", async () => {
    seedTicket(testDb, { jiraKey: "VPL-OLD", sprintName: "100" });
    vi.mocked(jiraClient.getSprintIssues).mockResolvedValue([]);
    vi.mocked(jiraClient.getIssue).mockResolvedValue(makeIssue("VPL-OLD"));

    await syncSprint("100", "full");

    const changes = testDb.select().from(ticketScopeChange).all();
    expect(changes).toHaveLength(1);
    expect(changes[0].ticketKey).toBe("VPL-OLD");
    expect(changes[0].action).toBe("removed");
  });

  it("marks removed tickets as deleted from Jira on 404", async () => {
    seedTicket(testDb, { jiraKey: "VPL-GONE", sprintName: "100" });
    vi.mocked(jiraClient.getSprintIssues).mockResolvedValue([]);
    vi.mocked(jiraClient.getIssue).mockRejectedValue(
      new JiraApiError(404, "Not Found", "", ""),
    );

    await syncSprint("100", "full");

    const t = testDb.select().from(ticket).where(eq(ticket.jiraKey, "VPL-GONE")).get();
    expect(t!.removedFromJiraAt).toBeTruthy();
  });

  it("updates activity log with summary", async () => {
    vi.mocked(jiraClient.getSprintIssues).mockResolvedValue([makeIssue("VPL-1")]);

    await syncSprint("100", "full");

    const logs = testDb.select().from(activityLog).all();
    expect(logs[0].status).toBe("success");
    expect(logs[0].summary).toContain("1 tickets synced");
  });

  it("updates watermark to latest issue timestamp", async () => {
    const ts = "2026-05-01T12:00:00Z";
    vi.mocked(jiraClient.getSprintIssues).mockResolvedValue([makeIssue("VPL-1", ts)]);

    await syncSprint("100", "full");

    expect(upsertSetting).toHaveBeenCalledWith("jira_sync_watermark", ts);
  });

  it("caches sprint name when sprint is found in issue", async () => {
    const issues = [makeIssue("VPL-1")];
    vi.mocked(jiraClient.getSprintIssues).mockResolvedValue(issues);

    // For removed ticket path
    seedTicket(testDb, { jiraKey: "VPL-REM", sprintName: "100" });
    vi.mocked(jiraClient.getIssue).mockResolvedValue(makeIssue("VPL-REM"));
    vi.mocked(extractSprint).mockReturnValue({ id: 200, name: "Sprint 200", state: "active" } as never);

    await syncSprint("100", "full");

    expect(cacheSprintName).toHaveBeenCalled();
  });
});

describe("syncBacklog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testDb = createTestDb();
  });

  it("syncs backlog issues", async () => {
    vi.mocked(jiraClient.getBacklogIssues).mockResolvedValue([makeIssue("VPL-BL")]);

    const result = await syncBacklog("full");

    expect(result.count).toBe(1);
    expect(result.strategy).toBe("full");
  });

  it("handles AbortSignal cancellation", async () => {
    const abortController = new AbortController();
    abortController.abort();

    vi.mocked(jiraClient.getBacklogIssues).mockRejectedValue(
      new DOMException("Aborted", "AbortError"),
    );

    await expect(syncBacklog("full", abortController.signal)).rejects.toThrow(SyncValidationError);
    await expect(syncBacklog("full", abortController.signal)).rejects.toThrow(/cancelled/i);
  });

  it("wraps unhandled errors in SyncValidationError", async () => {
    vi.mocked(jiraClient.getBacklogIssues).mockRejectedValue(new Error("unexpected"));

    await expect(syncBacklog("full")).rejects.toThrow(SyncValidationError);
  });

  it("records error in activity log on failure", async () => {
    vi.mocked(jiraClient.getBacklogIssues).mockRejectedValue(new Error("oops"));

    await expect(syncBacklog("full")).rejects.toThrow();

    const logs = testDb.select().from(activityLog).all();
    expect(logs[0].status).toBe("failed");
    expect(logs[0].errorDetail).toContain("oops");
  });
});
