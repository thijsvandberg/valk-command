// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import {
  seedTicket,
  seedStoryWriterSession,
  seedConversation,
} from "@/test/builders";
import { ticketLink } from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn().mockReturnValue(null) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));

vi.mock("@/lib/draft-sync", () => ({
  resolveDraftKey: vi.fn((key: string) => key),
}));

vi.mock("@/lib/jira-client", () => ({
  jiraClient: {
    createIssue: vi.fn().mockResolvedValue({ key: "VPL-NEW" }),
  },
}));

import { POST } from "./route";
import { jiraClient } from "@/lib/jira-client";

function makeParams(key: string): { params: Promise<{ key: string }> } {
  return { params: Promise.resolve({ key }) };
}

function makeRequest(body?: unknown): Request {
  return new Request("http://localhost:3100/api/tickets/VPL-100/story-writer/split", {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("POST /api/tickets/[key]/story-writer/split", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
    vi.mocked(jiraClient.createIssue).mockResolvedValue({ key: "VPL-NEW" } as never);
  });

  it("returns 404 when no active session exists", async () => {
    seedTicket(testDb, { jiraKey: "VPL-100" });

    const res = await POST(makeRequest(), makeParams("VPL-100"));
    expect(res.status).toBe(404);
  });

  it("creates new Jira story and bidirectional links", async () => {
    seedTicket(testDb, { jiraKey: "VPL-100", title: "Original story" });
    const conv = seedConversation(testDb, { id: "conv-split" });
    seedStoryWriterSession(testDb, {
      id: "sess-split",
      ticketKey: "VPL-100",
      conversationId: conv.id,
      status: "active",
    });

    const res = await POST(makeRequest(), makeParams("VPL-100"));
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.targetTicketKey).toBe("VPL-NEW");

    const links = testDb.select().from(ticketLink).all();
    expect(links).toHaveLength(2);

    const forward = links.find((l) => l.ticketKey === "VPL-100" && l.linkedKey === "VPL-NEW");
    const reverse = links.find((l) => l.ticketKey === "VPL-NEW" && l.linkedKey === "VPL-100");
    expect(forward?.relation).toBe("split to");
    expect(reverse?.relation).toBe("is split from");
  });

  it("links to existing target when targetKey provided", async () => {
    seedTicket(testDb, { jiraKey: "VPL-100", title: "Original" });
    seedTicket(testDb, { jiraKey: "VPL-200", title: "Existing target" });
    const conv = seedConversation(testDb, { id: "conv-split" });
    seedStoryWriterSession(testDb, {
      id: "sess-split",
      ticketKey: "VPL-100",
      conversationId: conv.id,
      status: "active",
    });

    const res = await POST(makeRequest({ targetKey: "VPL-200" }), makeParams("VPL-100"));
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.targetTicketKey).toBe("VPL-200");
    expect(vi.mocked(jiraClient.createIssue)).not.toHaveBeenCalled();
  });

  it("returns 404 when targetKey not found locally", async () => {
    seedTicket(testDb, { jiraKey: "VPL-100" });
    const conv = seedConversation(testDb, { id: "conv-split" });
    seedStoryWriterSession(testDb, {
      id: "sess-split",
      ticketKey: "VPL-100",
      conversationId: conv.id,
      status: "active",
    });

    const res = await POST(makeRequest({ targetKey: "VPL-NOPE" }), makeParams("VPL-100"));
    expect(res.status).toBe(404);
  });

  it("returns 502 when Jira create fails", async () => {
    seedTicket(testDb, { jiraKey: "VPL-100" });
    const conv = seedConversation(testDb, { id: "conv-split" });
    seedStoryWriterSession(testDb, {
      id: "sess-split",
      ticketKey: "VPL-100",
      conversationId: conv.id,
      status: "active",
    });

    vi.mocked(jiraClient.createIssue).mockRejectedValueOnce(new Error("Jira down"));

    const res = await POST(makeRequest(), makeParams("VPL-100"));
    expect(res.status).toBe(502);
  });
});
