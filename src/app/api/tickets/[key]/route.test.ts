import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket } from "@/db/schema";
import { cache } from "@/lib/cache";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/jira-client", () => ({
  jiraClient: { updateIssue: vi.fn().mockResolvedValue(undefined) },
  STORY_POINTS_FIELD: "customfield_11909",
}));

vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

import { GET, PATCH } from "./route";

function seedTicket(db: BetterSQLite3Database<typeof schema>, key: string) {
  db.insert(ticket)
    .values({
      jiraKey: key,
      title: `Ticket ${key}`,
      status: "TO DO",
    })
    .run();
}

function makeParams(key: string): { params: Promise<{ key: string }> } {
  return { params: Promise.resolve({ key }) };
}

describe("GET /api/tickets/[key]", () => {
  beforeEach(() => {
    testDb = createTestDb();
    cache.flush();
  });

  it("returns ticket when found", async () => {
    seedTicket(testDb, "VPL-100");

    const response = await GET(
      new Request("http://localhost:3100/api/tickets/VPL-100"),
      makeParams("VPL-100"),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    // New shape: `key` field (mapped from jiraKey)
    expect(data.key).toBe("VPL-100");
    expect(data.title).toBe("Ticket VPL-100");
  });

  it("returns 404 when ticket not found", async () => {
    const response = await GET(
      new Request("http://localhost:3100/api/tickets/VPL-999"),
      makeParams("VPL-999"),
    );

    expect(response.status).toBe(404);
  });

  it("includes PO metadata when available", async () => {
    seedTicket(testDb, "VPL-100");

    const { ticketMetadata } = await import("@/db/schema");
    testDb
      .insert(ticketMetadata)
      .values({
        jiraKey: "VPL-100",
        poStatus: "Draft",
        qualityScore: 60,
      })
      .run();

    const response = await GET(
      new Request("http://localhost:3100/api/tickets/VPL-100"),
      makeParams("VPL-100"),
    );
    const data = await response.json();

    // New shape: poStatus is flattened into the ticket object, metadata still included separately
    expect(data.poStatus).toBe("Draft");
    expect(data.qualityScore).toBe(60);
    expect(data.metadata).not.toBeNull();
    expect(data.metadata.poStatus).toBe("Draft");
  });
});

describe("PATCH /api/tickets/[key] - story points", () => {
  beforeEach(() => {
    testDb = createTestDb();
    cache.flush();
    vi.clearAllMocks();
  });

  it("updates story points in the database", async () => {
    seedTicket(testDb, "VPL-200");

    const response = await PATCH(
      new Request("http://localhost:3100/api/tickets/VPL-200", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyPoints: 5 }),
      }),
      makeParams("VPL-200"),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.storyPoints).toBe(5);

    // Verify via GET that the DB value is persisted
    cache.flush();
    const getRes = await GET(
      new Request("http://localhost:3100/api/tickets/VPL-200"),
      makeParams("VPL-200"),
    );
    const getData = await getRes.json();
    expect(getData.storyPoints).toBe(5);
  });

  it("pushes numeric story points to Jira", async () => {
    seedTicket(testDb, "VPL-201");
    const { jiraClient } = await import("@/lib/jira-client");

    await PATCH(
      new Request("http://localhost:3100/api/tickets/VPL-201", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyPoints: 8 }),
      }),
      makeParams("VPL-201"),
    );

    expect(jiraClient.updateIssue).toHaveBeenCalledWith(
      "VPL-201",
      { customfield_11909: 8 },
    );
  });

  it("pushes null to Jira when story points is 0 (N/A)", async () => {
    seedTicket(testDb, "VPL-202");
    const { jiraClient } = await import("@/lib/jira-client");

    await PATCH(
      new Request("http://localhost:3100/api/tickets/VPL-202", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyPoints: 0 }),
      }),
      makeParams("VPL-202"),
    );

    expect(jiraClient.updateIssue).toHaveBeenCalledWith(
      "VPL-202",
      { customfield_11909: null },
    );
  });

  it("pushes null to Jira when story points is null (unset)", async () => {
    seedTicket(testDb, "VPL-203");
    const { jiraClient } = await import("@/lib/jira-client");

    await PATCH(
      new Request("http://localhost:3100/api/tickets/VPL-203", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyPoints: null }),
      }),
      makeParams("VPL-203"),
    );

    expect(jiraClient.updateIssue).toHaveBeenCalledWith(
      "VPL-203",
      { customfield_11909: null },
    );
  });

  it("returns 404 for non-existent ticket", async () => {
    const response = await PATCH(
      new Request("http://localhost:3100/api/tickets/VPL-999", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyPoints: 3 }),
      }),
      makeParams("VPL-999"),
    );

    expect(response.status).toBe(404);
  });

  it("returns 400 for invalid storyPoints value", async () => {
    seedTicket(testDb, "VPL-204");

    const response = await PATCH(
      new Request("http://localhost:3100/api/tickets/VPL-204", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyPoints: "abc" }),
      }),
      makeParams("VPL-204"),
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 when no valid fields provided", async () => {
    seedTicket(testDb, "VPL-205");

    const response = await PATCH(
      new Request("http://localhost:3100/api/tickets/VPL-205", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unknownField: true }),
      }),
      makeParams("VPL-205"),
    );

    expect(response.status).toBe(400);
  });
});
