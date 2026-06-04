// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, ticketMetadata } from "@/db/schema";
import { cache } from "@/lib/cache";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/jira-client", () => ({
  jiraClient: {
    createIssue: vi.fn().mockResolvedValue({ key: "VPL-999", id: "99999" }),
    moveToSprint: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

import { GET, POST } from "./route";

function seedTicket(
  db: BetterSQLite3Database<typeof schema>,
  key: string,
  sprintName: string | null = null,
) {
  db.insert(ticket)
    .values({
      jiraKey: key,
      title: `Ticket ${key}`,
      status: "TO DO",
      sprintName,
    })
    .run();
}

describe("GET /api/tickets", () => {
  beforeEach(() => {
    testDb = createTestDb();
    cache.flush();
  });

  it("returns empty array when no tickets exist", async () => {
    const request = new Request("http://localhost:3100/api/tickets");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual([]);
  });

  it("returns all tickets when no sprintId filter", async () => {
    seedTicket(testDb, "VPL-100", "Sprint 1");
    seedTicket(testDb, "VPL-101", "Sprint 2");

    const request = new Request("http://localhost:3100/api/tickets");
    const response = await GET(request);
    const data = await response.json();

    expect(data).toHaveLength(2);
  });

  it("filters tickets by sprintId", async () => {
    seedTicket(testDb, "VPL-100", "Sprint 1");
    seedTicket(testDb, "VPL-101", "Sprint 2");
    seedTicket(testDb, "VPL-102", "Sprint 1");

    const request = new Request("http://localhost:3100/api/tickets?sprintId=Sprint%201");
    const response = await GET(request);
    const data = await response.json();

    expect(data).toHaveLength(2);
    // New shape: sprintId field (mapped from sprintName)
    expect(data.every((t: { sprintId: string }) => t.sprintId === "Sprint 1")).toBe(true);
  });

  it("includes PO status from metadata when available", async () => {
    seedTicket(testDb, "VPL-100");

    const { ticketMetadata } = await import("@/db/schema");
    testDb
      .insert(ticketMetadata)
      .values({
        jiraKey: "VPL-100",
        poStatus: "Ready",
        qualityScore: 85,
      })
      .run();

    const request = new Request("http://localhost:3100/api/tickets");
    const response = await GET(request);
    const data = await response.json();

    // New shape: poStatus and qualityScore are flattened into the ticket object
    expect(data[0].poStatus).toBe("Ready");
    expect(data[0].qualityScore).toBe(85);
  });

  it("resolves sprintDisplayName from the sprint name cache", async () => {
    seedTicket(testDb, "VPL-100", "4238");
    seedTicket(testDb, "VPL-101", "9999"); // no cache entry

    const { sprintNameCache } = await import("@/db/schema");
    testDb.insert(sprintNameCache).values({ sprintId: "4238", displayName: "BT: 142" }).run();

    const request = new Request("http://localhost:3100/api/tickets");
    const response = await GET(request);
    const data = await response.json();

    const byKey = Object.fromEntries(data.map((t: { key: string; sprintDisplayName: string | null }) => [t.key, t.sprintDisplayName]));
    expect(byKey["VPL-100"]).toBe("BT: 142");
    expect(byKey["VPL-101"]).toBeNull();
  });

  it("returns null poStatus when no metadata exists", async () => {
    seedTicket(testDb, "VPL-100");

    const request = new Request("http://localhost:3100/api/tickets");
    const response = await GET(request);
    const data = await response.json();

    expect(data[0].poStatus).toBeNull();
  });
});

function postRequest(body: unknown): Request {
  return new Request("http://localhost:3100/api/tickets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/tickets", () => {
  beforeEach(() => {
    testDb = createTestDb();
    cache.flush();
    vi.clearAllMocks();
  });

  it("creates a story and returns it", async () => {
    const res = await POST(postRequest({ title: "New story", sprintId: "42" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.key).toBe("VPL-999");
    expect(data.title).toBe("New story");
    expect(data.type).toBe("story");
    expect(data.jiraStatus).toBe("TO DO");
    expect(data.sprintId).toBe("42");
  });

  it("inserts the new ticket into the ticket table", async () => {
    await POST(postRequest({ title: "Board story", issueType: "Task" }));
    const row = testDb.select().from(ticket).all().find((r) => r.jiraKey === "VPL-999");
    expect(row).toBeDefined();
    expect(row!.type).toBe("task");
    expect(row!.status).toBe("TO DO");
  });

  it("creates without an epic parent by default", async () => {
    const { jiraClient } = await import("@/lib/jira-client");
    await POST(postRequest({ title: "Standalone" }));
    expect((jiraClient.createIssue as ReturnType<typeof vi.fn>).mock.calls[0][0]).not.toHaveProperty("parentKey");
    const row = testDb.select().from(ticket).all().find((r) => r.jiraKey === "VPL-999");
    expect(row!.epicKey).toBeNull();
  });

  it("links to an epic and stores its title when epicKey is given", async () => {
    testDb.insert(ticket).values({ jiraKey: "VPL-1", title: "Group Reservations", type: "epic", status: "TO DO" }).run();
    const { jiraClient } = await import("@/lib/jira-client");

    await POST(postRequest({ title: "Under epic", epicKey: "VPL-1" }));

    expect(jiraClient.createIssue).toHaveBeenCalledWith(expect.objectContaining({ parentKey: "VPL-1" }));
    const row = testDb.select().from(ticket).all().find((r) => r.jiraKey === "VPL-999");
    expect(row!.epicKey).toBe("VPL-1");
    expect(row!.epic).toBe("Group Reservations");
  });

  it("uses the configured project key", async () => {
    const { jiraClient } = await import("@/lib/jira-client");
    await POST(postRequest({ title: "Project check" }));
    expect(jiraClient.createIssue).toHaveBeenCalledWith(expect.objectContaining({ projectKey: "VPL" }));
  });

  it("starts new tickets at readiness drafting", async () => {
    await POST(postRequest({ title: "Fresh" }));
    const meta = testDb.select().from(ticketMetadata).all().find((r) => r.jiraKey === "VPL-999");
    expect(meta!.readiness).toBe("drafting");
  });

  it("assigns the sprint via moveToSprint, not on create", async () => {
    const { jiraClient } = await import("@/lib/jira-client");
    await POST(postRequest({ title: "Into sprint", sprintId: "42" }));
    expect((jiraClient.createIssue as ReturnType<typeof vi.fn>).mock.calls[0][0]).not.toHaveProperty("sprintId");
    expect(jiraClient.moveToSprint).toHaveBeenCalledWith(["VPL-999"], 42);
    const row = testDb.select().from(ticket).all().find((r) => r.jiraKey === "VPL-999");
    expect(row!.sprintName).toBe("42");
  });

  it("does not persist a sprint locally when the assignment fails", async () => {
    const { jiraClient } = await import("@/lib/jira-client");
    (jiraClient.moveToSprint as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("sprint closed"));

    const res = await POST(postRequest({ title: "Into sprint", sprintId: "42" }));

    expect(res.status).toBe(200);
    const row = testDb.select().from(ticket).all().find((r) => r.jiraKey === "VPL-999");
    expect(row!.sprintName).toBeNull();
  });

  it("does not assign a sprint when absent or blank", async () => {
    const { jiraClient } = await import("@/lib/jira-client");
    await POST(postRequest({ title: "No sprint", sprintId: "  " }));
    expect(jiraClient.moveToSprint).not.toHaveBeenCalled();
    const row = testDb.select().from(ticket).all().find((r) => r.jiraKey === "VPL-999");
    expect(row!.sprintName).toBeNull();
  });

  it("defaults issueType to Story", async () => {
    const { jiraClient } = await import("@/lib/jira-client");
    await POST(postRequest({ title: "Default type" }));
    expect(jiraClient.createIssue).toHaveBeenCalledWith(expect.objectContaining({ issueType: "Story" }));
  });

  it("returns 400 for missing title", async () => {
    const res = await POST(postRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty title", async () => {
    const res = await POST(postRequest({ title: "  " }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid issueType", async () => {
    const res = await POST(postRequest({ title: "Test", issueType: "Epic" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("issueType must be one of");
  });
});
