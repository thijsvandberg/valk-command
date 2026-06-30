// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createJiraClientMock } from "@/test/mocks";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, jiraComment } from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

const mockAddComment = vi.fn();

vi.mock("@/lib/jira-client", () => createJiraClientMock({
  jiraClient: {
    get addComment() {
      return mockAddComment;
    },
  },
}));

vi.mock("@/lib/cache", () => ({
  cache: { invalidate: vi.fn() },
}));

vi.mock("@/lib/ticket-events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ticket-events")>()),
  emitTicketEvent: vi.fn(),
}));

import { POST } from "./route";
import { emitTicketEvent } from "@/lib/ticket-events";

function seedTicket(db: BetterSQLite3Database<typeof schema>, key: string) {
  db.insert(ticket).values({ jiraKey: key, title: `Ticket ${key}`, status: "TO DO" }).run();
}

function makeParams(key: string): { params: Promise<{ key: string }> } {
  return { params: Promise.resolve({ key }) };
}

function postRequest(key: string, body: unknown): Request {
  return new Request(`http://localhost:3100/api/tickets/${key}/jira-comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/tickets/[key]/jira-comments", () => {
  beforeEach(() => {
    testDb = createTestDb();
    mockAddComment.mockReset();
  });

  it("posts a comment to Jira and stores it locally", async () => {
    seedTicket(testDb, "VPL-100");
    mockAddComment.mockResolvedValue({
      id: "10001",
      author: {
        accountId: "abc",
        displayName: "Test User",
        avatarUrls: { "48x48": "https://avatar.example.com/48.png" },
      },
      body: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: "Hello from Bridge" }] }] },
      created: "2026-05-23T12:00:00.000Z",
      updated: "2026-05-23T12:00:00.000Z",
    });

    const res = await POST(
      postRequest("VPL-100", { content: "Hello from Bridge" }),
      makeParams("VPL-100"),
    );

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBe("jc-10001");
    expect(data.authorName).toBe("Test User");
    expect(data.authorInitials).toBe("TU");
    expect(data.createdAt).toBe("2026-05-23T12:00:00.000Z");

    expect(mockAddComment).toHaveBeenCalledWith("VPL-100", "Hello from Bridge");

    // Verify stored in local DB
    const stored = testDb.select().from(jiraComment).all();
    expect(stored).toHaveLength(1);
    expect(stored[0].ticketKey).toBe("VPL-100");
    expect(stored[0].jiraCommentId).toBe("10001");
  });

  it("emits a comment ticket event with the caller's origin", async () => {
    seedTicket(testDb, "VPL-100");
    mockAddComment.mockResolvedValue({
      id: "10002",
      author: { accountId: "abc", displayName: "Test User", avatarUrls: {} },
      body: "A comment",
      created: "2026-05-23T12:00:00.000Z",
      updated: "2026-05-23T12:00:00.000Z",
    });

    const req = new Request("http://localhost:3100/api/tickets/VPL-100/jira-comments", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-bridge-client": "tab-9" },
      body: JSON.stringify({ content: "A comment" }),
    });
    const res = await POST(req, makeParams("VPL-100"));

    expect(res.status).toBe(201);
    expect(emitTicketEvent).toHaveBeenCalledWith({ type: "ticket:changed", ticketKey: "VPL-100", kinds: ["comment"], origin: "tab-9" });
  });

  it("rejects empty content", async () => {
    const res = await POST(
      postRequest("VPL-100", { content: "" }),
      makeParams("VPL-100"),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("content");
  });

  it("rejects missing content", async () => {
    const res = await POST(
      postRequest("VPL-100", {}),
      makeParams("VPL-100"),
    );
    expect(res.status).toBe(400);
  });

  it("rejects content exceeding 10000 characters", async () => {
    const res = await POST(
      postRequest("VPL-100", { content: "x".repeat(10001) }),
      makeParams("VPL-100"),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("10000");
  });

  it("returns 503 when Jira is not configured", async () => {
    mockAddComment.mockRejectedValue(new Error("Jira is not configured"));

    const res = await POST(
      postRequest("VPL-100", { content: "Test" }),
      makeParams("VPL-100"),
    );
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toContain("not configured");
  });

  it("returns 502 when Jira API call fails", async () => {
    mockAddComment.mockRejectedValue(new Error("Network error"));

    const res = await POST(
      postRequest("VPL-100", { content: "Test" }),
      makeParams("VPL-100"),
    );
    expect(res.status).toBe(502);
  });

  it("rejects invalid JSON body", async () => {
    const req = new Request("http://localhost:3100/api/tickets/VPL-100/jira-comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req, makeParams("VPL-100"));
    expect(res.status).toBe(400);
  });
});
