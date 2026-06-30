// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createJiraClientMock } from "@/test/mocks";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, ticketMetadata, sprintNameCache } from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn().mockReturnValue(null) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/sprint-membership", () => ({ syncTicketSprints: vi.fn() }));
vi.mock("@/lib/cache", () => ({ cache: { invalidate: vi.fn() } }));

vi.mock("@/lib/jira-client", () => createJiraClientMock({
  jiraClient: {
    createIssue: vi.fn().mockResolvedValue({ key: "VPL-999" }),
    moveToSprint: vi.fn().mockResolvedValue(undefined),
    rankToTopOfSprint: vi.fn().mockResolvedValue(undefined),
    rankToBottomOfSprint: vi.fn().mockResolvedValue(undefined),
    rankToTopOfBacklog: vi.fn().mockResolvedValue(undefined),
  },
}));

import { POST } from "./route";
import { jiraClient } from "@/lib/jira-client";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost:3100/api/story-writer/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function cacheName(sprintId: string, displayName: string) {
  testDb.insert(sprintNameCache).values({ sprintId, displayName }).run();
}

describe("POST /api/story-writer/create", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
  });

  it("returns 400 when title is missing", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when title is blank", async () => {
    const res = await POST(makeRequest({ title: "   " }));
    expect(res.status).toBe(400);
  });

  it("creates Jira issue and returns 201 with key", async () => {
    const res = await POST(makeRequest({ title: "New story" }));
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.key).toBe("VPL-999");
    expect(vi.mocked(jiraClient.createIssue)).toHaveBeenCalled();
  });

  it("inserts local ticket and metadata with readiness=drafting", async () => {
    await POST(makeRequest({ title: "New story" }));

    const row = testDb.select().from(ticket).all();
    expect(row).toHaveLength(1);
    expect(row[0].jiraKey).toBe("VPL-999");
    expect(row[0].title).toBe("New story");
    expect(row[0].status).toBe("TO DO");

    const meta = testDb.select().from(ticketMetadata).all();
    expect(meta).toHaveLength(1);
    expect(meta[0].readiness).toBe("drafting");
  });

  it("defaults issueType to story", async () => {
    await POST(makeRequest({ title: "Test" }));

    const row = testDb.select().from(ticket).all();
    expect(row[0].type).toBe("story");
  });

  it("uses provided issueType", async () => {
    await POST(makeRequest({ title: "Test task", issueType: "task" }));

    const row = testDb.select().from(ticket).all();
    expect(row[0].type).toBe("task");
  });

  it("assigns the sprint and ranks the new story to the BOTTOM of a regular sprint (BRDG-371)", async () => {
    cacheName("42", "BT: 140");
    const res = await POST(makeRequest({ title: "Into sprint", sprintId: "42" }));
    expect(res.status).toBe(201);

    // Jira ignores sprint-on-create, so it is applied via the field-edit path...
    expect((jiraClient.createIssue as ReturnType<typeof vi.fn>).mock.calls[0][0]).not.toHaveProperty("sprintId");
    expect(jiraClient.moveToSprint).toHaveBeenCalledWith(["VPL-999"], 42);
    // ...then ranked to the bottom of the regular sprint.
    expect(jiraClient.rankToBottomOfSprint).toHaveBeenCalledWith(["VPL-999"], 42);
    expect(jiraClient.rankToTopOfSprint).not.toHaveBeenCalled();

    const row = testDb.select().from(ticket).all();
    expect(row[0].sprintName).toBe("42");
  });

  it("ranks a no-sprintId create to the TOP of the backlog", async () => {
    await POST(makeRequest({ title: "Backlog story" }));

    expect(jiraClient.moveToSprint).not.toHaveBeenCalled();
    expect(jiraClient.rankToTopOfBacklog).toHaveBeenCalledWith(["VPL-999"]);
    expect(jiraClient.rankToBottomOfSprint).not.toHaveBeenCalled();
    expect(jiraClient.rankToTopOfSprint).not.toHaveBeenCalled();

    const row = testDb.select().from(ticket).all();
    expect(row[0].sprintName).toBeNull();
  });

  it("tolerates a rank failure: the story is still created and assigned", async () => {
    cacheName("42", "BT: 140");
    (jiraClient.rankToBottomOfSprint as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("rank API down"));

    const res = await POST(makeRequest({ title: "Into sprint", sprintId: "42" }));
    expect(res.status).toBe(201);

    const row = testDb.select().from(ticket).all();
    expect(row[0].sprintName).toBe("42");
  });

  it("falls back to the backlog (top) when the move fails", async () => {
    cacheName("42", "BT: 140");
    (jiraClient.moveToSprint as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("sprint closed"));

    const res = await POST(makeRequest({ title: "Into sprint", sprintId: "42" }));
    expect(res.status).toBe(201);
    // The story fell back to the backlog, so it ranks to the top of the backlog.
    expect(jiraClient.rankToTopOfBacklog).toHaveBeenCalledWith(["VPL-999"]);
    expect(jiraClient.rankToBottomOfSprint).not.toHaveBeenCalled();

    const row = testDb.select().from(ticket).all();
    expect(row[0].sprintName).toBeNull();
  });

  it("returns 502 when Jira creation fails", async () => {
    vi.mocked(jiraClient.createIssue).mockRejectedValueOnce(new Error("Jira down"));

    const res = await POST(makeRequest({ title: "Will fail" }));
    expect(res.status).toBe(502);
  });
});
