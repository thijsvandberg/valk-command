// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createJiraClientMock } from "@/test/mocks";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, ticketSubtask } from "@/db/schema";
import { randomUUID } from "crypto";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() { return testDb; },
}));

const mockUpdateIssue = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/jira-client", () => createJiraClientMock({
  jiraClient: {
    get updateIssue() { return mockUpdateIssue; },
  },
}));

vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/cache", () => ({
  cache: { invalidate: vi.fn() },
}));

import { PATCH, DELETE } from "./route";

function makeParams(key: string, subtaskKey: string) {
  return { params: Promise.resolve({ key, subtaskKey }) };
}

function patchRequest(key: string, subtaskKey: string, body: unknown): Request {
  return new Request(
    `http://localhost:3100/api/tickets/${key}/subtasks/${subtaskKey}`,
    { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
  );
}

function deleteRequest(key: string, subtaskKey: string): Request {
  return new Request(
    `http://localhost:3100/api/tickets/${key}/subtasks/${subtaskKey}`,
    { method: "DELETE" },
  );
}

function seedTicketWithSubtask(parentKey: string, subtaskKey: string, title: string) {
  testDb.insert(ticket).values({
    jiraKey: parentKey,
    title: `Ticket ${parentKey}`,
    status: "TO DO",
  }).run();
  testDb.insert(ticketSubtask).values({
    id: randomUUID(),
    ticketKey: parentKey,
    subtaskKey,
    title,
    type: "subtask",
    status: "TO DO",
    assignee: null,
    assigneeAvatar: null,
  }).run();
}

describe("PATCH /api/tickets/[key]/subtasks/[subtaskKey]", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
  });

  it("renames a subtask and returns updated data", async () => {
    seedTicketWithSubtask("VPL-100", "VPL-101", "Old title");
    const res = await PATCH(
      patchRequest("VPL-100", "VPL-101", { title: "New title" }),
      makeParams("VPL-100", "VPL-101"),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.key).toBe("VPL-101");
    expect(data.title).toBe("New title");
  });

  it("updates the local database", async () => {
    seedTicketWithSubtask("VPL-100", "VPL-101", "Old title");
    await PATCH(
      patchRequest("VPL-100", "VPL-101", { title: "Updated" }),
      makeParams("VPL-100", "VPL-101"),
    );
    const rows = testDb.select().from(ticketSubtask).all();
    expect(rows[0].title).toBe("Updated");
  });

  it("calls jiraClient.updateIssue with summary", async () => {
    seedTicketWithSubtask("VPL-100", "VPL-101", "Old title");
    await PATCH(
      patchRequest("VPL-100", "VPL-101", { title: "Renamed" }),
      makeParams("VPL-100", "VPL-101"),
    );
    expect(mockUpdateIssue).toHaveBeenCalledWith("VPL-101", { summary: "Renamed" });
  });

  it("returns 400 for missing title", async () => {
    const res = await PATCH(
      patchRequest("VPL-100", "VPL-101", {}),
      makeParams("VPL-100", "VPL-101"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty title", async () => {
    const res = await PATCH(
      patchRequest("VPL-100", "VPL-101", { title: "   " }),
      makeParams("VPL-100", "VPL-101"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for title exceeding 255 chars", async () => {
    const res = await PATCH(
      patchRequest("VPL-100", "VPL-101", { title: "a".repeat(256) }),
      makeParams("VPL-100", "VPL-101"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 502 on Jira failure", async () => {
    seedTicketWithSubtask("VPL-100", "VPL-101", "Old title");
    mockUpdateIssue.mockRejectedValueOnce(new Error("Jira down"));
    const res = await PATCH(
      patchRequest("VPL-100", "VPL-101", { title: "New title" }),
      makeParams("VPL-100", "VPL-101"),
    );
    expect(res.status).toBe(502);
  });
});

describe("DELETE /api/tickets/[key]/subtasks/[subtaskKey]", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
  });

  it("deletes the subtask and returns ok", async () => {
    seedTicketWithSubtask("VPL-100", "VPL-101", "To delete");
    const res = await DELETE(
      deleteRequest("VPL-100", "VPL-101"),
      makeParams("VPL-100", "VPL-101"),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it("removes the subtask from the local database", async () => {
    seedTicketWithSubtask("VPL-100", "VPL-101", "To delete");
    await DELETE(
      deleteRequest("VPL-100", "VPL-101"),
      makeParams("VPL-100", "VPL-101"),
    );
    const rows = testDb.select().from(ticketSubtask).all();
    expect(rows).toHaveLength(0);
  });

  it("calls jiraClient.updateIssue with deleteme summary", async () => {
    seedTicketWithSubtask("VPL-100", "VPL-101", "To delete");
    await DELETE(
      deleteRequest("VPL-100", "VPL-101"),
      makeParams("VPL-100", "VPL-101"),
    );
    expect(mockUpdateIssue).toHaveBeenCalledWith("VPL-101", { summary: "deleteme" });
  });

  it("returns 502 on Jira failure", async () => {
    seedTicketWithSubtask("VPL-100", "VPL-101", "To delete");
    mockUpdateIssue.mockRejectedValueOnce(new Error("Jira down"));
    const res = await DELETE(
      deleteRequest("VPL-100", "VPL-101"),
      makeParams("VPL-100", "VPL-101"),
    );
    expect(res.status).toBe(502);
  });
});
