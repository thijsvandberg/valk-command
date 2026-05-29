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

function makeParams(key: string): { params: Promise<{ key: string }> } {
  return { params: Promise.resolve({ key }) };
}

function makeRequest(): Request {
  return new Request("http://localhost:3100/api/tickets/VPL-100/subtasks/close", {
    method: "POST",
  });
}

describe("POST /api/tickets/[key]/subtasks/close", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
  });

  it("returns 404 when parent ticket not found", async () => {
    const res = await POST(makeRequest(), makeParams("VPL-MISSING"));
    expect(res.status).toBe(404);
  });

  it("returns 400 when parent is not DONE or DEPRECATED", async () => {
    seedTicket(testDb, { jiraKey: "VPL-100", status: "IN PROGRESS" });

    const res = await POST(makeRequest(), makeParams("VPL-100"));
    expect(res.status).toBe(400);
  });

  it("returns closed: 0 when no open subtasks", async () => {
    seedTicket(testDb, { jiraKey: "VPL-100", status: "DONE" });

    const res = await POST(makeRequest(), makeParams("VPL-100"));
    const data = await res.json();
    expect(data.closed).toBe(0);
  });

  it("closes open subtasks and returns results", async () => {
    seedTicket(testDb, { jiraKey: "VPL-100", status: "DONE" });
    testDb.insert(ticketSubtask).values([
      { id: "sub-1", ticketKey: "VPL-100", subtaskKey: "VPL-101", title: "Sub 1", status: "IN PROGRESS" },
      { id: "sub-2", ticketKey: "VPL-100", subtaskKey: "VPL-102", title: "Sub 2", status: "TO DO" },
      { id: "sub-3", ticketKey: "VPL-100", subtaskKey: "VPL-103", title: "Sub 3", status: "DONE" },
    ]).run();

    const res = await POST(makeRequest(), makeParams("VPL-100"));
    const data = await res.json();
    expect(data.closed).toBe(2);
    expect(data.results).toHaveLength(2);
    expect(data.results.every((r: { success: boolean }) => r.success)).toBe(true);

    const subs = testDb.select().from(ticketSubtask).where(eq(ticketSubtask.ticketKey, "VPL-100")).all();
    expect(subs.every((s) => s.status === "DONE")).toBe(true);
  });

  it("marks failed transitions but still updates DB", async () => {
    seedTicket(testDb, { jiraKey: "VPL-100", status: "DONE" });
    testDb.insert(ticketSubtask).values({
      id: "sub-1", ticketKey: "VPL-100", subtaskKey: "VPL-101", title: "Sub 1", status: "IN PROGRESS",
    }).run();

    vi.mocked(jiraClient.transitionIssue).mockRejectedValueOnce(new Error("Jira down"));

    const res = await POST(makeRequest(), makeParams("VPL-100"));
    const data = await res.json();
    expect(data.closed).toBe(1);
    expect(data.results[0].success).toBe(false);
    expect(data.results[0].error).toBeDefined();

    const sub = testDb.select().from(ticketSubtask).where(eq(ticketSubtask.id, "sub-1")).get();
    expect(sub?.status).toBe("DONE");
  });
});
