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
    startSprint: vi.fn(),
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

function makeRequest(
  body: Record<string, unknown> | null = { endDate: "2026-06-18T17:00:00.000Z" },
  id = "123",
): [NextRequest, { params: Promise<{ id: string }> }] {
  const req = new NextRequest("http://localhost/api/jira/sprints/" + id + "/start", {
    method: "POST",
    body: body === null ? undefined : JSON.stringify(body),
  });
  return [req, { params: Promise.resolve({ id }) }];
}

describe("POST /api/jira/sprints/[id]/start", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.resetAllMocks();
  });

  it("starts the sprint and flips the cached state to active with the applied dates", async () => {
    vi.mocked(jiraClient.startSprint).mockResolvedValue({
      startDate: "2026-06-05T00:00:00.000Z",
      endDate: "2026-06-18T17:00:00.000Z",
    });

    const sprints = [
      { id: 123, name: "BT: 139", state: "future", startDate: "2026-06-05T00:00:00.000Z", endDate: null, completeDate: null, goal: null },
    ];
    testDb.insert(appSetting).values({ key: "jira_sprints", value: JSON.stringify(sprints) }).run();

    const [req, ctx] = makeRequest({ startDate: "2026-06-05T00:00:00.000Z", endDate: "2026-06-18T17:00:00.000Z" });
    const response = await POST(req, ctx);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.startDate).toBe("2026-06-05T00:00:00.000Z");

    expect(jiraClient.startSprint).toHaveBeenCalledWith(123, {
      startDate: "2026-06-05T00:00:00.000Z",
      endDate: "2026-06-18T17:00:00.000Z",
    });
    expect(cache.invalidate).toHaveBeenCalledWith("/api/jira/sprints");

    const row = testDb.select().from(appSetting).all().find((r) => r.key === "jira_sprints");
    const updated = JSON.parse(row!.value);
    expect(updated[0].state).toBe("active");
    expect(updated[0].endDate).toBe("2026-06-18T17:00:00.000Z");
  });

  it("forwards a null start date when none is provided", async () => {
    vi.mocked(jiraClient.startSprint).mockResolvedValue({
      startDate: "2026-06-08T10:00:00.000Z",
      endDate: "2026-06-18T17:00:00.000Z",
    });

    const [req, ctx] = makeRequest({ endDate: "2026-06-18T17:00:00.000Z" });
    await POST(req, ctx);

    expect(jiraClient.startSprint).toHaveBeenCalledWith(123, {
      startDate: null,
      endDate: "2026-06-18T17:00:00.000Z",
    });
  });

  it("returns 400 when no end date is supplied", async () => {
    const [req, ctx] = makeRequest({});
    const response = await POST(req, ctx);
    expect(response.status).toBe(400);
    expect(jiraClient.startSprint).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid sprint ID", async () => {
    const [req, ctx] = makeRequest({ endDate: "2026-06-18T17:00:00.000Z" }, "abc");
    const response = await POST(req, ctx);
    expect(response.status).toBe(400);
    expect(jiraClient.startSprint).not.toHaveBeenCalled();
  });

  it("returns 403 on a Jira permission error", async () => {
    vi.mocked(jiraClient.startSprint).mockRejectedValue(
      new JiraApiError(403, "Forbidden", "No permission", "/rest/agile/1.0/sprint/123"),
    );
    const [req, ctx] = makeRequest();
    const response = await POST(req, ctx);
    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain("permissions");
  });

  it("returns 500 on a generic Jira error", async () => {
    vi.mocked(jiraClient.startSprint).mockRejectedValue(new Error("Network failure"));
    const [req, ctx] = makeRequest();
    const response = await POST(req, ctx);
    expect(response.status).toBe(500);
  });
});
