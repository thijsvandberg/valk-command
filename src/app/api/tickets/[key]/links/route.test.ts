// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, ticketLink } from "@/db/schema";
import { eq } from "drizzle-orm";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() { return testDb; },
}));

vi.mock("@/lib/jira-client", () => ({
  jiraClient: {
    createIssueLink: vi.fn().mockResolvedValue(undefined),
    deleteIssueLink: vi.fn().mockResolvedValue(undefined),
    getIssue: vi.fn().mockResolvedValue({
      fields: { updated: "2024-06-15T12:00:00.000Z" },
    }),
    getIssueLinkTypes: vi.fn().mockResolvedValue([
      { id: "1", name: "Relates", inward: "relates to", outward: "relates to" },
      { id: "2", name: "Blocks", inward: "is blocked by", outward: "blocks" },
      { id: "3", name: "Cloners", inward: "is cloned by", outward: "clones" },
      { id: "4", name: "Duplicate", inward: "is duplicated by", outward: "duplicates" },
      { id: "5", name: "Implementation", inward: "is implemented by", outward: "implements" },
      { id: "6", name: "Cause", inward: "is caused by", outward: "causes" },
    ]),
  },
}));

vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/cache", () => ({
  cache: { invalidate: vi.fn(), get: vi.fn().mockReturnValue(undefined), set: vi.fn() },
}));

import { POST, DELETE } from "./route";

function makeParams(key: string) {
  return { params: Promise.resolve({ key }) };
}

function postRequest(key: string, body: unknown): Request {
  return new Request(`http://localhost:3100/api/tickets/${key}/links`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteRequest(key: string, body: unknown): Request {
  return new Request(`http://localhost:3100/api/tickets/${key}/links`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function seedTicket(key: string, title?: string) {
  testDb.insert(ticket).values({
    jiraKey: key,
    title: title ?? `Ticket ${key}`,
    status: "TO DO",
  }).run();
}

describe("POST /api/tickets/[key]/links", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
  });

  it("creates a link with default relation", async () => {
    seedTicket("VPL-100");
    seedTicket("VPL-200", "Target ticket");

    const res = await POST(
      postRequest("VPL-100", { targetKey: "VPL-200", relation: "relates to" }),
      makeParams("VPL-100"),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.key).toBe("VPL-200");
    expect(data.relation).toBe("relates to");
    expect(data.title).toBe("Target ticket");
  });

  it("inserts link into local database", async () => {
    seedTicket("VPL-100");
    seedTicket("VPL-200");

    await POST(
      postRequest("VPL-100", { targetKey: "VPL-200", relation: "blocks" }),
      makeParams("VPL-100"),
    );

    const rows = testDb.select().from(ticketLink).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].ticketKey).toBe("VPL-100");
    expect(rows[0].linkedKey).toBe("VPL-200");
    expect(rows[0].relation).toBe("blocks");
  });

  it("calls Jira createIssueLink", async () => {
    seedTicket("VPL-100");
    const { jiraClient } = await import("@/lib/jira-client");

    await POST(
      postRequest("VPL-100", { targetKey: "VPL-200", relation: "blocks" }),
      makeParams("VPL-100"),
    );

    expect(jiraClient.createIssueLink).toHaveBeenCalledWith("VPL-100", "VPL-200", "Blocks");
  });

  it("handles inward relations correctly", async () => {
    seedTicket("VPL-100");
    const { jiraClient } = await import("@/lib/jira-client");

    await POST(
      postRequest("VPL-100", { targetKey: "VPL-200", relation: "is blocked by" }),
      makeParams("VPL-100"),
    );

    // For "is blocked by", the source/dest should be swapped
    expect(jiraClient.createIssueLink).toHaveBeenCalledWith("VPL-200", "VPL-100", "Blocks");
  });

  it("returns 404 for non-existent source ticket", async () => {
    const res = await POST(
      postRequest("VPL-999", { targetKey: "VPL-200" }),
      makeParams("VPL-999"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 for missing targetKey", async () => {
    seedTicket("VPL-100");
    const res = await POST(
      postRequest("VPL-100", {}),
      makeParams("VPL-100"),
    );
    expect(res.status).toBe(400);
  });

  it("maps dynamically fetched link types correctly", async () => {
    seedTicket("VPL-100");
    const { jiraClient } = await import("@/lib/jira-client");

    await POST(
      postRequest("VPL-100", { targetKey: "VPL-200", relation: "implements" }),
      makeParams("VPL-100"),
    );

    expect(jiraClient.createIssueLink).toHaveBeenCalledWith("VPL-100", "VPL-200", "Implementation");
  });

  it("maps inward direction for dynamic link types", async () => {
    seedTicket("VPL-100");
    const { jiraClient } = await import("@/lib/jira-client");

    await POST(
      postRequest("VPL-100", { targetKey: "VPL-200", relation: "is caused by" }),
      makeParams("VPL-100"),
    );

    // "is caused by" is inward, so source/dest should be swapped
    expect(jiraClient.createIssueLink).toHaveBeenCalledWith("VPL-200", "VPL-100", "Cause");
  });

  it("falls back to default when Jira link types fail", async () => {
    seedTicket("VPL-100");
    const { jiraClient } = await import("@/lib/jira-client");
    vi.mocked(jiraClient.getIssueLinkTypes).mockRejectedValueOnce(new Error("Jira down"));

    await POST(
      postRequest("VPL-100", { targetKey: "VPL-200", relation: "blocks" }),
      makeParams("VPL-100"),
    );

    expect(jiraClient.createIssueLink).toHaveBeenCalledWith("VPL-100", "VPL-200", "Blocks");
  });
});

describe("DELETE /api/tickets/[key]/links", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
  });

  it("deletes a link from local DB", async () => {
    seedTicket("VPL-100");
    testDb.insert(ticketLink).values({
      id: "link-1",
      ticketKey: "VPL-100",
      jiraLinkId: "jira-link-1",
      relation: "blocks",
      linkedKey: "VPL-200",
      title: "Target",
      type: "task",
      status: "TO DO",
    }).run();

    const res = await DELETE(
      deleteRequest("VPL-100", { jiraLinkId: "jira-link-1", linkedKey: "VPL-200" }),
      makeParams("VPL-100"),
    );
    expect(res.status).toBe(204);

    const rows = testDb.select().from(ticketLink).all();
    expect(rows).toHaveLength(0);
  });

  it("calls Jira deleteIssueLink when jiraLinkId is provided", async () => {
    seedTicket("VPL-100");
    testDb.insert(ticketLink).values({
      id: "link-1",
      ticketKey: "VPL-100",
      jiraLinkId: "jira-link-1",
      relation: "blocks",
      linkedKey: "VPL-200",
      title: "Target",
      type: "task",
      status: "TO DO",
    }).run();

    const { jiraClient } = await import("@/lib/jira-client");

    await DELETE(
      deleteRequest("VPL-100", { jiraLinkId: "jira-link-1", linkedKey: "VPL-200" }),
      makeParams("VPL-100"),
    );

    expect(jiraClient.deleteIssueLink).toHaveBeenCalledWith("jira-link-1");
  });

  it("skips Jira call when no jiraLinkId", async () => {
    seedTicket("VPL-100");
    testDb.insert(ticketLink).values({
      id: "link-1",
      ticketKey: "VPL-100",
      jiraLinkId: null,
      relation: "relates to",
      linkedKey: "VPL-200",
      title: "Target",
      type: "task",
      status: "TO DO",
    }).run();

    const { jiraClient } = await import("@/lib/jira-client");

    await DELETE(
      deleteRequest("VPL-100", { linkedKey: "VPL-200" }),
      makeParams("VPL-100"),
    );

    expect(jiraClient.deleteIssueLink).not.toHaveBeenCalled();
  });

  it("returns 400 for missing linkedKey", async () => {
    const res = await DELETE(
      deleteRequest("VPL-100", {}),
      makeParams("VPL-100"),
    );
    expect(res.status).toBe(400);
  });
});

