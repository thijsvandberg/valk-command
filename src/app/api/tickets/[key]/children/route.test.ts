import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket } from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() { return testDb; },
}));

vi.mock("@/lib/jira-client", () => ({
  jiraClient: {
    createIssue: vi.fn().mockResolvedValue({ key: "VPL-999", id: "99999" }),
  },
}));

vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/cache", () => ({
  cache: { invalidate: vi.fn() },
}));

import { POST } from "./route";

function makeParams(key: string) {
  return { params: Promise.resolve({ key }) };
}

function postRequest(key: string, body: unknown): Request {
  return new Request(`http://localhost:3100/api/tickets/${key}/children`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function seedEpic(key: string) {
  testDb.insert(ticket).values({
    jiraKey: key,
    title: `Epic ${key}`,
    type: "epic",
    status: "TO DO",
  }).run();
}

function seedStory(key: string) {
  testDb.insert(ticket).values({
    jiraKey: key,
    title: `Story ${key}`,
    type: "story",
    status: "TO DO",
  }).run();
}

describe("POST /api/tickets/[key]/children", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
  });

  it("creates a child story and returns it", async () => {
    seedEpic("VPL-100");
    const res = await POST(
      postRequest("VPL-100", { title: "New story" }),
      makeParams("VPL-100"),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.key).toBe("VPL-999");
    expect(data.title).toBe("New story");
    expect(data.type).toBe("story");
    expect(data.jiraStatus).toBe("TO DO");
    expect(data.assignee).toBeNull();
  });

  it("inserts child into ticket table with epicKey", async () => {
    seedEpic("VPL-100");
    await POST(
      postRequest("VPL-100", { title: "Child task", issueType: "Task" }),
      makeParams("VPL-100"),
    );

    const rows = testDb.select().from(ticket).all();
    const child = rows.find((r) => r.jiraKey === "VPL-999");
    expect(child).toBeDefined();
    expect(child!.epicKey).toBe("VPL-100");
    expect(child!.epic).toBe("Epic VPL-100");
    expect(child!.type).toBe("task");
  });

  it("calls Jira createIssue with correct params", async () => {
    seedEpic("VPL-100");
    const { jiraClient } = await import("@/lib/jira-client");

    await POST(
      postRequest("VPL-100", { title: "A bug", issueType: "Bug" }),
      makeParams("VPL-100"),
    );

    expect(jiraClient.createIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: "A bug",
        issueType: "Bug",
        parentKey: "VPL-100",
        projectKey: "VPL",
      }),
    );
  });

  it("defaults issueType to Story", async () => {
    seedEpic("VPL-100");
    const { jiraClient } = await import("@/lib/jira-client");

    await POST(
      postRequest("VPL-100", { title: "Default type" }),
      makeParams("VPL-100"),
    );

    expect(jiraClient.createIssue).toHaveBeenCalledWith(
      expect.objectContaining({ issueType: "Story" }),
    );
  });

  it("returns 404 for non-existent ticket", async () => {
    const res = await POST(
      postRequest("VPL-999", { title: "Something" }),
      makeParams("VPL-999"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 for non-epic parent", async () => {
    seedStory("VPL-100");
    const res = await POST(
      postRequest("VPL-100", { title: "Should fail" }),
      makeParams("VPL-100"),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Parent must be an epic");
  });

  it("returns 400 for missing title", async () => {
    seedEpic("VPL-100");
    const res = await POST(
      postRequest("VPL-100", {}),
      makeParams("VPL-100"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty title", async () => {
    seedEpic("VPL-100");
    const res = await POST(
      postRequest("VPL-100", { title: "  " }),
      makeParams("VPL-100"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid issueType", async () => {
    seedEpic("VPL-100");
    const res = await POST(
      postRequest("VPL-100", { title: "Test", issueType: "Epic" }),
      makeParams("VPL-100"),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("issueType must be one of");
  });
});
