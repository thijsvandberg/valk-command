// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createJiraClientMock } from "@/test/mocks";
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

vi.mock("@/lib/jira-client", () => createJiraClientMock({
  jiraClient: {
    updateSprint: vi.fn(),
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
import { PUT } from "./route";
import { appSetting } from "@/db/schema";

function makeRequest(body: unknown, id = "123"): [NextRequest, { params: Promise<{ id: string }> }] {
  const req = new NextRequest("http://localhost/api/jira/sprints/" + id, {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
  return [req, { params: Promise.resolve({ id }) }];
}

describe("PUT /api/jira/sprints/[id]", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.resetAllMocks();
  });

  it("updates sprint goal and refreshes local cache", async () => {
    vi.mocked(jiraClient.updateSprint).mockResolvedValue(undefined);

    const sprints = [
      { id: 123, name: "Sprint 1", state: "active", startDate: null, endDate: null, goal: null },
    ];
    testDb.insert(appSetting).values({
      key: "jira_sprints",
      value: JSON.stringify(sprints),
    }).run();

    const [req, ctx] = makeRequest({ goal: "Deliver auth module" });
    const response = await PUT(req, ctx);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);

    expect(jiraClient.updateSprint).toHaveBeenCalledWith(123, { goal: "Deliver auth module" });
    expect(cache.invalidate).toHaveBeenCalledWith("/api/jira/sprints");

    // Local cache should be updated
    const row = testDb.select().from(appSetting).all().find((r) => r.key === "jira_sprints");
    const updated = JSON.parse(row!.value);
    expect(updated[0].goal).toBe("Deliver auth module");
  });

  it("updates sprint name and refreshes local cache", async () => {
    vi.mocked(jiraClient.updateSprint).mockResolvedValue(undefined);

    const sprints = [
      { id: 123, name: "Sprint 1", state: "active", startDate: null, endDate: null, goal: null },
    ];
    testDb.insert(appSetting).values({
      key: "jira_sprints",
      value: JSON.stringify(sprints),
    }).run();

    const [req, ctx] = makeRequest({ name: "ARIE Sprint" });
    const response = await PUT(req, ctx);

    expect(response.status).toBe(200);
    expect(jiraClient.updateSprint).toHaveBeenCalledWith(123, { name: "ARIE Sprint" });

    const row = testDb.select().from(appSetting).all().find((r) => r.key === "jira_sprints");
    const updated = JSON.parse(row!.value);
    expect(updated[0].name).toBe("ARIE Sprint");
  });

  it("returns 400 for invalid sprint ID", async () => {
    const [req, ctx] = makeRequest({ goal: "test" }, "abc");
    const response = await PUT(req, ctx);
    expect(response.status).toBe(400);
  });

  it("returns 400 when no fields provided", async () => {
    const [req, ctx] = makeRequest({});
    const response = await PUT(req, ctx);
    expect(response.status).toBe(400);
  });

  it("returns 403 on Jira permission error", async () => {
    vi.mocked(jiraClient.updateSprint).mockRejectedValue(
      new JiraApiError(403, "Forbidden", "No permission", "/rest/agile/1.0/sprint/123"),
    );

    const [req, ctx] = makeRequest({ goal: "test" });
    const response = await PUT(req, ctx);
    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain("permissions");
  });

  it("returns 500 on generic Jira error", async () => {
    vi.mocked(jiraClient.updateSprint).mockRejectedValue(new Error("Network failure"));

    const [req, ctx] = makeRequest({ goal: "test" });
    const response = await PUT(req, ctx);
    expect(response.status).toBe(500);
  });

  it("surfaces Jira's validation message on a 400", async () => {
    vi.mocked(jiraClient.updateSprint).mockRejectedValue(
      new JiraApiError(
        400,
        "Bad Request",
        JSON.stringify({ errorMessages: [], errors: { name: "Sprint name is required" } }),
        "/rest/agile/1.0/sprint/123",
      ),
    );

    const [req, ctx] = makeRequest({ goal: "test" });
    const response = await PUT(req, ctx);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Sprint name is required");
  });
});
