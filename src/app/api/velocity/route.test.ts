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

import { GET } from "./route";
import { appSetting, ticket } from "@/db/schema";
import { NextRequest } from "next/server";

function makeRequest(search: string): NextRequest {
  return new NextRequest(`http://localhost:3100/api/velocity${search}`, {
    method: "GET",
  });
}

describe("GET /api/velocity", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns 400 when teamPrefix is missing", async () => {
    const response = await GET(makeRequest(""));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("teamPrefix required");
  });

  it("returns empty array when no sprint data", async () => {
    const response = await GET(makeRequest("?teamPrefix=BT"));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual([]);
  });

  it("returns velocity data for closed sprints with tickets", async () => {
    const sprints = [
      { id: 100, name: "BT: 10", state: "closed", startDate: "2026-01-01", endDate: "2026-01-14", goal: null },
      { id: 101, name: "BT: 11", state: "closed", startDate: "2026-01-15", endDate: "2026-01-28", goal: null },
      { id: 102, name: "BT: 12", state: "active", startDate: "2026-01-29", endDate: "2026-02-11", goal: null },
    ];
    testDb.insert(appSetting).values({
      key: "jira_sprints",
      value: JSON.stringify(sprints),
    }).run();

    testDb.insert(ticket).values({
      jiraKey: "BT-1",
      title: "Ticket 1",
      type: "Story",
      status: "DONE",
      storyPoints: 5,
      sprintName: "100",
    }).run();
    testDb.insert(ticket).values({
      jiraKey: "BT-2",
      title: "Ticket 2",
      type: "Story",
      status: "TO DO",
      storyPoints: 3,
      sprintName: "100",
    }).run();

    const response = await GET(makeRequest("?teamPrefix=BT"));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveLength(1);
    expect(data[0].sprintId).toBe(100);
    expect(data[0].sprintName).toBe("BT: 10");
    expect(data[0].completedPoints).toBe(5);
  });

  it("filters by team prefix", async () => {
    const sprints = [
      { id: 200, name: "BM: 5", state: "closed", startDate: "2026-01-01", endDate: "2026-01-14", goal: null },
      { id: 201, name: "BT: 20", state: "closed", startDate: "2026-01-01", endDate: "2026-01-14", goal: null },
    ];
    testDb.insert(appSetting).values({
      key: "jira_sprints",
      value: JSON.stringify(sprints),
    }).run();
    testDb.insert(ticket).values({
      jiraKey: "BM-1",
      title: "BM ticket",
      type: "Story",
      status: "DONE",
      storyPoints: 8,
      sprintName: "200",
    }).run();
    testDb.insert(ticket).values({
      jiraKey: "BT-10",
      title: "BT ticket",
      type: "Story",
      status: "DONE",
      storyPoints: 3,
      sprintName: "201",
    }).run();

    const bmResponse = await GET(makeRequest("?teamPrefix=BM"));
    const bmData = await bmResponse.json();
    expect(bmData).toHaveLength(1);
    expect(bmData[0].completedPoints).toBe(8);

    const btResponse = await GET(makeRequest("?teamPrefix=BT"));
    const btData = await btResponse.json();
    expect(btData).toHaveLength(1);
    expect(btData[0].completedPoints).toBe(3);
  });
});
