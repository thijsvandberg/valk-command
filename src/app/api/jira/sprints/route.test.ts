// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { NextRequest } from "next/server";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

const mockEnv = {
  JIRA_BOARD_ID: "233",
};

vi.mock("@/lib/env", () => ({
  get env() {
    return mockEnv;
  },
}));

vi.mock("@/lib/jira-client", () => ({
  jiraClient: {
    getSprints: vi.fn(),
    createSprint: vi.fn(),
  },
  JiraApiError: class JiraApiError extends Error {
    status: number;
    statusText: string;
    responseBody: string;
    path: string;
    constructor(status: number, statusText: string, responseBody: string, path: string) {
      super(`Jira API ${status} ${statusText} on ${path}: ${responseBody}`);
      this.name = "JiraApiError";
      this.status = status;
      this.statusText = statusText;
      this.responseBody = responseBody;
      this.path = path;
    }
  },
}));

vi.mock("@/lib/cache", () => ({
  cache: {
    get: vi.fn().mockReturnValue(undefined),
    set: vi.fn(),
    invalidate: vi.fn(),
    flush: vi.fn(),
  },
}));

// Capture after() callbacks instead of running them inside the response, so we can assert the
// read-path backfill is scheduled and then run it explicitly.
vi.mock("next/server", async (importOriginal) => {
  const orig = await importOriginal<typeof import("next/server")>();
  return { ...orig, after: vi.fn() };
});

// Keep getBackfillCandidateIds real so it derives the referenced ids from the test DB; only stub
// the fetch step (ensureSprintsCached) we assert against.
vi.mock("@/lib/sprint-cache", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/sprint-cache")>();
  return { ...orig, ensureSprintsCached: vi.fn().mockResolvedValue(0) };
});

import { jiraClient, JiraApiError } from "@/lib/jira-client";
import { cache } from "@/lib/cache";
import { after } from "next/server";
import { ensureSprintsCached } from "@/lib/sprint-cache";
import { GET, POST } from "./route";
import { appSetting, ticket } from "@/db/schema";

