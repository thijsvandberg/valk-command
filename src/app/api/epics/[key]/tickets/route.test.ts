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

import { GET } from "./route";

const SPRINTS = [
  { id: 11, name: "Sprint B", state: "closed", startDate: "2026-01-15", endDate: "2026-01-28" },
  { id: 12, name: "Sprint C", state: "active", startDate: "2026-01-29", endDate: "2026-02-11" },
  { id: 13, name: "Sprint D", state: "future", startDate: "2026-02-12", endDate: "2026-02-25" },
];

function ctx(key: string) {
  return { params: Promise.resolve({ key }) };
}

describe("GET /api/epics/[key]/tickets", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
    testDb.insert(appSetting).values({ key: "jira_sprints", value: JSON.stringify(SPRINTS) }).run();
  });

  it("returns the epic's child tickets in the recent window", async () => {
    testDb.insert(ticket).values([
      { jiraKey: "VPL-1", title: "Child 1", status: "DONE", type: "story", epicKey: "VPL-E1", storyPoints: 3, assignee: "Jane Doe", sprintName: "12" },
      { jiraKey: "VPL-2", title: "Child 2", status: "TO DO", type: "task", epicKey: "VPL-E1", sprintName: "11" },
    ]).run();

    const res = await GET(new Request("http://t"), ctx("VPL-E1"));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data).toHaveLength(2);
    const c1 = data.find((t: { key: string }) => t.key === "VPL-1");
    expect(c1.title).toBe("Child 1");
    expect(c1.jiraStatus).toBe("DONE");
    expect(c1.storyPoints).toBe(3);
    expect(c1.assignee).toEqual({ name: "Jane Doe", initials: "JD", color: expect.any(String) });
    expect(c1.sprintId).toBe("12");
  });

  it("returns an empty array for an epic with no children", async () => {
    const res = await GET(new Request("http://t"), ctx("VPL-NONE"));
    const data = await res.json();
    expect(data).toEqual([]);
  });

  it("excludes deprecated, draft, removed and out-of-window tickets", async () => {
    testDb.insert(ticket).values([
      { jiraKey: "VPL-1", title: "Kept", status: "TO DO", type: "story", epicKey: "VPL-E1", sprintName: "12" },
      { jiraKey: "VPL-2", title: "Deprecated", status: "DEPRECATED", type: "story", epicKey: "VPL-E1", sprintName: "12" },
      { jiraKey: "VPL-3", title: "Future", status: "TO DO", type: "story", epicKey: "VPL-E1", sprintName: "13" },
      { jiraKey: "VPL-4", title: "Removed", status: "TO DO", type: "story", epicKey: "VPL-E1", sprintName: "12", removedFromJiraAt: "2026-02-01T00:00:00Z" },
    ]).run();

    const res = await GET(new Request("http://t"), ctx("VPL-E1"));
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].key).toBe("VPL-1");
  });

  it("includes backlog tickets", async () => {
    testDb.insert(ticket).values([
      { jiraKey: "VPL-1", title: "Backlog", status: "TO DO", type: "story", epicKey: "VPL-E1", sprintName: "" },
    ]).run();

    const res = await GET(new Request("http://t"), ctx("VPL-E1"));
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].sprintId).toBe("");
  });
});
