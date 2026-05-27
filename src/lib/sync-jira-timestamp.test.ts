// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket } from "@/db/schema";
import { eq } from "drizzle-orm";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() { return testDb; },
}));

vi.mock("@/lib/jira-client", () => ({
  jiraClient: {
    getIssue: vi.fn().mockResolvedValue({
      fields: { updated: "2024-06-15T12:00:00.000Z" },
    }),
  },
}));

vi.mock("@/lib/cache", () => ({
  cache: { invalidate: vi.fn() },
}));

import { syncJiraTimestamp } from "./sync-jira-timestamp";

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