describe("GET /api/jira/sprints", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.resetAllMocks();
    vi.mocked(cache.get).mockReturnValue(undefined);
    vi.mocked(cache.set).mockImplementation(() => {});
  });

  it("returns sprints from DB when jira_sprints setting exists", async () => {
    const sprints = [
      { id: 1, name: "Sprint 1", state: "active", startDate: null, endDate: null, goal: null },
    ];
    testDb.insert(appSetting).values({
      key: "jira_sprints",
      value: JSON.stringify(sprints),
    }).run();

    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data.sprints)).toBe(true);
    expect(data.sprints[0].id).toBe(1);
    expect(data.sprints[0].name).toBe("Sprint 1");
    expect(typeof data.sprints[0].hidden).toBe("boolean");
    expect(typeof data.backlogCount).toBe("number");
  });

  it("fetches from Jira client when no DB setting exists", async () => {
    vi.mocked(jiraClient.getSprints).mockResolvedValue([
      { id: 42, name: "Sprint 42", state: "future", startDate: undefined, endDate: undefined, goal: undefined, boardId: undefined, completeDate: undefined },
    ]);

    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.sprints[0].id).toBe(42);
    expect(jiraClient.getSprints).toHaveBeenCalled();
  });

  it("returns cached data when cache has an entry", async () => {
    const cached = { sprints: [{ id: 99, name: "Cached Sprint", state: "active", hidden: false }], backlogCount: 5 };
    vi.mocked(cache.get).mockReturnValue(cached);

    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.sprints[0].id).toBe(99);
    expect(data.backlogCount).toBe(5);
    // Jira client should NOT be called when cache is hit
    expect(jiraClient.getSprints).not.toHaveBeenCalled();
  });

  it("schedules a background backfill for the sprint ids referenced by tickets", async () => {
    testDb.insert(ticket).values([
      { jiraKey: "VPL-1", title: "A", status: "DONE", sprintName: "101" },
      { jiraKey: "VPL-2", title: "B", status: "DONE", sprintName: "102" },
      { jiraKey: "VPL-3", title: "C", status: "TO DO", sprintName: "101" }, // duplicate id
      { jiraKey: "VPL-4", title: "D", status: "TO DO", sprintName: "" }, // backlog, excluded
    ]).run();
    testDb.insert(appSetting).values({ key: "jira_sprints", value: "[]" }).run();

    await GET();

    // The backfill is scheduled (not run inside the response) ...
    expect(after).toHaveBeenCalledTimes(1);
    expect(ensureSprintsCached).not.toHaveBeenCalled();

    // ... and when the scheduled callback runs it passes the distinct referenced ids.
    const scheduled = vi.mocked(after).mock.calls[0][0] as () => Promise<void>;
    await scheduled();
    expect(ensureSprintsCached).toHaveBeenCalledTimes(1);
    const ids = vi.mocked(ensureSprintsCached).mock.calls[0][0] as string[];
    expect([...ids].sort()).toEqual(["101", "102"]);
  });
});

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/jira/sprints", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/jira/sprints", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.resetAllMocks();
    mockEnv.JIRA_BOARD_ID = "233";
  });

  it("creates a sprint in Jira and adds to local cache", async () => {
    vi.mocked(jiraClient.createSprint).mockResolvedValue({
      id: 500,
      name: "Sprint 50",
      state: "future",
      startDate: undefined,
      endDate: undefined,
      goal: "Ship it",
    });

    // Seed existing sprint cache
    testDb.insert(appSetting).values({
      key: "jira_sprints",
      value: JSON.stringify([{ id: 1, name: "Sprint 1", state: "active", startDate: null, endDate: null, completeDate: null, goal: null }]),
    }).run();

    const req = makePostRequest({ name: "Sprint 50", goal: "Ship it" });
    const response = await POST(req);
    expect(response.status).toBe(201);

    const data = await response.json();
    expect(data.id).toBe(500);
    expect(data.name).toBe("Sprint 50");
    expect(data.state).toBe("future");
    expect(data.goal).toBe("Ship it");

    expect(jiraClient.createSprint).toHaveBeenCalledWith({
      name: "Sprint 50",
      originBoardId: 233,
      goal: "Ship it",
    });

    expect(cache.invalidate).toHaveBeenCalledWith("/api/jira/sprints");

    // Check local cache was updated
    const row = testDb.select().from(appSetting).all().find((r) => r.key === "jira_sprints");
    const sprints = JSON.parse(row!.value);
    expect(sprints).toHaveLength(2);
    expect(sprints[1].id).toBe(500);
  });

  it("returns 400 when name is missing", async () => {
    const req = makePostRequest({});
    const response = await POST(req);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("name");
  });

  it("returns 400 when name is empty", async () => {
    const req = makePostRequest({ name: "   " });
    const response = await POST(req);
    expect(response.status).toBe(400);
  });

  it("returns 400 when JIRA_BOARD_ID is not configured", async () => {
    mockEnv.JIRA_BOARD_ID = "";

    const req = makePostRequest({ name: "Sprint 50" });
    const response = await POST(req);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("JIRA_BOARD_ID");
  });

  it("returns 403 on Jira permission error", async () => {
    vi.mocked(jiraClient.createSprint).mockRejectedValue(
      new JiraApiError(403, "Forbidden", "No permission", "/rest/agile/1.0/sprint"),
    );

    const req = makePostRequest({ name: "Sprint 50" });
    const response = await POST(req);
    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain("permissions");
  });

  it("returns 500 on generic Jira error", async () => {
    vi.mocked(jiraClient.createSprint).mockRejectedValue(new Error("Network failure"));

    const req = makePostRequest({ name: "Sprint 50" });
    const response = await POST(req);
    expect(response.status).toBe(500);
  });

  it("passes optional dates to Jira client", async () => {
    const isoStart = "2026-06-01T09:00:00.000Z";
    const isoEnd = "2026-06-14T17:00:00.000Z";

    vi.mocked(jiraClient.createSprint).mockResolvedValue({
      id: 501,
      name: "Sprint 51",
      state: "future",
      startDate: isoStart,
      endDate: isoEnd,
    });

    const req = makePostRequest({ name: "Sprint 51", startDate: isoStart, endDate: isoEnd });
    const response = await POST(req);
    expect(response.status).toBe(201);

    expect(jiraClient.createSprint).toHaveBeenCalledWith({
      name: "Sprint 51",
      originBoardId: 233,
      startDate: isoStart,
      endDate: isoEnd,
    });
  });
});
