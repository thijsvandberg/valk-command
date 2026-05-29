// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, ticketLink } from "@/db/schema";
import { seedTicket } from "@/test/builders";
import { eq } from "drizzle-orm";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/cache", () => ({ cache: { get: vi.fn(), set: vi.fn(), invalidate: vi.fn() } }));

vi.mock("@/lib/upsert-issue", () => ({
  normalizeIssueType: (name: string) => name.toLowerCase(),
  normalizeStatus: (name: string) => name.toUpperCase(),
}));

vi.mock("@/lib/jira-client", () => ({
  jiraClient: {
    getIssueLinksByKeys: vi.fn().mockResolvedValue([]),
  },
}));

import { POST } from "./route";
import { jiraClient } from "@/lib/jira-client";
import { cache } from "@/lib/cache";

function makeRequest(): Request {
  return new Request("http://localhost:3100/api/jira/sync-links", { method: "POST" });
}

describe("POST /api/jira/sync-links", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
    vi.mocked(jiraClient.getIssueLinksByKeys).mockResolvedValue([]);
  });

  it("returns synced: 0 when no tickets in DB", async () => {
    const res = await POST(makeRequest());
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.synced).toBe(0);
    expect(data.total).toBe(0);
  });

  it("syncs links for tickets and returns correct counts", async () => {
    seedTicket(testDb, { jiraKey: "VPL-1" });
    seedTicket(testDb, { jiraKey: "VPL-2" });

    vi.mocked(jiraClient.getIssueLinksByKeys).mockResolvedValue([
      {
        key: "VPL-1",
        fields: {
          issuelinks: [
            {
              id: "link-1",
              type: { name: "Blocks", inward: "is blocked by", outward: "blocks" },
              outwardIssue: {
                id: "10002",
                key: "VPL-2",
                fields: {
                  summary: "Related ticket",
                  issuetype: { name: "Story" },
                  status: { name: "In Progress" },
                  assignee: null,
                },
              },
            },
          ],
        },
      },
      {
        key: "VPL-2",
        fields: { issuelinks: [] },
      },
    ] as never);

    const res = await POST(makeRequest());
    const data = await res.json();
    expect(data.synced).toBe(2);
    expect(data.total).toBe(2);

    const links = testDb.select().from(ticketLink).all();
    expect(links).toHaveLength(1);
    expect(links[0].ticketKey).toBe("VPL-1");
    expect(links[0].linkedKey).toBe("VPL-2");
    expect(links[0].relation).toBe("blocks");
  });

  it("preserves locally-created links during sync", async () => {
    seedTicket(testDb, { jiraKey: "VPL-1" });
    seedTicket(testDb, { jiraKey: "VPL-3" });

    // Insert a local-only link (no jiraLinkId)
    testDb.insert(ticketLink).values({
      id: "local-link-1",
      ticketKey: "VPL-1",
      linkedKey: "VPL-3",
      relation: "relates to",
      title: "Local link",
      status: "TO DO",
      jiraLinkId: null,
    }).run();

    // Insert a Jira-sourced link that should be replaced
    testDb.insert(ticketLink).values({
      id: "jira-link-old",
      ticketKey: "VPL-1",
      linkedKey: "VPL-99",
      relation: "old relation",
      title: "Old Jira link",
      status: "DONE",
      jiraLinkId: "old-jira-id",
    }).run();

    vi.mocked(jiraClient.getIssueLinksByKeys).mockResolvedValue([
      {
        key: "VPL-1",
        fields: { issuelinks: [] },
      },
    ] as never);

    await POST(makeRequest());

    const links = testDb.select().from(ticketLink).where(eq(ticketLink.ticketKey, "VPL-1")).all();
    expect(links).toHaveLength(1);
    expect(links[0].id).toBe("local-link-1");
    expect(links[0].jiraLinkId).toBeNull();
  });

  it("handles batch errors gracefully", async () => {
    seedTicket(testDb, { jiraKey: "VPL-1" });

    vi.mocked(jiraClient.getIssueLinksByKeys).mockRejectedValue(new Error("Batch failed"));

    const res = await POST(makeRequest());
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.batchErrors).toBe(1);
    expect(data.synced).toBe(0);
  });

  it("invalidates ticket cache", async () => {
    await POST(makeRequest());
    expect(vi.mocked(cache.invalidate)).toHaveBeenCalledWith("/api/tickets");
  });

  it("handles inward issue links correctly", async () => {
    seedTicket(testDb, { jiraKey: "VPL-1" });

    vi.mocked(jiraClient.getIssueLinksByKeys).mockResolvedValue([
      {
        key: "VPL-1",
        fields: {
          issuelinks: [
            {
              id: "link-2",
              type: { name: "Causes", inward: "is caused by", outward: "causes" },
              inwardIssue: {
                id: "10005",
                key: "VPL-5",
                fields: {
                  summary: "Root cause",
                  issuetype: { name: "Bug" },
                  status: { name: "Done" },
                  assignee: { accountId: "a1", displayName: "Alice", avatarUrls: { "48x48": "https://img/a.png" } },
                },
              },
            },
          ],
        },
      },
    ] as never);

    await POST(makeRequest());

    const links = testDb.select().from(ticketLink).all();
    expect(links).toHaveLength(1);
    expect(links[0].relation).toBe("is caused by");
    expect(links[0].linkedKey).toBe("VPL-5");
    expect(links[0].assignee).toBe("Alice");
  });
});
