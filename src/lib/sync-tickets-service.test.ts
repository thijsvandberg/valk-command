// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, activityLog, ticketScopeChange, appSetting } from "@/db/schema";
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
  planGroupKeys,
  reconcileGroupMembership,
  SyncValidationError,
} from "./sync-tickets-service";
import { jiraClient, extractSprint, extractEpicLink, JiraApiError } from "@/lib/jira-client";
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

  it("backfills metadata for a sprint not yet in the cache", async () => {
    vi.mocked(jiraClient.getIssue).mockResolvedValue(makeIssue("VPL-1"));
    vi.mocked(extractSprint).mockReturnValue({ id: 42, name: "Sprint 42" } as ReturnType<typeof extractSprint>);
    vi.mocked(jiraClient.getSprint).mockResolvedValue({ id: 42, name: "Sprint 42", state: "future" });

    await syncIndividualTickets(["VPL-1"]);

    expect(jiraClient.getSprint).toHaveBeenCalledWith(42, expect.anything());
    const row = testDb.select().from(appSetting).where(eq(appSetting.key, "jira_sprints")).get();
    expect(row).toBeTruthy();
    expect(JSON.parse(row!.value).map((s: { id: number }) => s.id)).toContain(42);
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
    vi.mocked(jiraClient.getIssuesByKeys).mockResolvedValue([makeIssue("VPL-OLD")]);

    await syncSprint("100", "full");

    const changes = testDb.select().from(ticketScopeChange).all();
    expect(changes).toHaveLength(1);
    expect(changes[0].ticketKey).toBe("VPL-OLD");
    expect(changes[0].action).toBe("removed");
  });

  it("uses a single bulk fetch for departed tickets and assigns their new sprint", async () => {
    seedTicket(testDb, { jiraKey: "VPL-A", sprintName: "100" });
    seedTicket(testDb, { jiraKey: "VPL-B", sprintName: "100" });
    vi.mocked(jiraClient.getSprintIssues).mockResolvedValue([]);
    vi.mocked(jiraClient.getIssuesByKeys).mockResolvedValue([makeIssue("VPL-A"), makeIssue("VPL-B")]);
    vi.mocked(extractSprint).mockImplementation(((fields: { summary: string }) =>
      fields.summary.includes("VPL-A")
        ? { id: 200, name: "Sprint 200", state: "active" }
        : { id: 300, name: "Sprint 300", state: "active" }) as typeof extractSprint);

    await syncSprint("100", "full");

    expect(jiraClient.getIssuesByKeys).toHaveBeenCalledTimes(1);
    expect(jiraClient.getIssue).not.toHaveBeenCalled();
    const a = testDb.select().from(ticket).where(eq(ticket.jiraKey, "VPL-A")).get();
    const b = testDb.select().from(ticket).where(eq(ticket.jiraKey, "VPL-B")).get();
    expect(a!.sprintName).toBe("200");
    expect(b!.sprintName).toBe("300");
  });

  it("marks removed tickets as deleted from Jira when absent from the bulk result", async () => {
    seedTicket(testDb, { jiraKey: "VPL-GONE", sprintName: "100" });
    vi.mocked(jiraClient.getSprintIssues).mockResolvedValue([]);
    // Key not returned by the bulk fetch = no longer exists in Jira.
    vi.mocked(jiraClient.getIssuesByKeys).mockResolvedValue([]);

    await syncSprint("100", "full");

    const t = testDb.select().from(ticket).where(eq(ticket.jiraKey, "VPL-GONE")).get();
    expect(t!.removedFromJiraAt).toBeTruthy();
    expect(t!.sprintName).toBe("100");
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
    vi.mocked(jiraClient.getIssuesByKeys).mockResolvedValue([makeIssue("VPL-REM")]);
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

describe("planGroupKeys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testDb = createTestDb();
  });

  it("returns rank-ordered keys for a sprint", async () => {
    vi.mocked(jiraClient.getSprintIssueTimestamps).mockResolvedValue([
      { key: "VPL-1", updated: "a" },
      { key: "VPL-2", updated: "b" },
    ]);

    const keys = await planGroupKeys({ kind: "sprint", id: "42" });

    expect(keys).toEqual(["VPL-1", "VPL-2"]);
    expect(jiraClient.getSprintIssueTimestamps).toHaveBeenCalledWith(42, undefined);
  });

  it("returns keys for an epic via its Jira key", async () => {
    vi.mocked(jiraClient.getEpicIssueTimestamps).mockResolvedValue([
      { key: "VPL-9", updated: "a" },
    ]);

    const keys = await planGroupKeys({ kind: "epic", id: "VPL-100" });

    expect(keys).toEqual(["VPL-9"]);
    expect(jiraClient.getEpicIssueTimestamps).toHaveBeenCalledWith("VPL-100", undefined);
  });

  it("rejects a non-numeric sprint id", async () => {
    await expect(planGroupKeys({ kind: "sprint", id: "abc" })).rejects.toThrow(SyncValidationError);
  });

  it("rejects a missing id", async () => {
    await expect(planGroupKeys({ kind: "epic", id: "" })).rejects.toThrow(SyncValidationError);
  });
});