describe("jiraUpdatedAt sync after link operations", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
  });

  it("syncs jiraUpdatedAt after creating a link", async () => {
    seedTicket("VPL-300");

    const { jiraClient } = await import("@/lib/jira-client");
    vi.mocked(jiraClient.getIssue).mockResolvedValue({
      fields: { updated: "2024-09-01T10:00:00.000Z" },
    } as ReturnType<typeof jiraClient.getIssue> extends Promise<infer T> ? T : never);

    await POST(
      postRequest("VPL-300", { targetKey: "VPL-400", relation: "relates to" }),
      makeParams("VPL-300"),
    );

    const row = testDb.select().from(ticket).where(eq(ticket.jiraKey, "VPL-300")).get();
    expect(row?.jiraUpdatedAt).toBe("2024-09-01T10:00:00.000Z");
  });

  it("syncs jiraUpdatedAt after deleting a link", async () => {
    seedTicket("VPL-300");
    testDb.insert(ticketLink).values({
      id: "link-sync",
      ticketKey: "VPL-300",
      jiraLinkId: "jira-link-sync",
      relation: "blocks",
      linkedKey: "VPL-400",
      title: "Target",
      type: "task",
      status: "TO DO",
    }).run();

    const { jiraClient } = await import("@/lib/jira-client");
    vi.mocked(jiraClient.getIssue).mockResolvedValue({
      fields: { updated: "2024-09-02T11:00:00.000Z" },
    } as ReturnType<typeof jiraClient.getIssue> extends Promise<infer T> ? T : never);

    await DELETE(
      deleteRequest("VPL-300", { jiraLinkId: "jira-link-sync", linkedKey: "VPL-400" }),
      makeParams("VPL-300"),
    );

    const row = testDb.select().from(ticket).where(eq(ticket.jiraKey, "VPL-300")).get();
    expect(row?.jiraUpdatedAt).toBe("2024-09-02T11:00:00.000Z");
  });
});
