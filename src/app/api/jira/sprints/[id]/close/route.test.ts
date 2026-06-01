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

vi.mock("@/lib/jira-client", () => ({
  jiraClient: {
    closeSprint: vi.fn(),
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

import { jiraClient, JiraApiError } from "@/lib/jira-client";
import { cache } from "@/lib/cache";
import { POST } from "./route";
import { appSetting } from "@/db/schema";

function makeRequest(id = "123"): [NextRequest, { params: Promise<{ id: string }> }] {
  const req = new NextRequest("http://localhost/api/jira/sprints/" + id + "/close", {
    method: "POST",
  });
  return [req, { params: Promise.resolve({ id }) }];
}

describe("POST /api/jira/sprints/[id]/close", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.resetAllMocks();
  });

  it("closes the sprint and flips the cached state to closed", async () => {
    vi.mocked(jiraClient.closeSprint).mockResolvedValue(undefined);

    const sprints = [
      { id: 123, name: "Sprint 1", state: "active", startDate: null, endDate: null, completeDate: null, goal: null },
    ];
    testDb.insert(appSetting).values({
      key: "jira_sprints",
      value: JSON.stringify(sprints),
    }).run();

    const [req, ctx] = makeRequest();
    const response = await POST(req, ctx);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);

    expect(jiraClient.closeSprint).toHaveBeenCalledWith(123);
    expect(cache.invalidate).toHaveBeenCalledWith("/api/jira/sprints");

    const row = testDb.select().from(appSetting).all().find((r) => r.key === "jira_sprints");
    const updated = JSON.parse(row!.value);
    expect(updated[0].state).toBe("closed");
    expect(updated[0].completeDate).toBeTruthy();
  });

  it("returns 400 for invalid sprint ID", async () => {
    const [req, ctx] = makeRequest("abc");
    const response = await POST(req, ctx);
    expect(response.status).toBe(400);
    expect(jiraClient.closeSprint).not.toHaveBeenCalled();
  });

  it("returns 403 on Jira permission error", async () => {
    vi.mocked(jiraClient.closeSprint).mockRejectedValue(
      new JiraApiError(403, "Forbidden", "No permission", "/rest/agile/1.0/sprint/123"),
    );

    const [req, ctx] = makeRequest();
    const response = await POST(req, ctx);
    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain("permissions");
  });

  it("returns 500 on generic Jira error", async () => {
    vi.mocked(jiraClient.closeSprint).mockRejectedValue(new Error("Network failure"));

    const [req, ctx] = makeRequest();
    const response = await POST(req, ctx);
    expect(response.status).toBe(500);
  });
});
