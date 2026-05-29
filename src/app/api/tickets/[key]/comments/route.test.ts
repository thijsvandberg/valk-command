// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { seedTicket } from "@/test/builders";
import { jiraComment } from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import { GET, POST } from "./route";

function makeParams(key: string): { params: Promise<{ key: string }> } {
  return { params: Promise.resolve({ key }) };
}

function postRequest(key: string, body: unknown): Request {
  return new Request(`http://localhost:3100/api/tickets/${key}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getRequest(key: string): Request {
  return new Request(`http://localhost:3100/api/tickets/${key}/comments`);
}

describe("GET /api/tickets/[key]/comments", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns empty arrays when no comments exist", async () => {
    const res = await GET(getRequest("VPL-100"), makeParams("VPL-100"));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.poComments).toEqual([]);
    expect(data.jiraComments).toEqual([]);
  });
});

describe("POST /api/tickets/[key]/comments", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("creates a PO comment", async () => {
    seedTicket(testDb, { jiraKey: "VPL-100" });
    const res = await POST(
      postRequest("VPL-100", { content: "Test comment" }),
      makeParams("VPL-100"),
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.content).toBe("Test comment");
    expect(data.ticketKey).toBe("VPL-100");
    expect(data.author).toBe("Product Owner");
  });

  it("rejects empty content", async () => {
    const res = await POST(
      postRequest("VPL-100", { content: "" }),
      makeParams("VPL-100"),
    );
    expect(res.status).toBe(400);
  });

  it("rejects missing content", async () => {
    const res = await POST(
      postRequest("VPL-100", {}),
      makeParams("VPL-100"),
    );
    expect(res.status).toBe(400);
  });

  it("comment appears in GET response", async () => {
    seedTicket(testDb, { jiraKey: "VPL-100" });
    await POST(
      postRequest("VPL-100", { content: "First comment" }),
      makeParams("VPL-100"),
    );

    const res = await GET(getRequest("VPL-100"), makeParams("VPL-100"));
    const data = await res.json();
    expect(data.poComments).toHaveLength(1);
    expect(data.poComments[0].content).toBe("First comment");
  });

  it("rejects content exceeding 10000 characters", async () => {
    seedTicket(testDb, { jiraKey: "VPL-100" });
    const longContent = "x".repeat(10001);
    const res = await POST(
      postRequest("VPL-100", { content: longContent }),
      makeParams("VPL-100"),
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/tickets/[key]/comments (with Jira comments)", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns both PO and Jira comments", async () => {
    seedTicket(testDb, { jiraKey: "VPL-100" });

    // Seed a Jira comment directly
    testDb.insert(jiraComment).values({
      id: "jc-1",
      ticketKey: "VPL-100",
      jiraCommentId: "12345",
      authorName: "Alice",
      content: "Jira comment content",
      createdAt: "2026-01-01T00:00:00Z",
    }).run();

    // Create a PO comment via the route
    await POST(
      postRequest("VPL-100", { content: "PO comment" }),
      makeParams("VPL-100"),
    );

    const res = await GET(getRequest("VPL-100"), makeParams("VPL-100"));
    const data = await res.json();
    expect(data.poComments).toHaveLength(1);
    expect(data.jiraComments).toHaveLength(1);
    expect(data.jiraComments[0].content).toBe("Jira comment content");
  });
});
