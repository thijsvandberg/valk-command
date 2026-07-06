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

const updateTicketFields = vi.fn().mockResolvedValue({ epicKey: "VPL-E1" });
vi.mock("@/lib/ticket-detail-builder", () => ({
  updateTicketFields: (...args: unknown[]) => updateTicketFields(...args),
}));

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
    vi.clearAllMocks();
    updateTicketFields.mockResolvedValue({ epicKey: "VPL-E1" });
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

  it("re-parents an existingKey story and records it as a created card (BRDG-487)", async () => {
    seedEpicSession("VPL-E1", "sess-1");
    seedTicket(testDb, { jiraKey: "VPL-100", type: "story", title: "Existing", epicKey: null });

    const output =
      `<epic-breakdown>[` +
      `{"title":"Brand new","bullets":["x"]},` +
      `{"title":"Existing","bullets":[],"existingKey":"VPL-100"}` +
      `]</epic-breakdown>`;
    const res = await POST(postReq("VPL-E1", { output, taskId: "t" }), makeParams("VPL-E1"));
    expect(res.status).toBe(200);
    expect(updateTicketFields).toHaveBeenCalledWith("VPL-100", { epicKey: "VPL-E1" });

    const cards = testDb
      .select()
      .from(epicChildDraft)
      .where(eq(epicChildDraft.sessionId, "sess-1"))
      .orderBy(epicChildDraft.cardIndex)
      .all();
    expect(cards[0].status).toBe("draft"); // plain generated card
    expect(cards[1].status).toBe("created"); // re-parented existing story
    expect(cards[1].jiraKey).toBe("VPL-100");
  });

  it("does not re-parent an existingKey already under this epic (BRDG-487)", async () => {
    seedEpicSession("VPL-E1", "sess-1");
    seedTicket(testDb, { jiraKey: "VPL-100", type: "story", title: "Existing", epicKey: "VPL-E1" });

    const output = `<epic-breakdown>[{"title":"Existing","bullets":[],"existingKey":"VPL-100"}]</epic-breakdown>`;
    await POST(postReq("VPL-E1", { output, taskId: "t" }), makeParams("VPL-E1"));

    expect(updateTicketFields).not.toHaveBeenCalled();
    const cards = testDb.select().from(epicChildDraft).where(eq(epicChildDraft.sessionId, "sess-1")).all();
    expect(cards[0].status).toBe("created");
    expect(cards[0].jiraKey).toBe("VPL-100");
  });

  it("leaves an existingKey card as a draft when the ticket does not exist (BRDG-487)", async () => {
    seedEpicSession("VPL-E1", "sess-1");
    const output = `<epic-breakdown>[{"title":"Ghost","bullets":[],"existingKey":"VPL-999"}]</epic-breakdown>`;
    await POST(postReq("VPL-E1", { output, taskId: "t" }), makeParams("VPL-E1"));

    expect(updateTicketFields).not.toHaveBeenCalled();
    const cards = testDb.select().from(epicChildDraft).where(eq(epicChildDraft.sessionId, "sess-1")).all();
    expect(cards[0].status).toBe("draft");
    expect(cards[0].jiraKey).toBeNull();
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

  it("fills a card's body from a <story-detail> deepen turn without a breakdown", async () => {
    seedEpicSession("VPL-D1", "sess-d1");
    await POST(
      postReq("VPL-D1", { output: `<epic-breakdown>[{"title":"A"},{"title":"B"}]</epic-breakdown>` }),
      makeParams("VPL-D1"),
    );

    const res = await POST(
      postReq("VPL-D1", { output: `<story-detail index="1">## Description\nWorked out B.</story-detail>` }),
      makeParams("VPL-D1"),
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.applied).toBe(true);
    expect(data.detailedCount).toBe(1);
    // No breakdown block in this turn: the card set is left intact.
    expect(data.cardCount).toBe(0);

    const cards = testDb
      .select()
      .from(epicChildDraft)
      .where(eq(epicChildDraft.sessionId, "sess-d1"))
      .orderBy(epicChildDraft.cardIndex)
      .all();
    expect(cards).toHaveLength(2);
    expect(cards[0].body).toBeNull();
    expect(cards[1].body).toBe("## Description\nWorked out B.");
  });

  it("ignores a detail block for an index with no card", async () => {
    seedEpicSession("VPL-D2", "sess-d2");
    await POST(
      postReq("VPL-D2", { output: `<epic-breakdown>[{"title":"Only A"}]</epic-breakdown>` }),
      makeParams("VPL-D2"),
    );

    const res = await POST(
      postReq("VPL-D2", { output: `<story-detail index="9">orphan body</story-detail>` }),
      makeParams("VPL-D2"),
    );
    const data = await res.json();
    // No applicable detail and no breakdown: nothing applied.
    expect(data.applied).toBe(false);
    expect(data.detailedCount).toBe(0);

    const cards = testDb.select().from(epicChildDraft).all();
    expect(cards).toHaveLength(1);
    expect(cards[0].body).toBeNull();
  });

  it("applies detail bodies alongside a re-emitted breakdown in the same turn", async () => {
    seedEpicSession("VPL-D3", "sess-d3");
    await POST(
      postReq("VPL-D3", { output: `<epic-breakdown>[{"title":"A"},{"title":"B"}]</epic-breakdown>` }),
      makeParams("VPL-D3"),
    );

    const output =
      `<epic-breakdown>[{"title":"A"},{"title":"B"}]</epic-breakdown>` +
      `<story-detail index="0">Body for A</story-detail>`;
    const res = await POST(postReq("VPL-D3", { output }), makeParams("VPL-D3"));
    const data = await res.json();
    expect(data.applied).toBe(true);
    expect(data.cardCount).toBe(2);
    expect(data.detailedCount).toBe(1);

    const cards = testDb
      .select()
      .from(epicChildDraft)
      .where(eq(epicChildDraft.sessionId, "sess-d3"))
      .orderBy(epicChildDraft.cardIndex)
      .all();
    expect(cards[0].body).toBe("Body for A");
    expect(cards[1].body).toBeNull();
  });

  it("preserves a detailed body across a later breakdown that omits it", async () => {
    seedEpicSession("VPL-D4", "sess-d4");
    await POST(
      postReq("VPL-D4", { output: `<epic-breakdown>[{"title":"A"}]</epic-breakdown>` }),
      makeParams("VPL-D4"),
    );
    await POST(
      postReq("VPL-D4", { output: `<story-detail index="0">Detailed A</story-detail>` }),
      makeParams("VPL-D4"),
    );

    // A later breakdown turn that re-emits the card without a body must keep the
    // previously detailed body (depth must not regress on a refine).
    await POST(
      postReq("VPL-D4", { output: `<epic-breakdown>[{"title":"A refined"}]</epic-breakdown>` }),
      makeParams("VPL-D4"),
    );

    const cards = testDb
      .select()
      .from(epicChildDraft)
      .where(eq(epicChildDraft.sessionId, "sess-d4"))
      .all();
    expect(cards[0].title).toBe("A refined");
    expect(cards[0].body).toBe("Detailed A");
  });

  it("pre-fills suggestedSprintId from a <sprint-plan> turn without a breakdown", async () => {
    seedEpicSession("VPL-S1", "sess-s1");
    await POST(
      postReq("VPL-S1", { output: `<epic-breakdown>[{"title":"A"},{"title":"B"}]</epic-breakdown>` }),
      makeParams("VPL-S1"),
    );

    const res = await POST(
      postReq("VPL-S1", { output: `<sprint-plan>[{"index":0,"sprintId":"42"},{"index":1,"sprintId":"__backlog__"}]</sprint-plan>` }),
      makeParams("VPL-S1"),
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.applied).toBe(true);
    expect(data.plannedCount).toBe(2);
    expect(data.cardCount).toBe(0);

    const cards = testDb
      .select()
      .from(epicChildDraft)
      .where(eq(epicChildDraft.sessionId, "sess-s1"))
      .orderBy(epicChildDraft.cardIndex)
      .all();
    expect(cards[0].suggestedSprintId).toBe("42");
    expect(cards[1].suggestedSprintId).toBe("__backlog__");
  });

  it("ignores a sprint-plan entry for an index with no card", async () => {
    seedEpicSession("VPL-S2", "sess-s2");
    await POST(
      postReq("VPL-S2", { output: `<epic-breakdown>[{"title":"Only A"}]</epic-breakdown>` }),
      makeParams("VPL-S2"),
    );

    const res = await POST(
      postReq("VPL-S2", { output: `<sprint-plan>[{"index":9,"sprintId":"42"}]</sprint-plan>` }),
      makeParams("VPL-S2"),
    );
    const data = await res.json();
    expect(data.applied).toBe(false);
    expect(data.plannedCount).toBe(0);

    const cards = testDb.select().from(epicChildDraft).all();
    expect(cards[0].suggestedSprintId).toBeNull();
  });

  it("lets a same-turn sprint-plan win over the breakdown card's own suggestion", async () => {
    seedEpicSession("VPL-S3", "sess-s3");
    const output =
      `<epic-breakdown>[{"title":"A","suggestedSprintId":"10"}]</epic-breakdown>` +
      `<sprint-plan>[{"index":0,"sprintId":"42"}]</sprint-plan>`;
    const res = await POST(postReq("VPL-S3", { output }), makeParams("VPL-S3"));
    const data = await res.json();
    expect(data.cardCount).toBe(1);
    expect(data.plannedCount).toBe(1);

    const cards = testDb
      .select()
      .from(epicChildDraft)
      .where(eq(epicChildDraft.sessionId, "sess-s3"))
      .all();
    expect(cards[0].suggestedSprintId).toBe("42");
  });
});
