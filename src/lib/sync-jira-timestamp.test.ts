// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createJiraClientMock } from "@/test/mocks";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket } from "@/db/schema";
import { eq } from "drizzle-orm";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() { return testDb; },
}));

vi.mock("@/lib/jira-client", () => createJiraClientMock({
  jiraClient: {
    getIssue: vi.fn().mockResolvedValue({
      fields: { updated: "2024-06-15T12:00:00.000Z" },
    }),
    getIssuesByKeys: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/lib/cache", () => ({
  cache: { invalidate: vi.fn() },
}));

import { syncJiraTimestamp, syncJiraTimestamps } from "./sync-jira-timestamp";

function seedTicket(key: string, jiraUpdatedAt?: string) {
  testDb.insert(ticket).values({
    jiraKey: key,
    title: `Ticket ${key}`,
    status: "TO DO",
    jiraUpdatedAt: jiraUpdatedAt ?? "2024-01-01T00:00:00.000Z",
  }).run();
}

describe("syncJiraTimestamp", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
  });

  it("updates jiraUpdatedAt from Jira remote", async () => {
    seedTicket("VPL-100", "2024-01-01T00:00:00.000Z");

    const { jiraClient } = await import("@/lib/jira-client");
    vi.mocked(jiraClient.getIssue).mockResolvedValue({
      fields: { updated: "2024-06-15T12:00:00.000Z" },
    } as ReturnType<typeof jiraClient.getIssue> extends Promise<infer T> ? T : never);

    await syncJiraTimestamp("VPL-100");

    const row = testDb.select().from(ticket).where(eq(ticket.jiraKey, "VPL-100")).get();
    expect(row?.jiraUpdatedAt).toBe("2024-06-15T12:00:00.000Z");
  });

  it("does not throw when getIssue fails", async () => {
    seedTicket("VPL-100");

    const { jiraClient } = await import("@/lib/jira-client");
    vi.mocked(jiraClient.getIssue).mockRejectedValue(new Error("Network error"));

    await expect(syncJiraTimestamp("VPL-100")).resolves.toBeUndefined();
  });

  it("invalidates cache after sync", async () => {
    seedTicket("VPL-100");

    const { jiraClient } = await import("@/lib/jira-client");
    vi.mocked(jiraClient.getIssue).mockResolvedValue({
      fields: { updated: "2024-06-15T12:00:00.000Z" },
    } as ReturnType<typeof jiraClient.getIssue> extends Promise<infer T> ? T : never);

    const { cache } = await import("@/lib/cache");
    await syncJiraTimestamp("VPL-100");

    expect(cache.invalidate).toHaveBeenCalledWith("/api/tickets/VPL-100");
  });
});

describe("syncJiraTimestamps (bulk, BRDG-408)", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
  });

  it("refreshes many keys with a single bulk fetch, not one getIssue per key", async () => {
    seedTicket("VPL-1", "2024-01-01T00:00:00.000Z");
    seedTicket("VPL-2", "2024-01-01T00:00:00.000Z");
    seedTicket("VPL-3", "2024-01-01T00:00:00.000Z");

    const { jiraClient } = await import("@/lib/jira-client");
    vi.mocked(jiraClient.getIssuesByKeys).mockResolvedValue([
      { key: "VPL-1", fields: { updated: "2024-06-15T12:00:00.000Z" } },
      { key: "VPL-2", fields: { updated: "2024-06-16T12:00:00.000Z" } },
      { key: "VPL-3", fields: { updated: "2024-06-17T12:00:00.000Z" } },
    ] as never);

    await syncJiraTimestamps(["VPL-1", "VPL-2", "VPL-3"]);

    expect(jiraClient.getIssuesByKeys).toHaveBeenCalledTimes(1);
    expect(jiraClient.getIssue).not.toHaveBeenCalled();

    const rows = Object.fromEntries(
      testDb.select().from(ticket).all().map((r) => [r.jiraKey, r.jiraUpdatedAt]),
    );
    expect(rows["VPL-1"]).toBe("2024-06-15T12:00:00.000Z");
    expect(rows["VPL-2"]).toBe("2024-06-16T12:00:00.000Z");
    expect(rows["VPL-3"]).toBe("2024-06-17T12:00:00.000Z");
  });

  it("is a no-op for an empty key list (no fetch)", async () => {
    const { jiraClient } = await import("@/lib/jira-client");
    await syncJiraTimestamps([]);
    expect(jiraClient.getIssuesByKeys).not.toHaveBeenCalled();
  });

  it("does not throw when the bulk fetch fails", async () => {
    seedTicket("VPL-1");
    const { jiraClient } = await import("@/lib/jira-client");
    vi.mocked(jiraClient.getIssuesByKeys).mockRejectedValue(new Error("Network error"));

    await expect(syncJiraTimestamps(["VPL-1"])).resolves.toBeUndefined();
  });
});
