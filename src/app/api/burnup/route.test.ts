// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/jira-client", () => ({
  jiraClient: {
    isLive: false,
    getSprints: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/lib/cache", () => ({
  cache: {
    get: vi.fn().mockReturnValue(null),
    set: vi.fn(),
    invalidate: vi.fn(),
  },
}));

import { GET } from "./route";
import { appSetting, ticket, ticketMetadata } from "@/db/schema";

function makeRequest(search: string): Request {
  return new Request(`http://localhost:3100/api/burnup${search}`, {
    method: "GET",
  });
}

describe("GET /api/burnup", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns 400 when sprintId is missing", async () => {
    const response = await GET(makeRequest(""));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("sprintId is required");
  });

  it("returns 404 when sprint dates not found", async () => {
    const response = await GET(makeRequest("?sprintId=999"));
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe("Sprint dates not found");
  });

  it("returns baseline burnup for unseeded sprint", async () => {
    const sprints = [{
      id: 100,
      name: "BT: Sprint 10",
      state: "active",
      startDate: "2026-01-01T00:00:00Z",
      endDate: "2026-12-31T23:59:59Z",
      goal: null,
    }];
    testDb.insert(appSetting).values({
      key: "jira_sprints",
      value: JSON.stringify(sprints),
    }).run();

    testDb.insert(ticket).values({
      jiraKey: "BT-1",
      title: "Done ticket",
      type: "Story",
      status: "DONE",
      storyPoints: 5,
      sprintName: "100",
    }).run();
    testDb.insert(ticket).values({
      jiraKey: "BT-2",
      title: "Open ticket",
      type: "Story",
      status: "TO DO",
      storyPoints: 3,
      sprintName: "100",
    }).run();

    const response = await GET(makeRequest("?sprintId=100"));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.seeded).toBe(false);
    expect(data.totalSp).toBe(8);
    expect(data.points).toHaveLength(2);
    expect(data.points[0].spDone).toBe(0);
  });
});
