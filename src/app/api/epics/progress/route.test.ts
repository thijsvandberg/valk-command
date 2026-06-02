// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, appSetting } from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

const mockCache = vi.hoisted(() => ({
  get: vi.fn().mockReturnValue(null),
  set: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock("@/lib/cache", () => ({ cache: mockCache }));

import { GET } from "./route";

const SPRINTS = [
  { id: 10, name: "Sprint A", state: "closed", startDate: "2026-01-01", endDate: "2026-01-14" },
  { id: 11, name: "Sprint B", state: "closed", startDate: "2026-01-15", endDate: "2026-01-28" },
  { id: 12, name: "Sprint C", state: "active", startDate: "2026-01-29", endDate: "2026-02-11" },
  { id: 13, name: "Sprint D", state: "future", startDate: "2026-02-12", endDate: "2026-02-25" },
];

function seedSprints() {
  testDb.insert(appSetting).values({ key: "jira_sprints", value: JSON.stringify(SPRINTS) }).run();
}

describe("GET /api/epics/progress", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
    mockCache.get.mockReturnValue(null);
  });

  it("returns an empty array when there are no epics", async () => {
    seedSprints();
    const res = await GET();
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data).toEqual([]);
  });

  it("returns cached data with X-Cache HIT", async () => {
    mockCache.get.mockReturnValue([{ key: "VPL-E1" }]);
    const res = await GET();
    expect(res.headers.get("X-Cache")).toBe("HIT");
    expect(mockCache.set).not.toHaveBeenCalled();
  });

  it("aggregates tickets and completed counts per epic", async () => {
    seedSprints();
    testDb.insert(ticket).values([
      { jiraKey: "VPL-E1", title: "Epic One", status: "IN PROGRESS", type: "epic" },
      { jiraKey: "VPL-1", title: "T1", status: "DONE", type: "story", epicKey: "VPL-E1", epic: "Epic One", storyPoints: 3, sprintName: "12" },
      { jiraKey: "VPL-2", title: "T2", status: "IN PROGRESS", type: "story", epicKey: "VPL-E1", epic: "Epic One", storyPoints: 5, sprintName: "12" },
      { jiraKey: "VPL-3", title: "T3", status: "TO DO", type: "task", epicKey: "VPL-E1", epic: "Epic One", storyPoints: 2, sprintName: "11" },
    ]).run();

    const res = await GET();
    const data = await res.json();
    expect(res.headers.get("X-Cache")).toBe("MISS");
    expect(data).toHaveLength(1);
    const e = data[0];
    expect(e.key).toBe("VPL-E1");
    expect(e.name).toBe("Epic One");
    expect(e.totalTickets).toBe(3);
    expect(e.completedTickets).toBe(1);
    expect(e.totalPoints).toBe(10);
    expect(e.completedPoints).toBe(3);
    expect(e.inProgressPoints).toBe(5);
    expect(e.todoPoints).toBe(2);
    expect(e.pointsBased).toBe(true);
  });

  it("prefers the synced epic title over the child epic label", async () => {
    seedSprints();
    testDb.insert(ticket).values([
      { jiraKey: "VPL-E1", title: "Canonical Name", status: "TO DO", type: "epic" },
      { jiraKey: "VPL-1", title: "T1", status: "TO DO", type: "story", epicKey: "VPL-E1", epic: "Stale Label", sprintName: "12" },
    ]).run();

    const res = await GET();
    const data = await res.json();
    expect(data[0].name).toBe("Canonical Name");
  });

  it("falls back to ticket-count progress when the epic has no points", async () => {
    seedSprints();
    testDb.insert(ticket).values([
      { jiraKey: "VPL-1", title: "T1", status: "DONE", type: "story", epicKey: "VPL-E9", epic: "Pointless Epic", sprintName: "12" },
      { jiraKey: "VPL-2", title: "T2", status: "TO DO", type: "story", epicKey: "VPL-E9", epic: "Pointless Epic", sprintName: "12" },
    ]).run();

    const res = await GET();
    const data = await res.json();
    const e = data.find((x: { key: string }) => x.key === "VPL-E9");
    expect(e.pointsBased).toBe(false);
    expect(e.totalPoints).toBe(0);
    expect(e.totalTickets).toBe(2);
    expect(e.completedTickets).toBe(1);
  });

  it("excludes deprecated, draft and removed tickets from totals", async () => {
    seedSprints();
    testDb.insert(ticket).values([
      { jiraKey: "VPL-1", title: "Kept", status: "DONE", type: "story", epicKey: "VPL-E1", epic: "E", storyPoints: 3, sprintName: "12" },
      { jiraKey: "VPL-2", title: "Deprecated", status: "DEPRECATED", type: "story", epicKey: "VPL-E1", epic: "E", storyPoints: 8, sprintName: "12" },
      { jiraKey: "VPL-3", title: "Draft", status: "DRAFTING", type: "story", epicKey: "VPL-E1", epic: "E", storyPoints: 8, sprintName: "12" },
      { jiraKey: "VPL-4", title: "Removed", status: "TO DO", type: "story", epicKey: "VPL-E1", epic: "E", storyPoints: 8, sprintName: "12", removedFromJiraAt: "2026-02-01T00:00:00Z" },
    ]).run();

    const res = await GET();
    const data = await res.json();
    expect(data[0].totalTickets).toBe(1);
    expect(data[0].totalPoints).toBe(3);
  });

  it("only counts tickets in the recent-sprint window (active + 2 recent closed + backlog)", async () => {
    seedSprints();
    testDb.insert(ticket).values([
      { jiraKey: "VPL-1", title: "Active", status: "TO DO", type: "story", epicKey: "VPL-E1", epic: "E", sprintName: "12" },
      { jiraKey: "VPL-2", title: "Recent closed", status: "TO DO", type: "story", epicKey: "VPL-E1", epic: "E", sprintName: "11" },
      { jiraKey: "VPL-3", title: "Older closed (10) - in window of 3", status: "TO DO", type: "story", epicKey: "VPL-E1", epic: "E", sprintName: "10" },
      { jiraKey: "VPL-4", title: "Future - excluded", status: "TO DO", type: "story", epicKey: "VPL-E1", epic: "E", sprintName: "13" },
      { jiraKey: "VPL-5", title: "Backlog", status: "TO DO", type: "story", epicKey: "VPL-E1", epic: "E", sprintName: "" },
    ]).run();

    const res = await GET();
    const data = await res.json();
    // Window = active (12) + 2 most recent closed (11, 10) + backlog. Future (13) excluded.
    expect(data[0].totalTickets).toBe(4);
    expect(data[0].sprintIds).not.toContain("13");
    expect(data[0].sprintIds).toContain("");
  });

  it("builds a per-sprint breakdown for the timeline", async () => {
    seedSprints();
    testDb.insert(ticket).values([
      { jiraKey: "VPL-1", title: "T1", status: "DONE", type: "story", epicKey: "VPL-E1", epic: "E", sprintName: "12" },
      { jiraKey: "VPL-2", title: "T2", status: "TO DO", type: "story", epicKey: "VPL-E1", epic: "E", sprintName: "12" },
      { jiraKey: "VPL-3", title: "T3", status: "DONE", type: "story", epicKey: "VPL-E1", epic: "E", sprintName: "11" },
    ]).run();

    const res = await GET();
    const data = await res.json();
    const bySprint = Object.fromEntries(data[0].perSprint.map((p: { sprintId: string }) => [p.sprintId, p]));
    expect(bySprint["12"]).toEqual({ sprintId: "12", total: 2, completed: 1 });
    expect(bySprint["11"]).toEqual({ sprintId: "11", total: 1, completed: 1 });
  });
});
