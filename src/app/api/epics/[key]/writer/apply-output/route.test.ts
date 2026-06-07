// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { seedTicket, seedConversation, seedStoryWriterSession } from "@/test/builders";
import { epicChildDraft } from "@/db/schema";
import { eq } from "drizzle-orm";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));

import { POST } from "./route";

function makeParams(key: string): { params: Promise<{ key: string }> } {
  return { params: Promise.resolve({ key }) };
}

function postReq(key: string, body: Record<string, unknown>) {
  return new Request(`http://localhost:3100/api/epics/${key}/writer/apply-output`, {
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
    phase: "breakdown",
  });
}

describe("POST /api/epics/[key]/writer/apply-output", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("persists parsed breakdown cards into epic_child_draft", async () => {
    seedEpicSession("VPL-E1", "sess-1");

    const output =
      `<epic-breakdown>[` +
      `{"title":"Cart summary","bullets":["Show items","Show total"],"suggestedSprintId":7},` +
      `{"title":"Coupon flow","bullets":["Apply coupon"]}` +
      `]</epic-breakdown>`;

    const res = await POST(postReq("VPL-E1", { output, taskId: "t1" }), makeParams("VPL-E1"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.applied).toBe(true);
    expect(data.cardCount).toBe(2);

    const cards = testDb
      .select()
      .from(epicChildDraft)
      .where(eq(epicChildDraft.sessionId, "sess-1"))
      .orderBy(epicChildDraft.cardIndex)
      .all();
    expect(cards).toHaveLength(2);
    expect(cards[0].title).toBe("Cart summary");
    expect(cards[0].bullets).toEqual(["Show items", "Show total"]);
    expect(cards[0].cardIndex).toBe(0);
    expect(cards[0].status).toBe("draft");
    expect(cards[0].suggestedSprintId).toBe("7");
    expect(cards[1].title).toBe("Coupon flow");
  });

  it("reports questions without persisting cards when only <epic-questions> present", async () => {
    seedEpicSession("VPL-E2", "sess-2");

    const output = "<epic-questions>\n- Who?\n- What?\n</epic-questions>";
    const res = await POST(postReq("VPL-E2", { output }), makeParams("VPL-E2"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.hasQuestions).toBe(true);
    expect(data.applied).toBe(false);

    const cards = testDb.select().from(epicChildDraft).all();
    expect(cards).toHaveLength(0);
  });

  it("replaces the prior breakdown wholesale on a new turn", async () => {
    seedEpicSession("VPL-E3", "sess-3");

    await POST(
      postReq("VPL-E3", { output: `<epic-breakdown>[{"title":"Old A"},{"title":"Old B"},{"title":"Old C"}]</epic-breakdown>` }),
      makeParams("VPL-E3"),
    );
    await POST(
      postReq("VPL-E3", { output: `<epic-breakdown>[{"title":"New A"}]</epic-breakdown>` }),
      makeParams("VPL-E3"),
    );

    const cards = testDb
      .select()
      .from(epicChildDraft)
      .where(eq(epicChildDraft.sessionId, "sess-3"))
      .all();
    expect(cards).toHaveLength(1);
    expect(cards[0].title).toBe("New A");
  });

  it("preserves a created card's Jira key by index across a re-parse", async () => {
    seedEpicSession("VPL-E4", "sess-4");

    await POST(
      postReq("VPL-E4", { output: `<epic-breakdown>[{"title":"Will be created"},{"title":"Stays draft"}]</epic-breakdown>` }),
      makeParams("VPL-E4"),
    );

    // Simulate Create-in-Jira on card 0 (a later story does this for real).
    testDb
      .update(epicChildDraft)
      .set({ status: "created", jiraKey: "VPL-500" })
      .where(eq(epicChildDraft.cardIndex, 0))
      .run();

    await POST(
      postReq("VPL-E4", { output: `<epic-breakdown>[{"title":"Will be created (refined)"},{"title":"Stays draft"}]</epic-breakdown>` }),
      makeParams("VPL-E4"),
    );

    const cards = testDb
      .select()
      .from(epicChildDraft)
      .where(eq(epicChildDraft.sessionId, "sess-4"))
      .orderBy(epicChildDraft.cardIndex)
      .all();
    expect(cards[0].status).toBe("created");
    expect(cards[0].jiraKey).toBe("VPL-500");
    expect(cards[0].title).toBe("Will be created (refined)");
    expect(cards[1].status).toBe("draft");
  });

  it("leaves cards untouched when output has no parseable breakdown", async () => {
    seedEpicSession("VPL-E5", "sess-5");
    await POST(
      postReq("VPL-E5", { output: `<epic-breakdown>[{"title":"Keep"}]</epic-breakdown>` }),
      makeParams("VPL-E5"),
    );

    const res = await POST(postReq("VPL-E5", { output: "just chatting, no tags" }), makeParams("VPL-E5"));
    const data = await res.json();
    expect(data.applied).toBe(false);

    const cards = testDb.select().from(epicChildDraft).all();
    expect(cards).toHaveLength(1);
    expect(cards[0].title).toBe("Keep");
  });

  it("returns 404 when there is no active epic session", async () => {
    const res = await POST(postReq("VPL-NONE", { output: "x" }), makeParams("VPL-NONE"));
    expect(res.status).toBe(404);
  });
});
