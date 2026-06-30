// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createJiraClientMock } from "@/test/mocks";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { seedTicket, seedConversation, seedStoryWriterSession } from "@/test/builders";
import { epicChildDraft, ticketLink } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/jira-client", () => createJiraClientMock({
  jiraClient: {
    createIssueLink: vi.fn().mockResolvedValue(undefined),
  },
}));

import { POST } from "./route";
import { jiraClient } from "@/lib/jira-client";

function makeParams(key: string): { params: Promise<{ key: string }> } {
  return { params: Promise.resolve({ key }) };
}

function postReq(key: string, body: Record<string, unknown>) {
  return new Request(`http://localhost:3100/api/epics/${key}/writer/link-children`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function seedEpicSession(key: string, sessionId: string) {
  seedTicket(testDb, { jiraKey: key, type: "epic", title: "Epic" });
  const conv = seedConversation(testDb, { id: `conv-${sessionId}` });
  seedStoryWriterSession(testDb, {
    id: sessionId,
    ticketKey: key,
    conversationId: conv.id,
    status: "active",
    mode: "epic",
    phase: "refine",
  });
}

function seedCard(sessionId: string, overrides: Partial<typeof epicChildDraft.$inferInsert>) {
  const data = {
    id: randomUUID(),
    sessionId,
    cardIndex: 0,
    title: "Story",
    bullets: [],
    body: null,
    status: "draft" as const,
    jiraKey: null,
    suggestedSprintId: null,
    suggestedLinks: [],
    ...overrides,
  };
  testDb.insert(epicChildDraft).values(data).run();
  return data;
}

describe("POST /api/epics/[key]/writer/link-children", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
    vi.mocked(jiraClient.createIssueLink).mockResolvedValue(undefined as never);
  });

  it("creates a Jira link and bidirectional local links between two created cards", async () => {
    seedEpicSession("VPL-E1", "sess-1");
    seedCard("sess-1", {
      cardIndex: 0,
      title: "A",
      status: "created",
      jiraKey: "VPL-301",
      suggestedLinks: [{ targetIndex: 1, relation: "blocks", confirmed: false }],
    });
    seedCard("sess-1", { cardIndex: 1, title: "B", status: "created", jiraKey: "VPL-302" });

    const res = await POST(
      postReq("VPL-E1", { sourceIndex: 0, targetIndex: 1, relation: "blocks" }),
      makeParams("VPL-E1"),
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(vi.mocked(jiraClient.createIssueLink)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(jiraClient.createIssueLink)).toHaveBeenCalledWith("VPL-301", "VPL-302", "Blocks");

    const forward = testDb
      .select()
      .from(ticketLink)
      .where(and(eq(ticketLink.ticketKey, "VPL-301"), eq(ticketLink.linkedKey, "VPL-302")))
      .get();
    expect(forward?.relation).toBe("blocks");

    const reverse = testDb
      .select()
      .from(ticketLink)
      .where(and(eq(ticketLink.ticketKey, "VPL-302"), eq(ticketLink.linkedKey, "VPL-301")))
      .get();
    expect(reverse?.relation).toBe("is blocked by");
  });

  it("marks the matching suggested link confirmed", async () => {
    seedEpicSession("VPL-E1", "sess-1");
    seedCard("sess-1", {
      cardIndex: 0,
      status: "created",
      jiraKey: "VPL-301",
      suggestedLinks: [
        { targetIndex: 1, relation: "blocks", confirmed: false },
        { targetIndex: 2, relation: "relates to", confirmed: false },
      ],
    });
    seedCard("sess-1", { cardIndex: 1, status: "created", jiraKey: "VPL-302" });

    await POST(
      postReq("VPL-E1", { sourceIndex: 0, targetIndex: 1, relation: "blocks" }),
      makeParams("VPL-E1"),
    );

    const card = testDb
      .select()
      .from(epicChildDraft)
      .where(and(eq(epicChildDraft.sessionId, "sess-1"), eq(epicChildDraft.cardIndex, 0)))
      .get();
    const links = card?.suggestedLinks as { targetIndex: number; relation: string; confirmed: boolean }[];
    expect(links.find((l) => l.targetIndex === 1)?.confirmed).toBe(true);
    // The unrelated suggestion is untouched.
    expect(links.find((l) => l.targetIndex === 2)?.confirmed).toBe(false);
  });

  it("409s when the source card is not yet created in Jira", async () => {
    seedEpicSession("VPL-E1", "sess-1");
    seedCard("sess-1", { cardIndex: 0, status: "draft" });
    seedCard("sess-1", { cardIndex: 1, status: "created", jiraKey: "VPL-302" });

    const res = await POST(
      postReq("VPL-E1", { sourceIndex: 0, targetIndex: 1, relation: "blocks" }),
      makeParams("VPL-E1"),
    );
    expect(res.status).toBe(409);
    expect(vi.mocked(jiraClient.createIssueLink)).not.toHaveBeenCalled();
  });

  it("409s when the target card is not yet created in Jira", async () => {
    seedEpicSession("VPL-E1", "sess-1");
    seedCard("sess-1", { cardIndex: 0, status: "created", jiraKey: "VPL-301" });
    seedCard("sess-1", { cardIndex: 1, status: "draft" });

    const res = await POST(
      postReq("VPL-E1", { sourceIndex: 0, targetIndex: 1, relation: "blocks" }),
      makeParams("VPL-E1"),
    );
    expect(res.status).toBe(409);
  });

  it("does not duplicate local links when confirmed twice", async () => {
    seedEpicSession("VPL-E1", "sess-1");
    seedCard("sess-1", {
      cardIndex: 0,
      status: "created",
      jiraKey: "VPL-301",
      suggestedLinks: [{ targetIndex: 1, relation: "relates to", confirmed: false }],
    });
    seedCard("sess-1", { cardIndex: 1, status: "created", jiraKey: "VPL-302" });

    const body = { sourceIndex: 0, targetIndex: 1, relation: "relates to" };
    await POST(postReq("VPL-E1", body), makeParams("VPL-E1"));
    await POST(postReq("VPL-E1", body), makeParams("VPL-E1"));

    const forward = testDb
      .select()
      .from(ticketLink)
      .where(and(eq(ticketLink.ticketKey, "VPL-301"), eq(ticketLink.linkedKey, "VPL-302")))
      .all();
    expect(forward.length).toBe(1);
  });

  it("400s when source and target are the same card", async () => {
    seedEpicSession("VPL-E1", "sess-1");
    const res = await POST(
      postReq("VPL-E1", { sourceIndex: 0, targetIndex: 0, relation: "blocks" }),
      makeParams("VPL-E1"),
    );
    expect(res.status).toBe(400);
  });

  it("404s when there is no active epic session", async () => {
    seedTicket(testDb, { jiraKey: "VPL-E1", type: "epic", title: "Epic" });
    const res = await POST(
      postReq("VPL-E1", { sourceIndex: 0, targetIndex: 1, relation: "blocks" }),
      makeParams("VPL-E1"),
    );
    expect(res.status).toBe(404);
  });
});
