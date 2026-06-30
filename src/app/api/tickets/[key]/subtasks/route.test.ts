// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createJiraClientMock } from "@/test/mocks";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, ticketSubtask } from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() { return testDb; },
}));

vi.mock("@/lib/jira-client", () => createJiraClientMock({
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
  return new Request(`http://localhost:3100/api/tickets/${key}/subtasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function seedTicket(key: string) {
  testDb.insert(ticket).values({
    jiraKey: key,
    title: `Ticket ${key}`,
    status: "TO DO",
  }).run();
}

describe("POST /api/tickets/[key]/subtasks", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
  });

  it("creates a subtask and returns it", async () => {
    seedTicket("VPL-100");
    const res = await POST(
      postRequest("VPL-100", { title: "Fix the bug" }),
      makeParams("VPL-100"),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.key).toBe("VPL-999");
    expect(data.title).toBe("Fix the bug");
    expect(data.type).toBe("subtask");
    expect(data.jiraStatus).toBe("TO DO");
  });

  it("inserts subtask into local database", async () => {
    seedTicket("VPL-100");
    await POST(
      postRequest("VPL-100", { title: "New subtask" }),
      makeParams("VPL-100"),
    );

    const rows = testDb.select().from(ticketSubtask).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].subtaskKey).toBe("VPL-999");
    expect(rows[0].ticketKey).toBe("VPL-100");
    expect(rows[0].title).toBe("New subtask");
  });

  it("calls Jira createIssue with parent key", async () => {
    seedTicket("VPL-100");
    const { jiraClient } = await import("@/lib/jira-client");

    await POST(
      postRequest("VPL-100", { title: "Sub task" }),
      makeParams("VPL-100"),
    );

    expect(jiraClient.createIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: "Sub task",
        parentKey: "VPL-100",
        projectKey: "VPL",
      }),
    );
  });

  it("returns 404 for non-existent ticket", async () => {
    const res = await POST(
      postRequest("VPL-999", { title: "Something" }),
      makeParams("VPL-999"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 for missing title", async () => {
    seedTicket("VPL-100");
    const res = await POST(
      postRequest("VPL-100", {}),
      makeParams("VPL-100"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty title", async () => {
    seedTicket("VPL-100");
    const res = await POST(
      postRequest("VPL-100", { title: "  " }),
      makeParams("VPL-100"),
    );
    expect(res.status).toBe(400);
  });
});