describe("reconcileGroupMembership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testDb = createTestDb();
  });

  it("restores rank order from the plan", async () => {
    seedTicket(testDb, { jiraKey: "VPL-1", sprintName: "42", jiraRank: 99 });
    seedTicket(testDb, { jiraKey: "VPL-2", sprintName: "42", jiraRank: 99 });

    await reconcileGroupMembership({ kind: "sprint", id: "42" }, ["VPL-2", "VPL-1"]);

    const t1 = testDb.select().from(ticket).where(eq(ticket.jiraKey, "VPL-1")).get();
    const t2 = testDb.select().from(ticket).where(eq(ticket.jiraKey, "VPL-2")).get();
    expect(t2!.jiraRank).toBe(0);
    expect(t1!.jiraRank).toBe(1);
  });

  it("moves a ticket that left the sprint to its new sprint", async () => {
    seedTicket(testDb, { jiraKey: "VPL-STAY", sprintName: "42" });
    seedTicket(testDb, { jiraKey: "VPL-LEFT", sprintName: "42" });
    vi.mocked(extractSprint).mockReturnValue({ id: 77, name: "Sprint 8" } as ReturnType<typeof extractSprint>);
    vi.mocked(jiraClient.getIssuesByKeys).mockResolvedValue([makeIssue("VPL-LEFT")]);

    const result = await reconcileGroupMembership({ kind: "sprint", id: "42" }, ["VPL-STAY"]);

    expect(result.removed).toBe(1);
    expect(jiraClient.getIssuesByKeys).toHaveBeenCalledTimes(1);
    expect(jiraClient.getIssue).not.toHaveBeenCalled();
    const left = testDb.select().from(ticket).where(eq(ticket.jiraKey, "VPL-LEFT")).get();
    expect(left!.sprintName).toBe("77");
  });

  it("updates epic fields for a ticket that left an epic", async () => {
    seedTicket(testDb, { jiraKey: "VPL-IN", epicKey: "VPL-100" });
    seedTicket(testDb, { jiraKey: "VPL-OUT", epicKey: "VPL-100" });
    vi.mocked(jiraClient.getIssuesByKeys).mockResolvedValue([makeIssue("VPL-OUT")]);
    vi.mocked(extractEpicLink).mockReturnValue({ name: "Other epic", key: "VPL-200" });

    const result = await reconcileGroupMembership({ kind: "epic", id: "VPL-100" }, ["VPL-IN"]);

    expect(result.removed).toBe(1);
    const out = testDb.select().from(ticket).where(eq(ticket.jiraKey, "VPL-OUT")).get();
    expect(out!.epicKey).toBe("VPL-200");
    expect(out!.epic).toBe("Other epic");
  });

  it("marks a removed-from-Jira ticket when absent from the bulk result", async () => {
    seedTicket(testDb, { jiraKey: "VPL-GONE", sprintName: "42" });
    vi.mocked(jiraClient.getIssuesByKeys).mockResolvedValue([]);

    await reconcileGroupMembership({ kind: "sprint", id: "42" }, []);

    const gone = testDb.select().from(ticket).where(eq(ticket.jiraKey, "VPL-GONE")).get();
    expect(gone!.removedFromJiraAt).toBeTruthy();
  });

  it("logs an activity entry scoped to the epic for epic reconcile", async () => {
    seedTicket(testDb, { jiraKey: "VPL-IN", epicKey: "VPL-100" });

    await reconcileGroupMembership({ kind: "epic", id: "VPL-100" }, ["VPL-IN"]);

    const logs = testDb.select().from(activityLog).all();
    expect(logs[0].type).toBe("ticket-sync");
    expect(logs[0].scope).toBe("VPL-100");
    expect(logs[0].status).toBe("success");
  });
});
