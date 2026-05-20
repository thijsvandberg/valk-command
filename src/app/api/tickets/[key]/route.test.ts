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
  jiraClient: {
    updateIssue: vi.fn().mockResolvedValue(undefined),
    addComment: vi.fn().mockResolvedValue(undefined),
  },
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

describe("PATCH /api/tickets/[key] - epic", () => {
  beforeEach(() => {
    testDb = createTestDb();
    cache.flush();
    vi.clearAllMocks();
  });

  it("sets epic in the database when epicKey provided", async () => {
    seedTicket(testDb, "VPL-300");
    // Seed the epic ticket so the name can be resolved
    testDb.insert(ticket).values({ jiraKey: "VPL-50", title: "My Epic", status: "TO DO" }).run();

    const response = await PATCH(
      new Request("http://localhost:3100/api/tickets/VPL-300", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ epicKey: "VPL-50" }),
      }),
      makeParams("VPL-300"),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.epicKey).toBe("VPL-50");
    expect(data.epic).toBe("My Epic");

    // Verify persisted via GET
    cache.flush();
    const getRes = await GET(
      new Request("http://localhost:3100/api/tickets/VPL-300"),
      makeParams("VPL-300"),
    );
    const getData = await getRes.json();
    expect(getData.epicKey).toBe("VPL-50");
    expect(getData.epic).toBe("My Epic");
  });

  it("calls jiraClient.updateIssue with parent key", async () => {
    seedTicket(testDb, "VPL-301");
    const { jiraClient } = await import("@/lib/jira-client");

    await PATCH(
      new Request("http://localhost:3100/api/tickets/VPL-301", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ epicKey: "VPL-50" }),
      }),
      makeParams("VPL-301"),
    );

    expect(jiraClient.updateIssue).toHaveBeenCalledWith(
      "VPL-301",
      { parent: { key: "VPL-50" } },
    );
  });

  it("removes epic when epicKey is null", async () => {
    // Seed a ticket that already has an epic
    testDb.insert(ticket).values({
      jiraKey: "VPL-302",
      title: "Ticket with epic",
      status: "TO DO",
      epic: "Old Epic",
      epicKey: "VPL-10",
    }).run();

    const response = await PATCH(
      new Request("http://localhost:3100/api/tickets/VPL-302", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ epicKey: null }),
      }),
      makeParams("VPL-302"),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.epicKey).toBeNull();
    expect(data.epic).toBeNull();
  });

  it("calls jiraClient.updateIssue with null parent on removal", async () => {
    seedTicket(testDb, "VPL-303");
    const { jiraClient } = await import("@/lib/jira-client");

    await PATCH(
      new Request("http://localhost:3100/api/tickets/VPL-303", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ epicKey: null }),
      }),
      makeParams("VPL-303"),
    );

    expect(jiraClient.updateIssue).toHaveBeenCalledWith(
      "VPL-303",
      { parent: null },
    );
  });

  it("returns 400 for invalid epicKey type", async () => {
    seedTicket(testDb, "VPL-304");

    const response = await PATCH(
      new Request("http://localhost:3100/api/tickets/VPL-304", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ epicKey: 123 }),
      }),
      makeParams("VPL-304"),
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 for empty string epicKey", async () => {
    seedTicket(testDb, "VPL-305");

    const response = await PATCH(
      new Request("http://localhost:3100/api/tickets/VPL-305", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ epicKey: "" }),
      }),
      makeParams("VPL-305"),
    );

    expect(response.status).toBe(400);
  });

  it("falls back to epicKey as name when epic not found locally", async () => {
    seedTicket(testDb, "VPL-306");

    const response = await PATCH(
      new Request("http://localhost:3100/api/tickets/VPL-306", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ epicKey: "VPL-999" }),
      }),
      makeParams("VPL-306"),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.epicKey).toBe("VPL-999");
    expect(data.epic).toBe("VPL-999");
  });
});

describe("PATCH /api/tickets/[key] - flagged", () => {
  beforeEach(() => {
    testDb = createTestDb();
    cache.flush();
    vi.clearAllMocks();
  });

  it("flags a ticket and persists to database", async () => {
    seedTicket(testDb, "VPL-400");

    const response = await PATCH(
      new Request("http://localhost:3100/api/tickets/VPL-400", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flagged: true }),
      }),
      makeParams("VPL-400"),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.flagged).toBe(true);

    // Verify persisted via GET
    cache.flush();
    const getRes = await GET(
      new Request("http://localhost:3100/api/tickets/VPL-400"),
      makeParams("VPL-400"),
    );
    const getData = await getRes.json();
    expect(getData.flagged).toBe(true);
  });

  it("unflags a ticket", async () => {
    // Seed a flagged ticket
    testDb.insert(ticket).values({
      jiraKey: "VPL-401",
      title: "Flagged ticket",
      status: "TO DO",
      flagged: true,
    }).run();

    const response = await PATCH(
      new Request("http://localhost:3100/api/tickets/VPL-401", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flagged: false }),
      }),
      makeParams("VPL-401"),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.flagged).toBe(false);
  });

  it("calls jiraClient.updateIssue and addComment when flagging", async () => {
    seedTicket(testDb, "VPL-402");
    const { jiraClient } = await import("@/lib/jira-client");

    await PATCH(
      new Request("http://localhost:3100/api/tickets/VPL-402", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flagged: true, flagReason: "Blocked by API" }),
      }),
      makeParams("VPL-402"),
    );

    // Async Jira sync fires in background IIFE, give it a tick
    await new Promise((r) => setTimeout(r, 10));

    expect(jiraClient.updateIssue).toHaveBeenCalledWith("VPL-402", { flagged: true });
    expect(jiraClient.addComment).toHaveBeenCalledWith("VPL-402", "flag_on Flag added\n\nBlocked by API");
  });

  it("calls jiraClient.addComment with unflag message when unflagging", async () => {
    testDb.insert(ticket).values({
      jiraKey: "VPL-403",
      title: "Flagged ticket",
      status: "TO DO",
      flagged: true,
    }).run();

    const { jiraClient } = await import("@/lib/jira-client");

    await PATCH(
      new Request("http://localhost:3100/api/tickets/VPL-403", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flagged: false }),
      }),
      makeParams("VPL-403"),
    );

    await new Promise((r) => setTimeout(r, 10));

    expect(jiraClient.updateIssue).toHaveBeenCalledWith("VPL-403", { flagged: false });
    expect(jiraClient.addComment).toHaveBeenCalledWith("VPL-403", "flag_off Flag removed");
  });

  it("flags without reason when flagReason not provided", async () => {
    seedTicket(testDb, "VPL-404");
    const { jiraClient } = await import("@/lib/jira-client");

    await PATCH(
      new Request("http://localhost:3100/api/tickets/VPL-404", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flagged: true }),
      }),
      makeParams("VPL-404"),
    );

    await new Promise((r) => setTimeout(r, 10));

    expect(jiraClient.addComment).toHaveBeenCalledWith("VPL-404", "flag_on Flag added");
  });

  it("returns 400 when flagged is not a boolean", async () => {
    seedTicket(testDb, "VPL-405");

    const response = await PATCH(
      new Request("http://localhost:3100/api/tickets/VPL-405", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flagged: "yes" }),
      }),
      makeParams("VPL-405"),
    );

    expect(response.status).toBe(400);
  });
});
