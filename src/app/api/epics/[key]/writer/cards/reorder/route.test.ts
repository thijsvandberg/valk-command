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

import { PUT } from "./route";

function makeParams(key: string): { params: Promise<{ key: string }> } {
  return { params: Promise.resolve({ key }) };
}

function putReq(key: string, body: Record<string, unknown>) {
  return new Request(`http://localhost:3100/api/epics/${key}/writer/cards/reorder`, {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

// Seeds an epic session with three cards (indices 0,1,2) whose ids are c0/c1/c2.
// Card 0 links to card 2 ("blocks"), so a reorder must remap that target index.
function seedThreeCards(key: string, sessionId: string) {
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
  const rows = [
    { id: "c0", cardIndex: 0, title: "Zero", suggestedLinks: [{ targetIndex: 2, relation: "blocks", confirmed: false }] },
    { id: "c1", cardIndex: 1, title: "One", suggestedLinks: [] },
    { id: "c2", cardIndex: 2, title: "Two", suggestedLinks: [] },
  ];
  for (const r of rows) {
    testDb.insert(epicChildDraft).values({
      id: r.id,
      sessionId,
      cardIndex: r.cardIndex,
      title: r.title,
      bullets: [],
      status: "draft",
      suggestedLinks: r.suggestedLinks,
    }).run();
  }
}

function cardsByIndex(sessionId: string) {
  return testDb
    .select()
    .from(epicChildDraft)
    .where(eq(epicChildDraft.sessionId, sessionId))
    .orderBy(epicChildDraft.cardIndex)
    .all();
}

describe("PUT /api/epics/[key]/writer/cards/reorder", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("reassigns card_index to the new order", async () => {
    seedThreeCards("VPL-R1", "sess-r1");

    // Move card c2 to the front: new order [c2, c0, c1].
    const res = await PUT(putReq("VPL-R1", { orderedIds: ["c2", "c0", "c1"] }), makeParams("VPL-R1"));
    expect(res.status).toBe(200);

    const ordered = cardsByIndex("sess-r1");
    expect(ordered.map((c) => c.id)).toEqual(["c2", "c0", "c1"]);
    expect(ordered.map((c) => c.cardIndex)).toEqual([0, 1, 2]);
  });

  it("remaps suggestedLinks.targetIndex through the reorder", async () => {
    seedThreeCards("VPL-R1", "sess-r1");

    // c0 (was index 0, links to index 2 = c2). New order [c2, c0, c1] puts c2 at
    // index 0, so c0's link target must be remapped 2 -> 0.
    await PUT(putReq("VPL-R1", { orderedIds: ["c2", "c0", "c1"] }), makeParams("VPL-R1"));

    const c0 = testDb.select().from(epicChildDraft).where(eq(epicChildDraft.id, "c0")).get();
    expect(c0?.cardIndex).toBe(1);
    expect(c0?.suggestedLinks).toEqual([{ targetIndex: 0, relation: "blocks", confirmed: false }]);
  });

  it("rejects an order that is not a permutation of the current cards", async () => {
    seedThreeCards("VPL-R1", "sess-r1");

    const missing = await PUT(putReq("VPL-R1", { orderedIds: ["c0", "c1"] }), makeParams("VPL-R1"));
    expect(missing.status).toBe(400);

    const invented = await PUT(putReq("VPL-R1", { orderedIds: ["c0", "c1", "c9"] }), makeParams("VPL-R1"));
    expect(invented.status).toBe(400);

    // Untouched by the rejected requests.
    expect(cardsByIndex("sess-r1").map((c) => c.id)).toEqual(["c0", "c1", "c2"]);
  });

  it("returns 404 when no active epic session exists", async () => {
    seedTicket(testDb, { jiraKey: "VPL-R2", type: "epic", title: "Epic" });
    const res = await PUT(putReq("VPL-R2", { orderedIds: ["x"] }), makeParams("VPL-R2"));
    expect(res.status).toBe(404);
  });

  it("rejects an empty orderedIds body", async () => {
    seedThreeCards("VPL-R1", "sess-r1");
    const res = await PUT(putReq("VPL-R1", { orderedIds: [] }), makeParams("VPL-R1"));
    expect(res.status).toBe(400);
  });
});
