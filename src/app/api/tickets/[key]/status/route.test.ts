import { describe, it, expect, vi, beforeEach } from "vitest";
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

vi.mock("@/lib/jira-client", () => ({
  jiraClient: {
    transitionIssue: vi.fn().mockResolvedValue(undefined),
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
  return new Request(`http://localhost:3100/api/tickets/${key}/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PUT /api/tickets/[key]/status", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
  });

  it("returns 400 for missing status", async () => {
    seedTicket(testDb, "BRDG-1");

    const response = await PUT(
      putRequest("BRDG-1", {}),
      makeParams("BRDG-1"),
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBeDefined();
  });

  it("returns 400 for invalid status value", async () => {
    seedTicket(testDb, "BRDG-1");

    const response = await PUT(
      putRequest("BRDG-1", { status: "INVALID" }),
      makeParams("BRDG-1"),
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("status must be one of");
  });

  it("returns 404 when ticket not found", async () => {
    const response = await PUT(
      putRequest("BRDG-999", { status: "DONE" }),
      makeParams("BRDG-999"),
    );

    expect(response.status).toBe(404);
  });

  it("updates status and returns it", async () => {
    seedTicket(testDb, "BRDG-1");

    const response = await PUT(
      putRequest("BRDG-1", { status: "IN PROGRESS" }),
      makeParams("BRDG-1"),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("IN PROGRESS");
  });

  it("returns jiraWarning if Jira transition fails", async () => {
    seedTicket(testDb, "BRDG-1");
    vi.mocked(jiraClient.transitionIssue).mockRejectedValueOnce(
      new Error("Jira unavailable"),
    );

    const response = await PUT(
      putRequest("BRDG-1", { status: "DONE" }),
      makeParams("BRDG-1"),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("DONE");
    expect(data.jiraWarning).toBe("Jira update failed");
  });
});
