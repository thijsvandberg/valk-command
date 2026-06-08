// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket } from "@/db/schema";
import { eq } from "drizzle-orm";
import { cache } from "@/lib/cache";
import { seedTicket } from "@/test/builders";
import { buildGet, buildJson, buildParams } from "@/test/request-helpers";
import { createJiraClientMock } from "@/test/mocks";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/jira-client", () =>
  createJiraClientMock({
    jiraClient: {
      getIssue: vi.fn().mockResolvedValue({
        fields: { updated: "2024-06-01T00:00:00.000Z" },
      }),
    },
  }),
);

vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

// Capture after() callbacks instead of running them inside the response.
vi.mock("next/server", async (importOriginal) => {
  const orig = await importOriginal<typeof import("next/server")>();
  return { ...orig, after: vi.fn() };
});

vi.mock("@/lib/sync-tickets-service", () => ({
  syncIndividualTickets: vi.fn().mockResolvedValue({ count: 1, live: false, strategy: "test", tickets: [] }),
}));

import { after } from "next/server";
import { syncIndividualTickets } from "@/lib/sync-tickets-service";
import { GET, PATCH } from "./route";

describe("GET /api/tickets/[key]", () => {
  beforeEach(() => {
    testDb = createTestDb();
    cache.flush();
  });

  it("returns ticket when found", async () => {
    seedTicket(testDb, { jiraKey: "VPL-100" });

    const response = await GET(
      buildGet("/api/tickets/VPL-100"),
      buildParams({ key: "VPL-100" }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    // New shape: `key` field (mapped from jiraKey)
    expect(data.key).toBe("VPL-100");
    expect(data.title).toBe("Test ticket");
  });

  it("returns 404 when ticket not found", async () => {
    const response = await GET(
      buildGet("/api/tickets/VPL-999"),
      buildParams({ key: "VPL-999" }),
    );

    expect(response.status).toBe(404);
  });

  it("includes PO metadata when available", async () => {
    seedTicket(testDb, { jiraKey: "VPL-100" });

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
      buildGet("/api/tickets/VPL-100"),
      buildParams({ key: "VPL-100" }),
    );
    const data = await response.json();

    expect(data.poStatus).toBe("Draft");
    expect(data.qualityScore).toBe(60);
  });

  it("sets Cache-Control to no-cache on cache miss", async () => {
    seedTicket(testDb, { jiraKey: "VPL-100" });

    const response = await GET(
      buildGet("/api/tickets/VPL-100"),
      buildParams({ key: "VPL-100" }),
    );

    expect(response.headers.get("Cache-Control")).toBe("private, no-cache");
  });

  it("sets Cache-Control to no-cache on cache hit", async () => {
    seedTicket(testDb, { jiraKey: "VPL-100" });

    // Prime the cache
    await GET(
      buildGet("/api/tickets/VPL-100"),
      buildParams({ key: "VPL-100" }),
    );

    const response = await GET(
      buildGet("/api/tickets/VPL-100"),
      buildParams({ key: "VPL-100" }),
    );

    expect(response.headers.get("X-Cache")).toBe("HIT");
    expect(response.headers.get("Cache-Control")).toBe("private, no-cache");
  });

  it("flags and schedules a background re-sync for children with legacy name-only sprints", async () => {
    vi.mocked(after).mockClear();
    vi.mocked(syncIndividualTickets).mockClear();
    seedTicket(testDb, { jiraKey: "VPL-700", title: "Epic", type: "epic" });
    seedTicket(testDb, { jiraKey: "VPL-701", title: "Legacy child", epicKey: "VPL-700", sprintName: "VP Sprint 66 Angels" });

    const response = await GET(
      buildGet("/api/tickets/VPL-700"),
      buildParams({ key: "VPL-700" }),
    );
    const data = await response.json();

    expect(data.resyncingSprints).toBe(true);
    expect(after).toHaveBeenCalledTimes(1);

    // Running the scheduled callback re-syncs the child and drops the dependent caches.
    const invalidateSpy = vi.spyOn(cache, "invalidate");
    const cb = vi.mocked(after).mock.calls[0][0] as () => Promise<void>;
    await cb();

    expect(syncIndividualTickets).toHaveBeenCalledWith(["VPL-701"]);
    expect(invalidateSpy).toHaveBeenCalledWith("/api/tickets/VPL-700");
    expect(invalidateSpy).toHaveBeenCalledWith("/api/jira/sprints");
    invalidateSpy.mockRestore();
  });

  it("does not schedule a re-sync when child sprints are numeric ids", async () => {
    vi.mocked(after).mockClear();
    seedTicket(testDb, { jiraKey: "VPL-710", title: "Epic", type: "epic" });
    seedTicket(testDb, { jiraKey: "VPL-711", title: "By id", epicKey: "VPL-710", sprintName: "5995" });

    const response = await GET(
      buildGet("/api/tickets/VPL-710"),
      buildParams({ key: "VPL-710" }),
    );
    const data = await response.json();

    expect(data.resyncingSprints).toBeUndefined();
    expect(after).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/tickets/[key] - story points", () => {
  beforeEach(() => {
    testDb = createTestDb();
    cache.flush();
    vi.clearAllMocks();
  });

  it("updates story points in the database", async () => {
    seedTicket(testDb, { jiraKey: "VPL-200" });

    const response = await PATCH(
      buildJson("PATCH", "/api/tickets/VPL-200", { storyPoints: 5 }),
      buildParams({ key: "VPL-200" }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.storyPoints).toBe(5);

    // Verify via GET that the DB value is persisted
    cache.flush();
    const getRes = await GET(
      buildGet("/api/tickets/VPL-200"),
      buildParams({ key: "VPL-200" }),
    );
    const getData = await getRes.json();
    expect(getData.storyPoints).toBe(5);
  });

  it("pushes numeric story points to Jira", async () => {
    seedTicket(testDb, { jiraKey: "VPL-201" });
    const { jiraClient } = await import("@/lib/jira-client");

    await PATCH(
      buildJson("PATCH", "/api/tickets/VPL-201", { storyPoints: 8 }),
      buildParams({ key: "VPL-201" }),
    );

    expect(jiraClient.updateIssue).toHaveBeenCalledWith(
      "VPL-201",
      { customfield_11909: 8 },
    );
  });

  it("pushes null to Jira when story points is 0 (N/A)", async () => {
    seedTicket(testDb, { jiraKey: "VPL-202" });
    const { jiraClient } = await import("@/lib/jira-client");

    await PATCH(
      buildJson("PATCH", "/api/tickets/VPL-202", { storyPoints: 0 }),
      buildParams({ key: "VPL-202" }),
    );

    expect(jiraClient.updateIssue).toHaveBeenCalledWith(
      "VPL-202",
      { customfield_11909: null },
    );
  });

  it("pushes null to Jira when story points is null (unset)", async () => {
    seedTicket(testDb, { jiraKey: "VPL-203" });
    const { jiraClient } = await import("@/lib/jira-client");

    await PATCH(
      buildJson("PATCH", "/api/tickets/VPL-203", { storyPoints: null }),
      buildParams({ key: "VPL-203" }),
    );

    expect(jiraClient.updateIssue).toHaveBeenCalledWith(
      "VPL-203",
      { customfield_11909: null },
    );
  });

  it("returns 404 for non-existent ticket", async () => {
    const response = await PATCH(
      buildJson("PATCH", "/api/tickets/VPL-999", { storyPoints: 3 }),
      buildParams({ key: "VPL-999" }),
    );

    expect(response.status).toBe(404);
  });

  it("returns 400 for invalid storyPoints value", async () => {
    seedTicket(testDb, { jiraKey: "VPL-204" });

    const response = await PATCH(
      buildJson("PATCH", "/api/tickets/VPL-204", { storyPoints: "abc" }),
      buildParams({ key: "VPL-204" }),
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 when no valid fields provided", async () => {
    seedTicket(testDb, { jiraKey: "VPL-205" });

    const response = await PATCH(
      buildJson("PATCH", "/api/tickets/VPL-205", { unknownField: true }),
      buildParams({ key: "VPL-205" }),
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
    seedTicket(testDb, { jiraKey: "VPL-300" });
    // Seed the epic ticket so the name can be resolved
    testDb.insert(ticket).values({ jiraKey: "VPL-50", title: "My Epic", status: "TO DO" }).run();

    const response = await PATCH(
      buildJson("PATCH", "/api/tickets/VPL-300", { epicKey: "VPL-50" }),
      buildParams({ key: "VPL-300" }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.epicKey).toBe("VPL-50");
    expect(data.epic).toBe("My Epic");

    // Verify persisted via GET
    cache.flush();
    const getRes = await GET(
      buildGet("/api/tickets/VPL-300"),
      buildParams({ key: "VPL-300" }),
    );
    const getData = await getRes.json();
    expect(getData.epicKey).toBe("VPL-50");
    expect(getData.epic).toBe("My Epic");
  });

  it("calls jiraClient.updateIssue with parent key", async () => {
    seedTicket(testDb, { jiraKey: "VPL-301" });
    const { jiraClient } = await import("@/lib/jira-client");

    await PATCH(
      buildJson("PATCH", "/api/tickets/VPL-301", { epicKey: "VPL-50" }),
      buildParams({ key: "VPL-301" }),
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
      buildJson("PATCH", "/api/tickets/VPL-302", { epicKey: null }),
      buildParams({ key: "VPL-302" }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.epicKey).toBeNull();
    expect(data.epic).toBeNull();
  });

  it("calls jiraClient.updateIssue with null parent on removal", async () => {
    seedTicket(testDb, { jiraKey: "VPL-303" });
    const { jiraClient } = await import("@/lib/jira-client");

    await PATCH(
      buildJson("PATCH", "/api/tickets/VPL-303", { epicKey: null }),
      buildParams({ key: "VPL-303" }),
    );

    expect(jiraClient.updateIssue).toHaveBeenCalledWith(
      "VPL-303",
      { parent: null },
    );
  });

  it("returns 400 for invalid epicKey type", async () => {
    seedTicket(testDb, { jiraKey: "VPL-304" });

    const response = await PATCH(
      buildJson("PATCH", "/api/tickets/VPL-304", { epicKey: 123 }),
      buildParams({ key: "VPL-304" }),
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 for empty string epicKey", async () => {
    seedTicket(testDb, { jiraKey: "VPL-305" });

    const response = await PATCH(
      buildJson("PATCH", "/api/tickets/VPL-305", { epicKey: "" }),
      buildParams({ key: "VPL-305" }),
    );

    expect(response.status).toBe(400);
  });

  it("falls back to epicKey as name when epic not found locally", async () => {
    seedTicket(testDb, { jiraKey: "VPL-306" });

    const response = await PATCH(
      buildJson("PATCH", "/api/tickets/VPL-306", { epicKey: "VPL-999" }),
      buildParams({ key: "VPL-306" }),
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
    seedTicket(testDb, { jiraKey: "VPL-400" });

    const response = await PATCH(
      buildJson("PATCH", "/api/tickets/VPL-400", { flagged: true }),
      buildParams({ key: "VPL-400" }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.flagged).toBe(true);

    // Verify persisted via GET
    cache.flush();
    const getRes = await GET(
      buildGet("/api/tickets/VPL-400"),
      buildParams({ key: "VPL-400" }),
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
      buildJson("PATCH", "/api/tickets/VPL-401", { flagged: false }),
      buildParams({ key: "VPL-401" }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.flagged).toBe(false);
  });

  it("calls addFlagComment with reason when flagging with reason", async () => {
    seedTicket(testDb, { jiraKey: "VPL-402" });
    const { jiraClient } = await import("@/lib/jira-client");

    await PATCH(
      buildJson("PATCH", "/api/tickets/VPL-402", { flagged: true, flagReason: "Blocked by API" }),
      buildParams({ key: "VPL-402" }),
    );

    // Async Jira sync fires in background IIFE, give it a tick
    await new Promise((r) => setTimeout(r, 10));

    expect(jiraClient.updateIssue).toHaveBeenCalledWith("VPL-402", { customfield_10002: [{ value: "Impediment" }] });
    expect(jiraClient.addFlagComment).toHaveBeenCalledWith("VPL-402", "flag_on", "Blocked by API");
  });

  it("does not post a comment when unflagging without reason", async () => {
    testDb.insert(ticket).values({
      jiraKey: "VPL-403",
      title: "Flagged ticket",
      status: "TO DO",
      flagged: true,
    }).run();

    const { jiraClient } = await import("@/lib/jira-client");

    await PATCH(
      buildJson("PATCH", "/api/tickets/VPL-403", { flagged: false }),
      buildParams({ key: "VPL-403" }),
    );

    await new Promise((r) => setTimeout(r, 10));

    expect(jiraClient.updateIssue).toHaveBeenCalledWith("VPL-403", { customfield_10002: [] });
    expect(jiraClient.addFlagComment).not.toHaveBeenCalled();
  });

  it("does not post a comment when flagging without reason", async () => {
    seedTicket(testDb, { jiraKey: "VPL-404" });
    const { jiraClient } = await import("@/lib/jira-client");

    await PATCH(
      buildJson("PATCH", "/api/tickets/VPL-404", { flagged: true }),
      buildParams({ key: "VPL-404" }),
    );

    await new Promise((r) => setTimeout(r, 10));

    expect(jiraClient.addFlagComment).not.toHaveBeenCalled();
  });

  it("returns 400 when flagged is not a boolean", async () => {
    seedTicket(testDb, { jiraKey: "VPL-405" });

    const response = await PATCH(
      buildJson("PATCH", "/api/tickets/VPL-405", { flagged: "yes" }),
      buildParams({ key: "VPL-405" }),
    );

    expect(response.status).toBe(400);
  });
});

describe("PATCH /api/tickets/[key] - jiraUpdatedAt sync", () => {
  beforeEach(() => {
    testDb = createTestDb();
    cache.flush();
    vi.clearAllMocks();
  });

  it("syncs jiraUpdatedAt after story points push to Jira", async () => {
    seedTicket(testDb, { jiraKey: "VPL-500" });
    const { jiraClient } = await import("@/lib/jira-client");

    vi.mocked(jiraClient.getIssue).mockResolvedValue({
      fields: { updated: "2024-06-15T12:00:00.000Z" },
    } as never);

    await PATCH(
      buildJson("PATCH", "/api/tickets/VPL-500", { storyPoints: 5 }),
      buildParams({ key: "VPL-500" }),
    );

    await new Promise((r) => setTimeout(r, 50));

    const row = testDb.select().from(ticket).where(eq(ticket.jiraKey, "VPL-500")).get();
    expect(row?.jiraUpdatedAt).toBe("2024-06-15T12:00:00.000Z");
  });

  it("syncs jiraUpdatedAt after issue type change", async () => {
    seedTicket(testDb, { jiraKey: "VPL-501" });
    const { jiraClient } = await import("@/lib/jira-client");

    vi.mocked(jiraClient.getIssue).mockResolvedValue({
      fields: { updated: "2024-07-01T09:00:00.000Z" },
    } as never);

    await PATCH(
      buildJson("PATCH", "/api/tickets/VPL-501", { type: "bug" }),
      buildParams({ key: "VPL-501" }),
    );

    await new Promise((r) => setTimeout(r, 50));

    const row = testDb.select().from(ticket).where(eq(ticket.jiraKey, "VPL-501")).get();
    expect(row?.jiraUpdatedAt).toBe("2024-07-01T09:00:00.000Z");
  });

  it("syncs jiraUpdatedAt after flag toggle", async () => {
    seedTicket(testDb, { jiraKey: "VPL-502" });
    const { jiraClient } = await import("@/lib/jira-client");

    vi.mocked(jiraClient.getIssue).mockResolvedValue({
      fields: { updated: "2024-08-01T10:00:00.000Z" },
    } as never);

    await PATCH(
      buildJson("PATCH", "/api/tickets/VPL-502", { flagged: true }),
      buildParams({ key: "VPL-502" }),
    );

    await new Promise((r) => setTimeout(r, 50));

    const row = testDb.select().from(ticket).where(eq(ticket.jiraKey, "VPL-502")).get();
    expect(row?.jiraUpdatedAt).toBe("2024-08-01T10:00:00.000Z");
  });
});

describe("PATCH /api/tickets/[key] - error paths", () => {
  beforeEach(() => {
    testDb = createTestDb();
    cache.flush();
    vi.clearAllMocks();
  });

  it("returns 400 for invalid JSON body", async () => {
    seedTicket(testDb, { jiraKey: "VPL-600" });

    const response = await PATCH(
      new Request("http://localhost:3100/api/tickets/VPL-600", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      }),
      buildParams({ key: "VPL-600" }),
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 for empty JSON body", async () => {
    seedTicket(testDb, { jiraKey: "VPL-601" });

    const response = await PATCH(
      buildJson("PATCH", "/api/tickets/VPL-601", {}),
      buildParams({ key: "VPL-601" }),
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 for negative storyPoints", async () => {
    seedTicket(testDb, { jiraKey: "VPL-602" });

    const response = await PATCH(
      buildJson("PATCH", "/api/tickets/VPL-602", { storyPoints: -1 }),
      buildParams({ key: "VPL-602" }),
    );

    expect(response.status).toBe(400);
  });
});
