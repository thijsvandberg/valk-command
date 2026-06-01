// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { seedTicket } from "@/test/builders";
import { ticketSubtask } from "@/db/schema";
import { eq } from "drizzle-orm";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn().mockReturnValue(null) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/cache", () => ({ cache: { get: vi.fn(), set: vi.fn(), invalidate: vi.fn() } }));
vi.mock("@/lib/sync-jira-timestamp", () => ({ syncJiraTimestamp: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));

vi.mock("@/lib/jira-client", () => ({
  jiraClient: {
    transitionIssue: vi.fn().mockResolvedValue(undefined),
  },
}));

import { POST } from "./route";
import { jiraClient } from "@/lib/jira-client";

function makeParams(key: string, subtaskKey: string): { params: Promise<{ key: string; subtaskKey: string }> } {
  return { params: Promise.resolve({ key, subtaskKey }) };
}

function makeRequest(): Request {
  return new Request("http://localhost:3100/api/tickets/VPL-100/subtasks/VPL-101/close", {
    method: "POST",
  });
}

describe("POST /api/tickets/[key]/subtasks/[subtaskKey]/close", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
  });

  it("returns 404 when subtask not found", async () => {
    const res = await POST(makeRequest(), makeParams("VPL-100", "VPL-101"));
    expect(res.status).toBe(404);
  });

  it("transitions the subtask to DONE and updates the DB", async () => {
    seedTicket(testDb, { jiraKey: "VPL-100", status: "DONE" });
    testDb.insert(ticketSubtask).values({
      id: "sub-1", ticketKey: "VPL-100", subtaskKey: "VPL-101", title: "Sub 1", status: "IN PROGRESS",
    }).run();

    const res = await POST(makeRequest(), makeParams("VPL-100", "VPL-101"));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);

    expect(jiraClient.transitionIssue).toHaveBeenCalledWith("VPL-101", "DONE");

    const sub = testDb.select().from(ticketSubtask).where(eq(ticketSubtask.id, "sub-1")).get();
    expect(sub?.status).toBe("DONE");
  });

  it("returns 502 and leaves the DB unchanged when the Jira transition fails", async () => {
    seedTicket(testDb, { jiraKey: "VPL-100", status: "DONE" });
    testDb.insert(ticketSubtask).values({
      id: "sub-1", ticketKey: "VPL-100", subtaskKey: "VPL-101", title: "Sub 1", status: "IN PROGRESS",
    }).run();

    vi.mocked(jiraClient.transitionIssue).mockRejectedValueOnce(new Error("Jira down"));

    const res = await POST(makeRequest(), makeParams("VPL-100", "VPL-101"));
    expect(res.status).toBe(502);

    const sub = testDb.select().from(ticketSubtask).where(eq(ticketSubtask.id, "sub-1")).get();
    expect(sub?.status).toBe("IN PROGRESS");
  });
});
