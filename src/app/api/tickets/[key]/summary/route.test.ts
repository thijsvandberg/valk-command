// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createJiraClientMock } from "@/test/mocks";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket } from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/jira-client", () => createJiraClientMock({
  jiraClient: {
    updateIssue: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/cache", () => ({
  cache: {
    invalidate: vi.fn(),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { PUT } from "./route";
import { jiraClient } from "@/lib/jira-client";
import { cache } from "@/lib/cache";

function seedTicket(db: BetterSQLite3Database<typeof schema>, key: string) {
  db.insert(ticket)
    .values({
      jiraKey: key,
      title: `Ticket ${key}`,
      status: "TO DO",
    })
    .run();
}

function makeParams(key: string): { params: Promise<{ key: string }> } {
  return { params: Promise.resolve({ key }) };
}

function putRequest(key: string, body: unknown): Request {
  return new Request(`http://localhost:3100/api/tickets/${key}/summary`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PUT /api/tickets/[key]/summary", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
  });

  it("returns 400 for missing title", async () => {
    seedTicket(testDb, "BRDG-1");

    const response = await PUT(
      putRequest("BRDG-1", {}),
      makeParams("BRDG-1"),
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("title is required");
  });

  it("returns 400 for empty title", async () => {
    seedTicket(testDb, "BRDG-1");

    const response = await PUT(
      putRequest("BRDG-1", { title: "   " }),
      makeParams("BRDG-1"),
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("title is required");
  });

  it("returns 404 when ticket not found", async () => {
    const response = await PUT(
      putRequest("BRDG-999", { title: "New title" }),
      makeParams("BRDG-999"),
    );

    expect(response.status).toBe(404);
  });

  it("updates title and returns it", async () => {
    seedTicket(testDb, "BRDG-1");

    const response = await PUT(
      putRequest("BRDG-1", { title: "Updated title" }),
      makeParams("BRDG-1"),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.title).toBe("Updated title");
  });

  it("invalidates the epic detail when the renamed ticket belongs to an epic", async () => {
    testDb.insert(ticket).values({
      jiraKey: "BRDG-2",
      title: "Child of epic",
      status: "TO DO",
      epicKey: "BRDG-100",
    }).run();

    await PUT(putRequest("BRDG-2", { title: "Renamed" }), makeParams("BRDG-2"));

    expect(cache.invalidate).toHaveBeenCalledWith("/api/tickets/BRDG-100");
  });

  it("returns jiraWarning if Jira update fails", async () => {
    seedTicket(testDb, "BRDG-1");
    vi.mocked(jiraClient.updateIssue).mockRejectedValueOnce(
      new Error("Jira unavailable"),
    );

    const response = await PUT(
      putRequest("BRDG-1", { title: "New title" }),
      makeParams("BRDG-1"),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.title).toBe("New title");
    expect(data.jiraWarning).toBe("Jira update failed");
  });
});
