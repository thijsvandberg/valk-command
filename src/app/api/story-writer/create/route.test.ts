// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, ticketMetadata } from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn().mockReturnValue(null) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));

vi.mock("@/lib/jira-client", () => ({
  jiraClient: {
    createIssue: vi.fn().mockResolvedValue({ key: "VPL-999" }),
  },
}));

import { POST } from "./route";
import { jiraClient } from "@/lib/jira-client";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost:3100/api/story-writer/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/story-writer/create", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
  });

  it("returns 400 when title is missing", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when title is blank", async () => {
    const res = await POST(makeRequest({ title: "   " }));
    expect(res.status).toBe(400);
  });

  it("creates Jira issue and returns 201 with key", async () => {
    const res = await POST(makeRequest({ title: "New story" }));
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.key).toBe("VPL-999");
    expect(vi.mocked(jiraClient.createIssue)).toHaveBeenCalled();
  });

  it("inserts local ticket and metadata with readiness=drafting", async () => {
    await POST(makeRequest({ title: "New story" }));

    const row = testDb.select().from(ticket).all();
    expect(row).toHaveLength(1);
    expect(row[0].jiraKey).toBe("VPL-999");
    expect(row[0].title).toBe("New story");
    expect(row[0].status).toBe("TO DO");

    const meta = testDb.select().from(ticketMetadata).all();
    expect(meta).toHaveLength(1);
    expect(meta[0].readiness).toBe("drafting");
  });

  it("defaults issueType to story", async () => {
    await POST(makeRequest({ title: "Test" }));

    const row = testDb.select().from(ticket).all();
    expect(row[0].type).toBe("story");
  });

  it("uses provided issueType", async () => {
    await POST(makeRequest({ title: "Test task", issueType: "task" }));

    const row = testDb.select().from(ticket).all();
    expect(row[0].type).toBe("task");
  });

  it("returns 502 when Jira creation fails", async () => {
    vi.mocked(jiraClient.createIssue).mockRejectedValueOnce(new Error("Jira down"));

    const res = await POST(makeRequest({ title: "Will fail" }));
    expect(res.status).toBe(502);
  });
});
